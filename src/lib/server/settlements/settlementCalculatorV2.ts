import type {
  IssueCompletionReport,
  SupplementalPayment,
  WorkLogChangeRequest,
  WorkSession,
} from "$lib/server/db/schema";
import { isIssueCompleted } from "$lib/issueCompletion";
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
import {
  completionIssueKey,
  selectCompletionReports,
} from "$lib/server/completions/completionSelection";
import type {
  SettlementIssueLine,
  SettlementSummary,
  UnsettledProjectIssueLine,
} from "$lib/server/settlements/settlementTypes";

type CalculatorOptions = {
  unassignedCompletedIssueKeys?: Set<string>;
  completionReports: IssueCompletionReport[];
  supplementalPayments: SupplementalPayment[];
  frozenHourlyRates?: Map<string, number | null>;
  priorTimedRewardByIssue?: Map<string, number>;
  lifetimeTimedRewardByIssue?: Map<string, number>;
  settledCompletionReportAssignees?: Map<string, Set<string>>;
};

const issueKey = (repository: string, issueNumber: number): string =>
  `${repository}#${issueNumber}`;

const issueAssigneeKey = (
  repository: string,
  issueNumber: number,
  assigneeLogin: string,
): string => `${issueKey(repository, issueNumber)}#${assigneeLogin}`;

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
  assigneeLogin: string;
  sessions: WorkSession[];
  sessionMinutesById: Record<string, number>;
  frozenHourlyRate: number | null | undefined;
}): SettlementIssueLine => {
  const warnings: string[] = [];
  const issue = input.report
    ? {
        ...input.issue,
        rewardMode: input.report.rewardMode,
        fixedRewardYen: input.report.fixedRewardYen,
      }
    : input.issue;
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
  return {
    issue,
    assigneeLogin: input.assigneeLogin,
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
  const isAlreadySettled = (report: IssueCompletionReport): boolean =>
    supplementalReportIds.has(report.id) ||
    [...(options.settledCompletionReportAssignees?.get(report.id) ?? [])].some(
      (assigneeLogin) => assigneeLogin !== report.assigneeLogin,
    );
  // 先に月で絞ると、担当変更後の別月の報告を見落として同じ成果を二重計上する。
  const selection = selectCompletionReports(options.completionReports);
  const reportedIssueKeys = new Set(
    options.completionReports
      .filter((report) => !report.invalidatedAt)
      .map(completionIssueKey),
  );
  const unassignedCompletedIssues = issues.filter(
    (issue) =>
      isIssueCompleted(issue) &&
      (options.unassignedCompletedIssueKeys
        ? options.unassignedCompletedIssueKeys.has(
            issueKey(issue.repository, issue.number),
          )
        : !reportedIssueKeys.has(issueKey(issue.repository, issue.number))),
  );
  const selectedIds = new Set(selection.selected.map((report) => report.id));
  const reportsForMonth = options.completionReports.filter(
    (report) =>
      report.settlementMonth === month &&
      report.invalidatedAt === null &&
      (selectedIds.has(report.id) ||
        selection.conflicts.has(completionIssueKey(report))),
  );
  const eligibleBaseReportByIssueAssignee = new Map(
    reportsForMonth
      .filter(
        (report) =>
          report.eligibilityConfirmedAt !== null && !isAlreadySettled(report),
      )
      .map((report) => [
        issueAssigneeKey(
          report.repository,
          report.issueNumber,
          report.assigneeLogin,
        ),
        report,
      ]),
  );

  const sessionsByIssue = new Map<string, WorkSession[]>();
  const minutesByIssue = new Map<string, Record<string, number>>();
  const sessionAssigneesByIssue = new Map<string, Set<string>>();
  for (const session of effectiveSessions) {
    const key = issueKey(session.repository, session.issueNumber);
    if (
      !session.excludedAt &&
      session.startedAt < range.end &&
      (!session.endedAt || session.endedAt > range.start)
    ) {
      const assignees = sessionAssigneesByIssue.get(key) ?? new Set<string>();
      assignees.add(session.assigneeLogin);
      sessionAssigneesByIssue.set(key, assignees);
    }
    if (!session.endedAt || session.excludedAt) continue;
    const minutes = minutesOverlappingRange(
      session.startedAt,
      session.endedAt,
      range,
    );
    if (minutes <= 0) continue;
    sessionsByIssue.set(key, [...(sessionsByIssue.get(key) ?? []), session]);
    minutesByIssue.set(key, {
      ...(minutesByIssue.get(key) ?? {}),
      [session.id]: minutes,
    });
  }

  const linesByAssignee = new Map<string, SettlementIssueLine[]>();
  const issueBlockingReasonsByAssignee = new Map<string, Set<string>>();
  const addBlockingReason = (
    key: string,
    assignees: Iterable<string>,
    message: string,
  ) => {
    const reason = `${key}: ${message}`;
    for (const assigneeLogin of assignees) {
      const reasons =
        issueBlockingReasonsByAssignee.get(assigneeLogin) ?? new Set<string>();
      reasons.add(reason);
      issueBlockingReasonsByAssignee.set(assigneeLogin, reasons);
    }
  };

  // Projectから削除されても、保存済み報告の重複が解消するまで対象月の確定を止める。
  for (const key of selection.conflicts) {
    const associatedAssignees = new Set([
      ...(sessionAssigneesByIssue.get(key) ?? []),
      ...reportsForMonth
        .filter((report) => completionIssueKey(report) === key)
        .map((report) => report.assigneeLogin),
    ]);
    addBlockingReason(
      key,
      associatedAssignees,
      "同じIssueに完了確認済みの報告が複数あります。管理者に確認してください。",
    );
  }

  for (const issue of issues) {
    const key = issueKey(issue.repository, issue.number);
    const issueSessions = sessionsByIssue.get(key) ?? [];
    const reportsForIssue = reportsForMonth.filter(
      (report) =>
        report.repository === issue.repository &&
        report.issueNumber === issue.number,
    );
    const reportAssignees = reportsForIssue
      .filter(
        (report) =>
          report.eligibilityConfirmedAt !== null && !isAlreadySettled(report),
      )
      .map((report) => report.assigneeLogin);
    const assigneesForLines = new Set([
      ...issueSessions.map((session) => session.assigneeLogin),
      ...reportAssignees,
    ]);
    const issueLines: Array<{
      assigneeLogin: string;
      line: SettlementIssueLine;
    }> = [];
    const associatedAssignees = new Set([
      ...(sessionAssigneesByIssue.get(key) ?? []),
      ...reportsForIssue.map((report) => report.assigneeLogin),
    ]);
    const addIssueBlockingReason = (message: string) => {
      addBlockingReason(key, associatedAssignees, message);
    };

    for (const assigneeLogin of assigneesForLines) {
      const report =
        eligibleBaseReportByIssueAssignee.get(
          issueAssigneeKey(issue.repository, issue.number, assigneeLogin),
        ) ?? null;
      const assigneeSessions = issueSessions.filter(
        (session) => session.assigneeLogin === assigneeLogin,
      );
      const sessionMinutesById = Object.fromEntries(
        assigneeSessions.map((session) => [
          session.id,
          minutesByIssue.get(key)?.[session.id] ?? 0,
        ]),
      );
      const hasMonthlyWork = Object.values(sessionMinutesById).some(
        (minutes) => minutes > 0,
      );
      if (!report && !hasMonthlyWork) continue;

      // Project上で再割り当てされても、報告済み固定報酬と稼働時間は
      // それぞれ保存済みの作業者へ帰属させる。
      const line = buildIssueLine({
        issue,
        report,
        assigneeLogin,
        sessions: assigneeSessions,
        sessionMinutesById,
        frozenHourlyRate: options.frozenHourlyRates?.get(
          issueAssigneeKey(issue.repository, issue.number, assigneeLogin),
        ),
      });
      issueLines.push({ assigneeLogin, line });
    }

    if (issue.assignees.length !== 1) {
      addIssueBlockingReason("assigneeが単一ではありません。");
    }

    // 追加精算上限は担当者単位ではなく、Issue全期間の時間報酬累計へ適用する。
    const currentTimedRewardYen = issueLines.reduce(
      (total, entry) => total + entry.line.timedRewardYen,
      0,
    );
    if (
      (issue.rewardMode === "ハイブリッド" ||
        issueLines.some(
          (entry) => entry.line.issue.rewardMode === "ハイブリッド",
        )) &&
      issue.extraCapYen !== null &&
      (options.lifetimeTimedRewardByIssue?.get(key) ??
        (options.priorTimedRewardByIssue?.get(key) ?? 0) +
          currentTimedRewardYen) > issue.extraCapYen
    ) {
      const capWarning =
        "Issue全期間の時間精算額が追加精算上限を超えています。";
      for (const { line } of issueLines) {
        line.warnings.push(capWarning);
      }
      addIssueBlockingReason(capWarning);
    }

    for (const { assigneeLogin, line } of issueLines) {
      linesByAssignee.set(assigneeLogin, [
        ...(linesByAssignee.get(assigneeLogin) ?? []),
        line,
      ]);
    }
  }

  const assignees = new Set<string>([
    ...unassignedCompletedIssues.flatMap((issue) => issue.assignees),
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
        .filter(
          (issue) =>
            issue.assignees.includes(assigneeLogin) ||
            completionReports.some(
              (report) =>
                report.repository === issue.repository &&
                report.issueNumber === issue.number,
            ),
        )
        .reduce<UnsettledProjectIssueLine[]>((result, issue) => {
          const key = issueKey(issue.repository, issue.number);
          const report = completionReports.find(
            (candidate) =>
              issueKey(candidate.repository, candidate.issueNumber) === key,
          );
          const issueSessions = (sessionsByIssue.get(key) ?? []).filter(
            (session) => session.assigneeLogin === assigneeLogin,
          );
          const workMinutes = issueSessions.reduce(
            (total, session) =>
              total + (minutesByIssue.get(key)?.[session.id] ?? 0),
            0,
          );
          if (report && !report.eligibilityConfirmedAt) {
            result.push({
              issue,
              sessions: issueSessions,
              workMinutes,
              reason: "completion_waiting",
            });
            return result;
          }
          if (
            unassignedCompletedIssues.some(
              (candidate) =>
                candidate.repository === issue.repository &&
                candidate.number === issue.number,
            )
          ) {
            result.push({
              issue,
              sessions: issueSessions,
              workMinutes,
              reason: "settlement_month_unassigned",
            });
            return result;
          }
          const needsCompletionReport =
            !isIssueCompleted(issue) &&
            !reportedIssueKeys.has(key) &&
            issue.assignees.includes(assigneeLogin) &&
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
      const blockingReasons = Array.from(
        new Set([
          ...(issueBlockingReasonsByAssignee.get(assigneeLogin) ?? []),
          ...lineWarnings,
          ...pendingRequests.map(
            (request) =>
              `未処理の修正申請: ${request.repository}#${request.issueNumber}`,
          ),
          ...openSessions.map(
            (session) =>
              `未終了ログ: ${session.repository}#${session.issueNumber}`,
          ),
        ]),
      );

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
        // 完了確認待ちの完了報告も、作業者が3日までに月次確定できる対象に含める。
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
