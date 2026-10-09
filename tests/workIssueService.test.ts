import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchProjectIssuesForPage } from "$lib/server/github/projectClient";
import { fetchIssueDescription } from "$lib/server/github/issueDetailClient";
import {
  getWorkSessionById,
  listWorkSessionsForAssignee,
  listChangeRequests,
} from "$lib/server/work/workRepository";
import { startIssueWork, stopIssueWork } from "$lib/server/work/workService";
import { listCompletionReportsForWork } from "$lib/server/completions/completionService";
import {
  loadWorkIssue,
  performIssueWorkAction,
} from "$lib/server/work/workIssueService";
import type { ProjectIssue } from "$lib/server/github/projectTypes";

vi.mock("$lib/server/env", () => ({ env: { settlementRuleV2Enabled: true } }));
vi.mock("$lib/server/github/projectClient", () => ({
  fetchProjectIssuesForPage: vi.fn(),
}));
vi.mock("$lib/server/github/issueDetailClient", () => ({
  fetchIssueDescription: vi.fn(),
}));
vi.mock("$lib/server/work/workRepository", () => ({
  getWorkSessionById: vi.fn(),
  listWorkSessionsForAssignee: vi.fn(),
  listChangeRequests: vi.fn(),
}));
vi.mock("$lib/server/work/workService", () => ({
  startIssueWork: vi.fn(),
  stopIssueWork: vi.fn(),
}));
vi.mock("$lib/server/completions/completionService", () => ({
  listCompletionReportsForWork: vi.fn(),
  reportIssueCompletion: vi.fn(),
  withdrawIssueCompletion: vi.fn(),
}));

const ref = { repository: "techguide-jp/example", issueNumber: 12 };
const user = { login: "worker", name: null, avatarUrl: null, isAdmin: false };
const issue: ProjectIssue = {
  repository: ref.repository,
  number: 12,
  title: "依頼",
  assignees: ["worker"],
  projectItemId: "item",
  state: "OPEN",
  url: "https://github.com/techguide-jp/example/issues/12",
  createdAt: "",
  closedAt: null,
  status: "Todo",
  rewardMode: "固定",
  fixedRewardYen: 1000,
  extraCapYen: null,
  hourlyRateYen: null,
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(fetchProjectIssuesForPage).mockResolvedValue({
    issues: [issue],
    projectFetchError: null,
    health: {
      title: "Project",
      missingFields: [],
      invalidFields: [],
      availableFields: [],
    },
  });
  vi.mocked(fetchIssueDescription).mockResolvedValue({
    body: "## 完了条件\nPRを提出",
    labels: [],
  });
  vi.mocked(listWorkSessionsForAssignee).mockResolvedValue([]);
  vi.mocked(listChangeRequests).mockResolvedValue([]);
  vi.mocked(listCompletionReportsForWork).mockResolvedValue([]);
});

describe("案件詳細の権限と既存稼働処理", () => {
  it("担当外のユーザーには本文やログを取得しない", async () => {
    expect(await loadWorkIssue(ref, { ...user, login: "other" })).toMatchObject(
      { ok: false, status: 404 },
    );
    expect(fetchIssueDescription).not.toHaveBeenCalled();
    expect(listWorkSessionsForAssignee).not.toHaveBeenCalled();
  });
  it("管理者は担当外でも内容を閲覧できる", async () => {
    expect(
      await loadWorkIssue(ref, { ...user, login: "admin", isAdmin: true }),
    ).toMatchObject({ ok: true, isAssignee: false });
  });
  it("管理者でも担当外の開始は拒否する", async () => {
    expect(
      await performIssueWorkAction(
        ref,
        { ...user, login: "admin", isAdmin: true },
        "start",
        new FormData(),
      ),
    ).toMatchObject({ ok: false, status: 403 });
    expect(startIssueWork).not.toHaveBeenCalled();
  });
  it("Project取得失敗を案件不存在として扱わない", async () => {
    vi.mocked(fetchProjectIssuesForPage).mockResolvedValue({
      issues: [],
      projectFetchError: "権限不足",
      health: {
        title: "Project",
        missingFields: [],
        invalidFields: [],
        availableFields: [],
      },
    });
    expect(await loadWorkIssue(ref, user)).toMatchObject({
      ok: false,
      status: 503,
    });
    expect(fetchIssueDescription).not.toHaveBeenCalled();
  });
  it("本文取得失敗時も報酬とGitHubへの導線を表示できる", async () => {
    vi.mocked(fetchIssueDescription).mockRejectedValue(new Error("rate limit"));
    expect(await loadWorkIssue(ref, user)).toMatchObject({
      ok: true,
      body: "",
      descriptionError: expect.any(String),
      issue,
    });
  });
  it("POSTされた別案件の指定を採用せずURLの案件を開始する", async () => {
    const form = new FormData();
    form.set("repository", "other/repo");
    form.set("issueNumber", "999");
    vi.mocked(startIssueWork).mockResolvedValue({ ok: true });
    expect(
      await performIssueWorkAction(ref, user, "start", form),
    ).toMatchObject({ ok: true });
    const sent = vi.mocked(startIssueWork).mock.calls[0][0];
    expect(sent.get("repository")).toBe(ref.repository);
    expect(sent.get("issueNumber")).toBe("12");
  });
  it("別案件の稼働ログを直接POSTしても終了できない", async () => {
    vi.mocked(getWorkSessionById).mockResolvedValue({
      assigneeLogin: "worker",
      repository: ref.repository,
      issueNumber: 99,
    } as NonNullable<Awaited<ReturnType<typeof getWorkSessionById>>>);
    const form = new FormData();
    form.set("sessionId", "00000000-0000-4000-8000-000000000001");
    expect(await performIssueWorkAction(ref, user, "stop", form)).toMatchObject(
      { ok: false, status: 400 },
    );
    expect(stopIssueWork).not.toHaveBeenCalled();
  });
});
