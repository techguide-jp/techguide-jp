import type { IssueCompletionReport } from "$lib/server/db/schema";

export const completionReport = (
  overrides: Partial<IssueCompletionReport> = {},
): IssueCompletionReport => ({
  id: "20000000-0000-4000-8000-000000000001",
  projectItemId: "item-1",
  repository: "techguide-jp/example",
  issueNumber: 10,
  issueTitle: "担当変更時の固定報酬",
  issueUrl: "https://github.com/techguide-jp/example/issues/10",
  assigneeLogin: "worker",
  settlementMonth: "2026-08",
  reportedAt: new Date("2026-08-31T14:00:00Z"),
  rewardMode: "ハイブリッド",
  fixedRewardYen: 50_000,
  source: "worker",
  evidenceUrl: null,
  evidenceNote: null,
  invalidatedAt: null,
  invalidatedBy: null,
  invalidationReason: null,
  eligibilityConfirmedAt: null,
  createdBy: "worker",
  createdAt: new Date("2026-08-31T14:00:00Z"),
  ...overrides,
});
