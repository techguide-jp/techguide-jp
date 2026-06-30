import { describe, expect, it } from "vitest";
import type {
  WorkLogChangeRequest,
  WorkerProfile,
  WorkSession,
} from "$lib/server/db/schema";
import type {
  ProjectFieldHealth,
  ProjectIssue,
} from "$lib/server/github/projectTypes";
import { buildAdminWorkDashboard } from "$lib/server/admin/adminWorkService";

const health: ProjectFieldHealth = {
  title: "外注管理",
  missingFields: [],
  invalidFields: [],
  availableFields: [],
};

const issue = (overrides: Partial<ProjectIssue>): ProjectIssue => ({
  projectItemId: "item-1",
  repository: "techguide-jp/akademy_fes",
  number: 501,
  title: "Issue",
  state: "OPEN",
  url: "https://github.com/techguide-jp/akademy_fes/issues/501",
  createdAt: "2026-06-18T00:00:00Z",
  closedAt: null,
  assignees: ["tashua314"],
  status: "Todo",
  rewardMode: "固定",
  fixedRewardYen: 1000,
  extraCapYen: null,
  hourlyRateYen: null,
  ...overrides,
});

const session = (overrides: Partial<WorkSession>): WorkSession => ({
  id: "00000000-0000-4000-8000-000000000001",
  assigneeLogin: "tashua314",
  repository: "techguide-jp/akademy_fes",
  issueNumber: 501,
  issueTitle: "Issue",
  startedAt: new Date("2026-06-18T00:00:00Z"),
  endedAt: null,
  createdBy: "tashua314",
  createdAt: new Date("2026-06-18T00:00:00Z"),
  updatedAt: new Date("2026-06-18T00:00:00Z"),
  excludedAt: null,
  excludeReason: null,
  ...overrides,
});

const request = (
  overrides: Partial<WorkLogChangeRequest>,
): WorkLogChangeRequest => ({
  id: "00000000-0000-4000-8000-000000000101",
  requestType: "add",
  status: "pending",
  assigneeLogin: "pending-user",
  repository: "techguide-jp/akademy_fes",
  issueNumber: 502,
  issueTitle: "Pending",
  targetSessionId: null,
  requestedStartedAt: new Date("2026-06-18T01:00:00Z"),
  requestedEndedAt: new Date("2026-06-18T02:00:00Z"),
  reason: "押し忘れ",
  requestedBy: "pending-user",
  reviewedBy: null,
  reviewedAt: null,
  reviewNote: null,
  createdAt: new Date("2026-06-18T03:00:00Z"),
  ...overrides,
});

const profile = (overrides: Partial<WorkerProfile>): WorkerProfile => ({
  login: "tashua314",
  displayName: "たしゅあ",
  skills: ["SvelteKit"],
  specialtyNote: "",
  availabilityNote: "",
  selfAssignmentNote: "",
  adminNote: "",
  adminNoteUpdatedBy: null,
  adminNoteUpdatedAt: null,
  createdAt: new Date("2026-06-18T00:00:00Z"),
  updatedAt: new Date("2026-06-18T00:00:00Z"),
  ...overrides,
});

describe("buildAdminWorkDashboard", () => {
  it("稼働中・未着手・未担当を分類する", () => {
    const dashboard = buildAdminWorkDashboard({
      health,
      projectFetchError: null,
      issues: [
        issue({ number: 501, assignees: ["tashua314"], title: "稼働中" }),
        issue({ number: 502, assignees: [], title: "未担当" }),
        issue({ number: 503, assignees: ["yuta"], title: "未着手" }),
        issue({
          number: 504,
          assignees: [],
          title: "完了",
          state: "CLOSED",
          status: "Done",
        }),
      ],
      openSessions: [session({ issueNumber: 501, issueTitle: "稼働中" })],
      pendingRequests: [request({ assigneeLogin: "pending-user" })],
      profiles: [profile({ login: "tashua314", displayName: "たしゅあ" })],
    });

    expect(dashboard.activeWorkers.map((worker) => worker.login)).toEqual([
      "tashua314",
    ]);
    expect(dashboard.notStartedIssueSummary.total).toBe(2);
    expect(dashboard.unassignedIssueSummary.total).toBe(1);
    expect(dashboard.notStartedIssueSummary.byAssignee).toContainEqual({
      label: "yuta",
      count: 1,
    });
    expect(dashboard.notStartedIssueSummary.byAssignee).toContainEqual({
      label: "未担当",
      count: 1,
    });
    expect(
      dashboard.workers.find((worker) => worker.login === "yuta")?.displayName,
    ).toBe("yuta");
    expect(
      dashboard.workers.find((worker) => worker.login === "pending-user"),
    ).toBeTruthy();
  });

  it("プロフィールがある作業者は表示名とスキルを使う", () => {
    const dashboard = buildAdminWorkDashboard({
      health,
      projectFetchError: null,
      issues: [issue({ assignees: ["tashua314"] })],
      openSessions: [],
      pendingRequests: [],
      profiles: [profile({ skills: ["SvelteKit", "Drizzle"] })],
    });

    expect(dashboard.workers[0]).toMatchObject({
      login: "tashua314",
      displayName: "たしゅあ",
      skills: ["SvelteKit", "Drizzle"],
      issueSummary: expect.objectContaining({
        total: 1,
        todo: 1,
      }),
    });
  });

  it("ログイン済みでまだ作業していない作業者も表示する", () => {
    const dashboard = buildAdminWorkDashboard({
      health,
      projectFetchError: null,
      issues: [],
      openSessions: [],
      pendingRequests: [],
      profiles: [
        profile({
          login: "new-worker",
          displayName: "新規作業者",
          skills: ["UI"],
        }),
      ],
    });

    expect(dashboard.workers).toHaveLength(1);
    expect(dashboard.activeWorkers).toHaveLength(0);
    expect(dashboard.workers[0]).toMatchObject({
      login: "new-worker",
      displayName: "新規作業者",
      skills: ["UI"],
      issueSummary: expect.objectContaining({
        total: 0,
      }),
      openSessions: [],
    });
  });
});
