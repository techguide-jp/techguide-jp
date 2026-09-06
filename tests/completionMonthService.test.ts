import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assignCompletionMonth } from "$lib/server/completions/completionMonthService";
import { getPaymentRow } from "$lib/server/payments/paymentRepository";
import {
  confirmCompletionEligibility,
  replaceActiveCompletionReport,
} from "$lib/server/completions/completionRepository";
import type { ProjectIssue } from "$lib/server/github/projectTypes";

vi.mock("$lib/server/payments/paymentRepository", () => ({
  getPaymentRow: vi.fn(),
}));
vi.mock("$lib/server/completions/completionBackfillService", () => ({
  listCompletionBackfillCandidates: vi.fn(),
}));
vi.mock("$lib/server/completions/completionRepository", () => ({
  confirmCompletionEligibility: vi.fn(),
  replaceActiveCompletionReport: vi.fn(),
}));

const issue: ProjectIssue = {
  projectItemId: "item-1",
  repository: "techguide-jp/example",
  number: 10,
  title: "完了確認",
  state: "CLOSED",
  status: "Done",
  url: "https://github.com/techguide-jp/example/issues/10",
  createdAt: "2026-08-01T00:00:00Z",
  closedAt: "2026-09-02T00:00:00Z",
  assignees: ["worker"],
  rewardMode: "固定",
  fixedRewardYen: 30000,
  extraCapYen: null,
  hourlyRateYen: null,
};
const form = (month = "2026-08") => {
  const data = new FormData();
  data.set("repository", issue.repository);
  data.set("issueNumber", "10");
  data.set("assigneeLogin", "worker");
  data.set("settlementMonth", month);
  return data;
};

describe("管理者の精算月指定", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-05T15:00:00Z"));
    vi.mocked(getPaymentRow).mockResolvedValue(null);
    vi.mocked(replaceActiveCompletionReport).mockImplementation(
      async (input) => input as never,
    );
  });
  afterEach(() => vi.useRealTimers());

  it("Closed月・登録月と異なる管理者指定月を保存する", async () => {
    expect(await assignCompletionMonth(form(), [issue], "admin")).toEqual({
      ok: true,
      settlementMonth: "2026-08",
    });
    expect(replaceActiveCompletionReport).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        settlementMonth: "2026-08",
        reportedAt: new Date("2026-09-05T15:00:00Z"),
        source: "admin_confirmation",
        createdBy: "admin",
        assigneeLogin: "worker",
        evidenceUrl: issue.url,
        fixedRewardYen: 30000,
      }),
    );
    expect(confirmCompletionEligibility).toHaveBeenCalledOnce();
  });
  it.each([
    { state: "OPEN" as const, status: "Done" },
    { state: "CLOSED" as const, status: "In Progress" },
    { assignees: ["worker", "other"] },
    { assignees: ["replacement"] },
    { fixedRewardYen: null },
    { rewardMode: null },
  ])("完了条件・担当者・報酬の不整合を拒否する: %o", async (change) => {
    expect(
      (await assignCompletionMonth(form(), [{ ...issue, ...change }], "admin"))
        .ok,
    ).toBe(false);
    expect(replaceActiveCompletionReport).not.toHaveBeenCalled();
  });
  it.each(["2026-13", "2026-10", "", "2026-08-01"])(
    "不正な月・未来の月を拒否する: %s",
    async (month) => {
      expect(
        (await assignCompletionMonth(form(month), [issue], "admin")).ok,
      ).toBe(false);
      expect(replaceActiveCompletionReport).not.toHaveBeenCalled();
    },
  );
  it("支払い済み月への登録を拒否する", async () => {
    vi.mocked(getPaymentRow).mockResolvedValue({ status: "paid" } as never);
    expect(await assignCompletionMonth(form(), [issue], "admin")).toEqual({
      ok: false,
      message: "支払い済み月には精算月を指定できません。",
    });
    expect(replaceActiveCompletionReport).not.toHaveBeenCalled();
  });
});
