import { addMonths, formatMonthLabel } from "$lib/month";
import type {
  ChangeRequestPreview,
  PreviewAmounts,
} from "$lib/changeRequestPreview";
import type {
  IssueCompletionReport,
  MonthlySettlementSnapshot,
  SupplementalPayment,
  WorkLogChangeRequest,
  WorkSession,
} from "$lib/server/db/schema";
import type { ProjectIssue } from "$lib/server/github/projectTypes";
import { toJstMonth } from "$lib/server/time";
import {
  applyApprovedChangeRequests,
  buildSettlementSummaries,
} from "./settlementCalculator";
import { buildSettlementSummariesV2 } from "./settlementCalculatorV2";
import { allocateTimedRewards } from "./settlementTimedRewards";
import { restoreSettlementSummary } from "./settlementSnapshotRestore";
import type { SettlementSummary } from "./settlementTypes";

type PreviewInput = {
  month: string;
  ruleVersion: 1 | 2;
  visibleRequests: WorkLogChangeRequest[];
  issues: ProjectIssue[];
  sessions: WorkSession[];
  requests: WorkLogChangeRequest[];
  snapshots: MonthlySettlementSnapshot[];
  completionReports: IssueCompletionReport[];
  supplementalPayments: SupplementalPayment[];
  frozenHourlyRates: Map<string, number | null>;
  settledCompletionReportAssignees: Map<string, Set<string>>;
  projectFetchError: string | null;
};

const amounts = (summary: SettlementSummary): PreviewAmounts => ({
  fixedRewardYen: summary.fixedRewardYen,
  timedRewardYen: summary.timedRewardYen,
  taxExcludedYen: summary.taxExcludedYen,
  taxIncludedYen: summary.taxIncludedYen,
});

const sameIssue = (
  request: WorkLogChangeRequest,
  value: { repository: string; issueNumber: number },
): boolean =>
  value.repository === request.repository &&
  value.issueNumber === request.issueNumber;

const addSessionMonths = (months: Set<string>, session: WorkSession): void => {
  if (
    !session.endedAt ||
    session.excludedAt ||
    session.endedAt <= session.startedAt
  )
    return;
  const last = toJstMonth(new Date(session.endedAt.getTime() - 1));
  for (
    let month = toJstMonth(session.startedAt);
    month <= last;
    month = addMonths(month, 1)
  )
    months.add(month);
};

const buildCalculator = (
  input: PreviewInput,
  requests: WorkLogChangeRequest[],
  reports: IssueCompletionReport[],
) => {
  const allocations =
    input.ruleVersion === 2
      ? allocateTimedRewards({
          ...input,
          requests,
          completionReports: reports,
        })
      : undefined;
  return (month: string, login: string): SettlementSummary => {
    const snapshot =
      input.ruleVersion === 2
        ? input.snapshots.find(
            (item) => item.month === month && item.assigneeLogin === login,
          )
        : undefined;
    if (snapshot) {
      const saved = restoreSettlementSummary(snapshot.snapshot);
      if (!saved || saved.month !== month || saved.assigneeLogin !== login)
        throw new Error(
          "承認済みの金額を復元できないため、見込みを確認できません。",
        );
      return { ...saved, dataSource: "approved" };
    }
    const summaries =
      input.ruleVersion === 2
        ? buildSettlementSummariesV2(
            month,
            input.issues,
            input.sessions,
            requests,
            {
              completionReports: reports,
              supplementalPayments: input.supplementalPayments.filter(
                (payment) => payment.month === month,
              ),
              frozenHourlyRates: input.frozenHourlyRates,
              settledCompletionReportAssignees:
                input.settledCompletionReportAssignees,
              timedRewardAllocations: allocations,
            },
          )
        : buildSettlementSummaries(
            month,
            input.issues,
            input.sessions,
            requests,
          );
    const summary = summaries.find((item) => item.assigneeLogin === login);
    if (!summary) throw new Error("対象者の精算見込みを確認できません。");
    return summary;
  };
};

/** 未処理の申請を一件ずつ仮反映する。実際の申請状態・完了報告・承認額は更新しない。 */
export const buildChangeRequestPreviews = (
  input: PreviewInput,
): ChangeRequestPreview[] => {
  const pending = input.visibleRequests.filter(
    (request) => request.status === "pending",
  );
  if (!pending.length) return [];
  let before: ReturnType<typeof buildCalculator>;
  try {
    if (input.projectFetchError)
      throw new Error(
        "GitHub Projectを取得できないため、見込みを確認できません。",
      );
    before = buildCalculator(input, input.requests, input.completionReports);
  } catch (error) {
    return pending.map((request) => ({
      requestId: request.id,
      months: [],
      notes: [],
      error: String(error instanceof Error ? error.message : error),
    }));
  }
  return pending.map((request) => {
    try {
      if (
        !input.requests.some(
          (item) => item.id === request.id && item.status === "pending",
        )
      )
        throw new Error(
          "申請の状態が変わりました。再読み込みして見込みを確認してください。",
        );
      const issue = input.issues.find(
        (item) =>
          item.repository === request.repository &&
          item.number === request.issueNumber,
      );
      if (!issue)
        throw new Error(
          "Issueの報酬設定を取得できないため、見込みを確認できません。",
        );
      const currentSessions = applyApprovedChangeRequests(
        input.sessions,
        input.requests,
      );
      if (
        request.requestType !== "add" &&
        !currentSessions.some(
          (session) => session.id === request.targetSessionId,
        )
      )
        throw new Error(
          "修正対象の稼働ログを確認できないため、見込みを計算できません。",
        );
      const reviewedAt = new Date();
      // 実承認と同じ順序で適用し、同じログの他の未処理申請は承認しない。
      const requests = input.requests.map((item) =>
        item.id === request.id
          ? { ...item, status: "approved" as const, reviewedAt }
          : item,
      );
      const reports = input.completionReports.map((report) =>
        input.ruleVersion === 2 &&
        sameIssue(request, report) &&
        report.assigneeLogin === request.assigneeLogin &&
        !report.invalidatedAt &&
        !report.eligibilityConfirmedAt &&
        request.requestedEndedAt &&
        report.reportedAt < request.requestedEndedAt
          ? { ...report, invalidatedAt: reviewedAt }
          : report,
      );
      const after = buildCalculator(input, requests, reports);
      const months = new Set([input.month]);
      const notes: string[] = [];
      if (input.ruleVersion === 1) {
        if (issue.closedAt) months.add(toJstMonth(issue.closedAt));
        notes.push(
          issue.closedAt
            ? `現在の精算ルールではIssue完了月（${formatMonthLabel(toJstMonth(issue.closedAt))}）に計上します。稼働月と異なる場合があります。`
            : "現在の精算ルールではIssue完了月に計上します。Issueが未完了のため金額はまだ計上されません。",
        );
      } else {
        // 修正で空になった月や、上限配分が移る他月も比較対象に残す。
        for (const session of [
          ...currentSessions,
          ...applyApprovedChangeRequests(input.sessions, requests),
        ])
          if (sameIssue(request, session)) addSessionMonths(months, session);
        for (const report of input.completionReports)
          if (sameIssue(request, report) && !report.invalidatedAt)
            months.add(report.settlementMonth);
      }
      if (
        reports.some(
          (report, index) =>
            report.invalidatedAt !==
            input.completionReports[index].invalidatedAt,
        )
      )
        notes.push(
          "完了報告後の稼働を含むため、未確定の完了報告は承認時に失効し、再提出が必要になります。",
        );
      if (
        input.requests.some(
          (item) =>
            item.status === "pending" &&
            item.id !== request.id &&
            item.targetSessionId &&
            item.targetSessionId === request.targetSessionId,
        )
      )
        notes.push(
          "同じ稼働ログに他の未処理申請があります。この申請だけを反映した見込みです。",
        );
      const rows = [...months].sort().map((month) => {
        const current = before(month, request.assigneeLogin);
        const projected = after(month, request.assigneeLogin);
        const line = projected.lines.find(
          (line) =>
            line.issue.repository === request.repository &&
            line.issue.number === request.issueNumber,
        );
        if (line?.warnings.length)
          throw new Error(
            `報酬設定の確認が必要です。${line.warnings.join(" ")}`,
          );
        for (const warning of projected.blockingReasons)
          if (!notes.includes(warning)) notes.push(warning);
        return {
          month,
          before: amounts(current),
          after: amounts(projected),
          approved: projected.dataSource === "approved",
          issueDetail: line
            ? {
                workMinutes: line.workMinutes,
                hourlyRateYen:
                  line.hourlyRateYenSnapshot === undefined
                    ? line.issue.hourlyRateYen
                    : line.hourlyRateYenSnapshot,
                timedRewardYen: line.timedRewardYen,
                calculation: line.timedRewardCalculation,
              }
            : null,
        };
      });
      return { requestId: request.id, months: rows, notes, error: null };
    } catch (error) {
      return {
        requestId: request.id,
        months: [],
        notes: [],
        error:
          error instanceof Error ? error.message : "見込みを計算できません。",
      };
    }
  });
};
