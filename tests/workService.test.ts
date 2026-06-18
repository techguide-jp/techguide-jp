import { beforeEach, describe, expect, it, vi } from "vitest";
import { setProjectItemStatus } from "$lib/server/github/projectClient";
import { recordProjectStatusSyncFailure } from "$lib/server/github/statusSyncService";
import type { ProjectIssue } from "$lib/server/github/projectTypes";
import type { WorkSession } from "$lib/server/db/schema";
import {
  createChangeRequest,
  createWorkSession,
  findOpenWorkSession,
  getWorkSessionById,
} from "$lib/server/work/workRepository";
import {
  requestWorkLogChange,
  startIssueWork,
} from "$lib/server/work/workService";

vi.mock("$lib/server/github/projectClient", () => ({
  setProjectItemStatus: vi.fn(),
}));

vi.mock("$lib/server/github/statusSyncService", () => ({
  recordProjectStatusSyncFailure: vi.fn(),
}));

vi.mock("$lib/server/work/workRepository", () => ({
  createChangeRequest: vi.fn(),
  createWorkSession: vi.fn(),
  endWorkSession: vi.fn(),
  findOpenWorkSession: vi.fn(),
  getWorkSessionById: vi.fn(),
}));

const issue = (overrides: Partial<ProjectIssue> = {}): ProjectIssue => ({
  projectItemId: "item-1",
  repository: "techguide-jp/techguide-jp",
  number: 2,
  title: "稼働精算ができるようにする",
  state: "OPEN",
  url: "https://github.com/techguide-jp/techguide-jp/issues/2",
  createdAt: "2026-06-01T00:00:00Z",
  closedAt: null,
  assignees: ["tashua314"],
  status: "Todo",
  rewardMode: "固定",
  fixedRewardYen: 1000,
  extraCapYen: null,
  hourlyRateYen: null,
  ...overrides,
});

const issueFormData = (): FormData => {
  const data = new FormData();
  data.set("repository", "techguide-jp/techguide-jp");
  data.set("issueNumber", "2");
  return data;
};

const changeFormData = (
  requestType: "edit" | "exclude",
  targetSessionId: string,
): FormData => {
  const data = new FormData();
  data.set("requestType", requestType);
  data.set("issueKey", "techguide-jp/techguide-jp#2");
  data.set("targetSessionId", targetSessionId);
  data.set("reason", "押し忘れ");
  if (requestType === "edit") {
    data.set("requestedStartedAt", "2026-06-18T09:00");
    data.set("requestedEndedAt", "2026-06-18T10:00");
  }
  return data;
};

const session = (overrides: Partial<WorkSession> = {}): WorkSession => ({
  id: "00000000-0000-4000-8000-000000000001",
  assigneeLogin: "tashua314",
  repository: "techguide-jp/techguide-jp",
  issueNumber: 2,
  issueTitle: "稼働精算ができるようにする",
  startedAt: new Date("2026-06-18T00:20:00Z"),
  endedAt: null,
  createdBy: "tashua314",
  createdAt: new Date("2026-06-18T00:20:00Z"),
  updatedAt: new Date("2026-06-18T00:20:00Z"),
  excludedAt: null,
  excludeReason: null,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(findOpenWorkSession).mockResolvedValue(null);
  vi.mocked(createWorkSession).mockResolvedValue(
    {} as Awaited<ReturnType<typeof createWorkSession>>,
  );
  vi.mocked(createChangeRequest).mockResolvedValue(
    {} as Awaited<ReturnType<typeof createChangeRequest>>,
  );
  vi.mocked(getWorkSessionById).mockResolvedValue(null);
  vi.mocked(setProjectItemStatus).mockResolvedValue(undefined);
  vi.mocked(recordProjectStatusSyncFailure).mockResolvedValue(undefined);
});

describe("startIssueWork", () => {
  it("TodoのIssueで稼働開始したらStatusをIn Progressに更新する", async () => {
    const result = await startIssueWork(
      issueFormData(),
      [issue()],
      "tashua314",
    );

    expect(result.ok).toBe(true);
    expect(createWorkSession).toHaveBeenCalledOnce();
    expect(setProjectItemStatus).toHaveBeenCalledWith("item-1", "In Progress");
    expect(result.ok && result.message).toContain(
      "StatusをIn Progressに更新しました",
    );
  });

  it("Todo以外のIssueではStatusを更新しない", async () => {
    const result = await startIssueWork(
      issueFormData(),
      [issue({ status: "In Progress" })],
      "tashua314",
    );

    expect(result.ok).toBe(true);
    expect(createWorkSession).toHaveBeenCalledOnce();
    expect(setProjectItemStatus).not.toHaveBeenCalled();
  });

  it("Status更新が失敗しても稼働開始は成功として扱う", async () => {
    vi.mocked(setProjectItemStatus).mockRejectedValue(
      new Error("GitHub error"),
    );

    const result = await startIssueWork(
      issueFormData(),
      [issue()],
      "tashua314",
    );

    expect(result.ok).toBe(true);
    expect(createWorkSession).toHaveBeenCalledOnce();
    expect(setProjectItemStatus).toHaveBeenCalledWith("item-1", "In Progress");
    expect(recordProjectStatusSyncFailure).toHaveBeenCalledWith(
      expect.objectContaining({ projectItemId: "item-1" }),
      "tashua314",
      "In Progress",
      expect.any(Error),
    );
    expect(result.ok && result.message).toContain("Status更新に失敗しました");
  });
});

describe("requestWorkLogChange datetime-local", () => {
  it("追加申請のdatetime-localをJSTとして保存する", async () => {
    const data = new FormData();
    data.set("requestType", "add");
    data.set("issueKey", "techguide-jp/techguide-jp#2");
    data.set("requestedStartedAt", "2026-06-18T09:00");
    data.set("requestedEndedAt", "2026-06-18T10:00");
    data.set("reason", "押し忘れ");

    const result = await requestWorkLogChange(data, [issue()], "tashua314");

    expect(result.ok).toBe(true);
    expect(createChangeRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        requestedStartedAt: new Date("2026-06-18T00:00:00.000Z"),
        requestedEndedAt: new Date("2026-06-18T01:00:00.000Z"),
      }),
    );
  });
});

describe("requestWorkLogChange", () => {
  it("計測中ログの修正申請を拒否する", async () => {
    vi.mocked(getWorkSessionById).mockResolvedValue(session());

    const result = await requestWorkLogChange(
      changeFormData("edit", "00000000-0000-4000-8000-000000000001"),
      [issue()],
      "tashua314",
    );

    expect(result.ok).toBe(false);
    expect(!result.ok && result.message).toContain("計測中のログ");
    expect(createChangeRequest).not.toHaveBeenCalled();
  });

  it("計測中ログの除外申請を拒否する", async () => {
    vi.mocked(getWorkSessionById).mockResolvedValue(session());

    const result = await requestWorkLogChange(
      changeFormData("exclude", "00000000-0000-4000-8000-000000000001"),
      [issue()],
      "tashua314",
    );

    expect(result.ok).toBe(false);
    expect(!result.ok && result.message).toContain("計測中のログ");
    expect(createChangeRequest).not.toHaveBeenCalled();
  });
});
