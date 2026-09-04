import type {
  IssueCompletionReport,
  SupplementalPayment,
  WorkLogChangeRequest,
  WorkSession,
} from "$lib/server/db/schema";
import type { ProjectIssue } from "$lib/server/github/projectTypes";
import {
  calculateTax,
  calculateTaxIncluded,
  calculateTimedReward,
} from "$lib/server/money";
import {
  jstMonthRangeUtc,
  minutesOverlappingRange,
  toJstMonth,
} from "$lib/server/time";
import { applyApprovedChangeRequests } from "$lib/server/settlements/settlementCalculator";
import type {
  SettlementIssueLine,
  SettlementSummary,
  UnsettledProjectIssueLine,
} from "$lib/server/settlements/settlementTypes";

type CalculatorOptions = {
  completionReports: IssueCompletionReport[];
  supplementalPayments: SupplementalPayment[];
  frozenHourlyRates?: Map<string, number | null>;
  priorTimedRewardByIssue?: Map<string, number>;
};

const issueKey = (repository: string, issueNumber: number): string =>
  `${repository}#${issueNumber}`;

const requestTouchesMonth = (
  request: WorkLogChangeRequest,
  month: string,
): boolean => {
  const range = jstMonthRangeUtc(month);
  if (
    request.requestedStartedAt &&
    request.requestedEndedAt &&
    request.requestedStartedAt < range.end &&
    request.requestedEndedAt >= range.start
  ) {
    return true;
  }
  if (
    request.requestedStartedAt &&
    toJstMonth(request.requestedStartedAt) === month
  )
    return true;
  if (
    request.requestedEndedAt &&
    toJstMonth(request.requestedEndedAt) === month
  )
    return true;
  return toJstMonth(request.createdAt) === month;
};

const buildIssueLine = (input: {
  issue: ProjectIssue;
  report: IssueCompletionReport | null;
  sessions: WorkSession[];
  sessionMinutesById: Record<string, number>;
  frozenHourlyRate: number | null | undefined;
  priorTimedRewardYen: number;
}): SettlementIssueLine => {
  const warnings: string[] = [];
  const issue = input.report
    ? {
        ...input.issue,
        rewardMode: input.report.rewardMode,
        fixedRewardYen: input.report.fixedRewardYen,
      }
    : input.issue;
  const assigneeLogin =
    issue.assignees.length === 1 ? issue.assignees[0] : null;
  const workMinutes = Object.values(input.sessionMinutesById).reduce(
    (total, minutes) => total + minutes,
    0,
  );
  const fixedRewardYen = input.report?.fixedRewardYen ?? 0;
  const hourlyRateYen =
    input.frozenHourlyRate === undefined
      ? issue.hourlyRateYen
      : input.frozenHourlyRate;
  const timedRewardYen =
    issue.rewardMode === "ハイブリッド" && hourlyRateYen
      ? Object.values(input.sessionMinutesById).reduce(
          (total, minutes) =>
            total + calculateTimedReward(minutes, hourlyRateYen),
          0,
        )
      : 0;

  if (!assigneeLogin) warnings.push("assigneeが単一ではありません。");
  if (issue.rewardMode !== "固定" && issue.rewardMode !== "ハイブリッド") {
    warnings.push("報酬方式が未入力または不正です。");
  }
  if (
    issue.rewardMode === "ハイブリッド" &&
    workMinutes > 0 &&
    hourlyRateYen === null
  ) {
    warnings.push("ハイブリッドIssueの時間単価が未入力です。");
  }
  if (
    issue.rewardMode === "ハイブリッド" &&
    issue.extraCapYen !== null &&
    input.priorTimedRewardYen + timedRewardYen > issue.extraCapYen
  ) {
    warnings.push("Issue全期間の時間精算額が追加精算上限を超えています。");
  }

  return {
    issue,
    assigneeLogin,
    fixedRewardYen,
    workMinutes,
    timedRewardYen,
    taxExcludedYen: fixedRewardYen + timedRewardYen,
    warnings,
    sessions: input.sessions,
    sessionMinutesById: input.sessionMinutesById,
    hourlyRateYenSnapshot: hourlyRateYen,
    completionReportId: input.report?.id ?? null,
  };
};

export const buildSettlementSummariesV2 = (
  month: string,
  issues: ProjectIssue[],
  sessions: WorkSession[],
  changeRequests: WorkLogChangeRequest[],
  options: CalculatorOptions,
): SettlementSummary[] => {
  const range = jstMonthRangeUtc(month);
  const effectiveSessions = applyApprovedChangeRequests(
    sessions,
    changeRequests,
  );
  const supplementalReportIds = new Set(
    options.supplementalPayments.map((payment) => payment.completionReportId),
  );
  const reportsForMonth = options.completionReports.filter(
    (report) =>
      report.settlementMonth === month && report.invalidatedAt === null,
  );
  const eligibleBaseReportByIssue = new Map(
    reportsForMonth
      .filter(
        (report) =>
          report.eligibilityConfirmedAt !== null &&
          !supplementalReportIds.has(report.id),
      )
      .map((report) => [
        issueKey(report.repository, report.issueNumber),
        report,
      ]),
  );

  const sessionsByIssue = new Map<string, WorkSession[]>();
  const minutesByIssue = new Map<string, Record<string, number>>();
  for (const session of effectiveSessions) {
    if (!session.endedAt || session.excludedAt) continue;
    const minutes = minutesOverlappingRange(
      session.startedAt,
      session.endedAt,
      range,
    );
    if (minutes <= 0) continue;
    const key = issueKey(session.repository, session.issueNumber);
    sessionsByIssue.set(key, [...(sessionsByIssue.get(key) ?? []), session]);
    minutesByIssue.set(key, {
      ...(minutesByIssue.get(key) ?? {}),
      [session.id]: minutes,
    });
  }

  const linesByAssignee = new Map<string, SettlementIssueLine[]>();
  const globalBlockingReasons: string[] = [];
  for (const issue of issues) {
    const key = issueKey(issue.repository, issue.number);
    const report = eligibleBaseReportByIssue.get(key) ?? null;
    const issueSessions = (sessionsByIssue.get(key) ?? []).filter((session) =>
      issue.assignees.includes(session.assigneeLogin),
    );
    const sessionMinutesById = Object.fromEntries(
      issueSessions.map((session) => [
        session.id,
        minutesByIssue.get(key)?.[session.id] ?? 0,
      ]),
    );
    const hasMonthlyWork = Object.values(sessionMinutesById).some(
      (minutes) => minutes > 0,
    );
    if (!report && !hasMonthlyWork) continue;

    const line = buildIssueLine({
      issue,
      report,
      sessions: issueSessions,
      sessionMinutesById,
      frozenHourlyRate: options.frozenHourlyRates?.get(key),
      priorTimedRewardYen: options.priorTimedRewardByIssue?.get(key) ?? 0,
    });
    if (!line.assigneeLogin) {
      globalBlockingReasons.push(
        `${issue.repository}#${issue.number}: assigneeが単一ではありません。`,
      );
      continue;
    }
    linesByAssignee.set(line.assigneeLogin, [
      ...(linesByAssignee.get(line.assigneeLogin) ?? []),
      line,
    ]);
  }

  const assignees = new Set<string>([
    ...Array.from(linesByAssignee.keys()),
    ...reportsForMonth.map((report) => report.assigneeLogin),
    ...effectiveSessions.map((session) => session.assigneeLogin),
    ...changeRequests.map((request) => request.assigneeLogin),
    ...options.supplementalPayments.map((payment) => payment.assigneeLogin),
  ]);

  return Array.from(assignees)
    .sort()
    .map((assigneeLogin) => {
      const lines = linesByAssignee.get(assigneeLogin) ?? [];
      const completionReports = reportsForMonth.filter(
        (report) => report.assigneeLogin === assigneeLogin,
      );
      const pendingRequests = changeRequests.filter(
        (request) =>
          request.assigneeLogin === assigneeLogin &&
          request.status === "pending" &&
          requestTouchesMonth(request, month),
      );
      const openSessions = effectiveSessions.filter(
        (session) =>
          session.assigneeLogin === assigneeLogin &&
          !session.endedAt &&
          !session.excludedAt &&
          session.startedAt < range.end,
      );
      const unsettledProjectIssues = issues
        .filter((issue) => issue.assignees.includes(assigneeLogin))
        .reduce<UnsettledProjectIssueLine[]>((result, issue) => {
          const key = issueKey(issue.repository, issue.number);
          const report = completionReports.find(
            (candidate) =>
              issueKey(candidate.repository, candidate.issueNumber) === key,
          );
          const issueSessions = sessionsByIssue.get(key) ?? [];
          const workMinutes = Object.values(
            minutesByIssue.get(key) ?? {},
          ).reduce((total, minutes) => total + minutes, 0);
          if (report && !report.eligibilityConfirmedAt) {
            result.push({
              issue,
              sessions: issueSessions,
              workMinutes,
              reason: "merge_waiting",
            });
            return result;
          }
          const needsCompletionReport =
            !report &&
            (issue.rewardMode === "固定" ||
              issue.rewardMode === "ハイブリッド") &&
            (issue.status === "Done" ||
              issue.state === "CLOSED" ||
              workMinutes > 0);
          if (needsCompletionReport) {
            result.push({
              issue,
              sessions: issueSessions,
              workMinutes,
              reason: "completion_not_reported",
            });
          }
          return result;
        }, []);
      const knownIssueKeys = new Set(
        issues.map((issue) => issueKey(issue.repository, issue.number)),
      );
      const unsettledIssueSessions = effectiveSessions.filter(
        (session) =>
          session.assigneeLogin === assigneeLogin &&
          !knownIssueKeys.has(
            issueKey(session.repository, session.issueNumber),
          ) &&
          session.startedAt < range.end &&
          (!session.endedAt || session.endedAt >= range.start),
      );
      const fixedRewardYen = lines.reduce(
        (total, line) => total + line.fixedRewardYen,
        0,
      );
      const timedRewardYen = lines.reduce(
        (total, line) => total + line.timedRewardYen,
        0,
      );
      const taxExcludedYen = fixedRewardYen + timedRewardYen;
      const lineWarnings = lines.flatMap((line) =>
        line.warnings.map(
          (warning) =>
            `${line.issue.repository}#${line.issue.number}: ${warning}`,
        ),
      );
      const blockingReasons = [
        ...globalBlockingReasons,
        ...lineWarnings,
        ...pendingRequests.map(
          (request) =>
            `未処理の修正申請: ${request.repository}#${request.issueNumber}`,
        ),
        ...openSessions.map(
          (session) =>
            `未終了ログ: ${session.repository}#${session.issueNumber}`,
        ),
      ];

      return {
        month,
        assigneeLogin,
        fixedRewardYen,
        timedRewardYen,
        taxExcludedYen,
        taxYen: calculateTax(taxExcludedYen),
        taxIncludedYen: calculateTaxIncluded(taxExcludedYen),
        lines,
        pendingRequests,
        unsettledProjectIssues,
        unsettledIssueSessions,
        // 未マージの完了報告も、作業者が3日までに月次確定できる対象に含める。
        approvalRequired:
          taxExcludedYen > 0 ||
          completionReports.length > 0 ||
          lines.some(
            (line) =>
              line.issue.rewardMode === "ハイブリッド" && line.workMinutes > 0,
          ) ||
          unsettledProjectIssues.some(
            (line) => line.reason === "completion_not_reported",
          ),
        blockingReasons,
        completionReports,
        supplementalPayments: options.supplementalPayments.filter(
          (payment) => payment.assigneeLogin === assigneeLogin,
        ),
      };
    });
};
