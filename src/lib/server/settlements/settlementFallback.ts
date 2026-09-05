import type {
  MonthlySettlementSnapshot,
  MonthlyWorkSubmission,
} from "$lib/server/db/schema";
import type { SettlementSummary } from "$lib/server/settlements/settlementTypes";
import { restoreSettlementSummary } from "$lib/server/settlements/settlementSnapshotRestore";

export const restoreSettlementFallback = (
  month: string,
  summaries: SettlementSummary[],
  snapshots: MonthlySettlementSnapshot[],
  submissions: MonthlyWorkSubmission[],
): SettlementSummary[] => {
  const currentByLogin = new Map(
    summaries.map((summary) => [summary.assigneeLogin, summary]),
  );
  const snapshotByLogin = new Map(
    snapshots.map((snapshot) => [snapshot.assigneeLogin, snapshot]),
  );
  const submissionByLogin = new Map(
    submissions.map((submission) => [submission.assigneeLogin, submission]),
  );
  const logins = new Set([
    ...currentByLogin.keys(),
    ...snapshotByLogin.keys(),
    ...submissionByLogin.keys(),
  ]);
  return [...logins].sort().map((assigneeLogin) => {
    const current = currentByLogin.get(assigneeLogin);
    const snapshot = snapshotByLogin.get(assigneeLogin);
    const submission = submissionByLogin.get(assigneeLogin);
    const saved = snapshot ?? submission;
    const restored = saved ? restoreSettlementSummary(saved.snapshot) : null;
    if (
      restored &&
      restored.month === month &&
      restored.assigneeLogin === assigneeLogin
    ) {
      return {
        ...restored,
        dataSource: snapshot ? ("approved" as const) : ("submitted" as const),
        // GitHubとは独立して取得できた未処理申請は、保存時点の空一覧に置き換えない。
        pendingRequests: current?.pendingRequests ?? [],
        completionReports: current?.completionReports,
        supplementalPayments: current?.supplementalPayments,
      };
    }
    // 保存結果がない・壊れている場合は0円確定とせず、表示不能を明示する。
    return {
      month,
      assigneeLogin,
      fixedRewardYen: 0,
      timedRewardYen: 0,
      taxExcludedYen: 0,
      taxYen: 0,
      taxIncludedYen: 0,
      lines: [],
      pendingRequests: current?.pendingRequests ?? [],
      unsettledProjectIssues: [],
      unsettledIssueSessions: current?.unsettledIssueSessions ?? [],
      blockingReasons: [],
      approvalRequired: true,
      completionReports: current?.completionReports,
      supplementalPayments: current?.supplementalPayments,
      dataSource: "unavailable" as const,
    };
  });
};
