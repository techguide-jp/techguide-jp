import { addMonths } from "$lib/month";
import type {
  IssueCompletionReport,
  MonthlySettlementSnapshot,
  WorkLogChangeRequest,
  WorkSession,
} from "$lib/server/db/schema";
import type { ProjectIssue } from "$lib/server/github/projectTypes";
import { calculateTimedReward } from "$lib/server/money";
import {
  jstMonthRangeUtc,
  minutesOverlappingRange,
  toJstMonth,
} from "$lib/server/time";
import { applyApprovedChangeRequests } from "$lib/server/settlements/settlementCalculator";
import { settlementSnapshotTimedRewards } from "$lib/server/settlements/settlementSnapshot";

/** 未申請月も含めて累計する。承認済み月はログの再計算で確定額を動かさない。 */
export const buildLifetimeTimedRewards = (input: {
  issues: ProjectIssue[];
  sessions: WorkSession[];
  requests: WorkLogChangeRequest[];
  snapshots: MonthlySettlementSnapshot[];
  frozenHourlyRates: Map<string, number | null>;
  completionReports: IssueCompletionReport[];
  settledCompletionReportAssignees: Map<string, Set<string>>;
}): Map<string, number> => {
  const totals = new Map<string, number>();
  const issueByKey = new Map(
    input.issues.map((issue) => [`${issue.repository}#${issue.number}`, issue]),
  );
  const approvedMonths = new Set(
    input.snapshots.map(
      (snapshot) => `${snapshot.month}:${snapshot.assigneeLogin}`,
    ),
  );
  // 未承認月も月次計算と同じ報酬方式を使う。承認済み月の追加支払いは下で確定額を優先する。
  const reportedModes = new Map(
    input.completionReports
      .filter(
        (report) =>
          !report.invalidatedAt &&
          report.eligibilityConfirmedAt &&
          ![
            ...(input.settledCompletionReportAssignees.get(report.id) ?? []),
          ].some((login) => login !== report.assigneeLogin),
      )
      .map((report) => [
        `${report.repository}#${report.issueNumber}:${report.settlementMonth}:${report.assigneeLogin}`,
        report.rewardMode,
      ]),
  );
  const add = (key: string, amount: number) =>
    totals.set(key, (totals.get(key) ?? 0) + amount);
  for (const snapshot of input.snapshots) {
    for (const [key, amount] of settlementSnapshotTimedRewards(
      snapshot.snapshot,
    ))
      add(key, amount);
  }
  for (const session of applyApprovedChangeRequests(
    input.sessions,
    input.requests,
  )) {
    if (
      !session.endedAt ||
      session.excludedAt ||
      session.startedAt >= session.endedAt
    )
      continue;
    const key = `${session.repository}#${session.issueNumber}`;
    const issue = issueByKey.get(key);
    if (!issue) continue;
    const frozenRate = input.frozenHourlyRates.get(
      `${key}#${session.assigneeLogin}`,
    );
    const rate = frozenRate === undefined ? issue.hourlyRateYen : frozenRate;
    if (rate === null) continue;
    const lastMonth = toJstMonth(new Date(session.endedAt.getTime() - 1));
    for (
      let month = toJstMonth(session.startedAt);
      month <= lastMonth;
      month = addMonths(month, 1)
    ) {
      if (approvedMonths.has(`${month}:${session.assigneeLogin}`)) continue;
      const rewardMode =
        reportedModes.get(`${key}:${month}:${session.assigneeLogin}`) ??
        issue.rewardMode;
      if (rewardMode !== "ハイブリッド") continue;
      const minutes = minutesOverlappingRange(
        session.startedAt,
        session.endedAt,
        jstMonthRangeUtc(month),
      );
      add(key, calculateTimedReward(minutes, rate));
    }
  }
  return totals;
};
