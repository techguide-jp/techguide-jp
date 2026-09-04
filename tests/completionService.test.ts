import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectIssue } from "$lib/server/github/projectTypes";
import { getPaymentRow } from "$lib/server/payments/paymentRepository";
import { findOpenWorkSession } from "$lib/server/work/workRepository";
import {
  confirmCompletionEligibility,
  getActiveCompletionReport,
  listActiveCompletionReports,
  replaceActiveCompletionReport,
} from "$lib/server/completions/completionRepository";
import {
  backfillIssueCompletion,
  reconcileCompletionReports,
  reportIssueCompletion,
} from "$lib/server/completions/completionService";

vi.mock("$lib/server/payments/paymentRepository", () => ({
  getPaymentRow: vi.fn(),
}));
vi.mock("$lib/server/work/workRepository", () => ({
  findOpenWorkSession: vi.fn(),
}));
vi.mock("$lib/server/audit/auditRepository", () => ({
  createAuditLog: vi.fn(),
}));
vi.mock("$lib/server/completions/completionRepository", () => ({
  confirmCompletionEligibility: vi.fn(),
  getActiveCompletionReport: vi.fn(),
  invalidateActiveCompletionReport: vi.fn(),
  listActiveCompletionReports: vi.fn(),
  listCompletionReportsForAssignee: vi.fn(),
  replaceActiveCompletionReport: vi.fn(),
}));

const issue: ProjectIssue = {
  projectItemId: "item-1",
  repository: "techguide-jp/example",
  number: 10,
  title: "完了報告",
  state: "OPEN",
  url: "https://github.com/techguide-jp/example/issues/10",
  createdAt: "2026-08-01T00:00:00Z",
  closedAt: null,
  assignees: ["worker"],
  status: "In Progress",
  rewardMode: "ハイブリッド",
  fixedRewardYen: 50_000,
  extraCapYen: 20_000,
  hourlyRateYen: 5_000,
};

describe("completionService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-31T14:30:00Z"));
    vi.mocked(findOpenWorkSession).mockResolvedValue(null);
    vi.mocked(getActiveCompletionReport).mockResolvedValue(null);
    vi.mocked(getPaymentRow).mockResolvedValue(null);
    vi.mocked(replaceActiveCompletionReport).mockImplementation(
      async (input) =>
        ({
          ...input,
          evidenceUrl: input.evidenceUrl ?? null,
          evidenceNote: input.evidenceNote ?? null,
          invalidatedAt: null,
          invalidatedBy: null,
          invalidationReason: null,
          eligibilityConfirmedAt: null,
          createdAt: new Date(),
        }) as never,
    );
  });

  afterEach(() => vi.useRealTimers());

  it("作業者の完了報告はサーバー時刻のJST月と報酬スナップショットを保存する", async () => {
    const formData = new FormData();
    formData.set("repository", issue.repository);
    formData.set("issueNumber", String(issue.number));

    const result = await reportIssueCompletion(formData, [issue], "worker");

    expect(result.ok).toBe(true);
    expect(replaceActiveCompletionReport).toHaveBeenCalledWith(
      expect.objectContaining({
        repository: issue.repository,
        issueNumber: issue.number,
        assigneeLogin: "worker",
        settlementMonth: "2026-08",
        reportedAt: new Date("2026-08-31T14:30:00Z"),
        rewardMode: "ハイブリッド",
        fixedRewardYen: 50_000,
        source: "worker",
      }),
    );
  });

  it("支払い済み月への証跡移行を拒否する", async () => {
    vi.mocked(getPaymentRow).mockResolvedValue({ status: "paid" } as never);
    const formData = new FormData();
    formData.set("repository", issue.repository);
    formData.set("issueNumber", String(issue.number));
    formData.set("assigneeLogin", "worker");
    formData.set("reportedAt", "2026-08-20T12:00");
    formData.set("evidenceUrl", "https://github.com/example/review/1");
    formData.set("evidenceNote", "レビュー依頼済み");

    const result = await backfillIssueCompletion(formData, [issue], "admin");

    expect(result).toEqual({
      ok: false,
      message: "支払い済み月へ完了報告は追加できません。",
    });
    expect(replaceActiveCompletionReport).not.toHaveBeenCalled();
  });

  it("closedかつDoneだけをGitHub完了確認する", async () => {
    const completion = {
      repository: issue.repository,
      issueNumber: issue.number,
      eligibilityConfirmedAt: null,
    };
    vi.mocked(listActiveCompletionReports).mockResolvedValue([
      completion as never,
    ]);
    vi.mocked(confirmCompletionEligibility).mockResolvedValue("base");

    const result = await reconcileCompletionReports([
      { ...issue, state: "CLOSED", status: "Done" },
    ]);

    expect(confirmCompletionEligibility).toHaveBeenCalledOnce();
    expect(result).toEqual({ base: 1, supplemental: 0 });
  });

  it("複数担当Issueは完了報告を対象化しない", async () => {
    const completion = {
      repository: issue.repository,
      issueNumber: issue.number,
      eligibilityConfirmedAt: null,
    };
    vi.mocked(listActiveCompletionReports).mockResolvedValue([
      completion as never,
    ]);

    const result = await reconcileCompletionReports([
      {
        ...issue,
        state: "CLOSED",
        status: "Done",
        assignees: ["worker", "replacement"],
      },
    ]);

    expect(confirmCompletionEligibility).not.toHaveBeenCalled();
    expect(result).toEqual({ base: 0, supplemental: 0 });
  });
});
