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
import { restoreSettlementSummary } from "$lib/server/settlements/settlementSnapshotRestore";
import type { TimedRewardCalculation } from "$lib/timedReward";

export type TimedRewardAllocation = TimedRewardCalculation & {
  payableYen: number;
};
export const timedRewardKey = (
  month: string,
  repository: string,
  number: number,
  login: string,
): string => `${month}:${repository}#${number}:${login}`;

/** 確定済み金額を確保し、未承認の稼働へ時系列で上限残額を配分する。 */
export const allocateTimedRewards = (input: {
  issues: ProjectIssue[];
  sessions: WorkSession[];
  requests: WorkLogChangeRequest[];
  snapshots: MonthlySettlementSnapshot[];
  frozenHourlyRates: Map<string, number | null>;
  completionReports: IssueCompletionReport[];
  settledCompletionReportAssignees: Map<string, Set<string>>;
}): Map<string, TimedRewardAllocation> => {
  const result = new Map<string, TimedRewardAllocation>();
  const usedByIssue = new Map<string, number>();
  const issueByKey = new Map(
    input.issues.map((issue) => [`${issue.repository}#${issue.number}`, issue]),
  );
  const approvedMonths = new Set(
    input.snapshots.map(
      (snapshot) => `${snapshot.month}:${snapshot.assigneeLogin}`,
    ),
  );
  for (const snapshot of input.snapshots) {
    const summary = restoreSettlementSummary(snapshot.snapshot);
    // 不明な確定額を0円扱いして上限を再配分すると二重払いになるため、計算を止める。
    if (
      !summary ||
      summary.month !== snapshot.month ||
      summary.assigneeLogin !== snapshot.assigneeLogin
    )
      throw new Error(
        "承認済み精算を復元できないため、時間報酬の上限残額を確認できません。",
      );
    for (const line of summary.lines) {
      const key = `${line.issue.repository}#${line.issue.number}`;
      usedByIssue.set(key, (usedByIssue.get(key) ?? 0) + line.timedRewardYen);
    }
  }
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
        timedRewardKey(
          report.settlementMonth,
          report.repository,
          report.issueNumber,
          report.assigneeLogin,
        ),
        report.rewardMode,
      ]),
  );
  const fragments: Array<{
    month: string;
    session: WorkSession;
    amount: number;
    issue: ProjectIssue;
  }> = [];
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
    const issueKey = `${session.repository}#${session.issueNumber}`;
    const issue = issueByKey.get(issueKey);
    if (!issue) continue;
    const frozenRate = input.frozenHourlyRates.get(
      `${issueKey}#${session.assigneeLogin}`,
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
      const mode =
        reportedModes.get(
          timedRewardKey(
            month,
            session.repository,
            session.issueNumber,
            session.assigneeLogin,
          ),
        ) ?? issue.rewardMode;
      if (mode !== "ハイブリッド") continue;
      const minutes = minutesOverlappingRange(
        session.startedAt,
        session.endedAt,
        jstMonthRangeUtc(month),
      );
      fragments.push({
        month,
        session,
        issue,
        amount: calculateTimedReward(minutes, rate),
      });
    }
  }
  fragments.sort(
    (a, b) =>
      a.month.localeCompare(b.month) ||
      a.session.startedAt.getTime() - b.session.startedAt.getTime() ||
      a.session.assigneeLogin.localeCompare(b.session.assigneeLogin) ||
      a.session.id.localeCompare(b.session.id),
  );
  for (const { month, session, issue, amount } of fragments) {
    const issueKey = `${issue.repository}#${issue.number}`;
    const used = usedByIssue.get(issueKey) ?? 0;
    const payable =
      issue.extraCapYen === null
        ? amount
        : Math.min(amount, Math.max(0, issue.extraCapYen - used));
    usedByIssue.set(issueKey, used + payable);
    const key = timedRewardKey(
      month,
      issue.repository,
      issue.number,
      session.assigneeLogin,
    );
    const previous = result.get(key);
    result.set(key, {
      uncappedYen: (previous?.uncappedYen ?? 0) + amount,
      payableYen: (previous?.payableYen ?? 0) + payable,
      capYen: issue.extraCapYen,
    });
  }
  return result;
};
