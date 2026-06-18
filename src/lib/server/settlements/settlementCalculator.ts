import type { WorkLogChangeRequest, WorkSession } from "$lib/server/db/schema";
import type { ProjectIssue } from "$lib/server/github/projectTypes";
import { calculateTax, calculateTaxIncluded, calculateTimedReward } from "$lib/server/money";
import { minutesBetween, toJstMonth } from "$lib/server/time";
import type {
  SettlementIssueLine,
  SettlementSummary,
  UnclosedProjectIssueLine
} from "$lib/server/settlements/settlementTypes";

const issueKey = (repository: string, issueNumber: number): string => `${repository}#${issueNumber}`;

const isPayableIssue = (issue: ProjectIssue, month: string): boolean => {
  return issue.status === "Done" && issue.state === "CLOSED" && !!issue.closedAt && toJstMonth(issue.closedAt) === month;
};

const isUnclosedIssue = (issue: ProjectIssue): boolean => issue.state !== "CLOSED" && !issue.closedAt;

const shouldShowUnclosedIssue = (issue: ProjectIssue, hasSessions: boolean): boolean => {
  return isUnclosedIssue(issue) && (issue.status === "In Progress" || hasSessions);
};

const sessionMinutes = (session: WorkSession): number => {
  if (!session.endedAt || session.excludedAt) return 0;
  return minutesBetween(session.startedAt, session.endedAt);
};

export const applyApprovedChangeRequests = (
  sessions: WorkSession[],
  changeRequests: WorkLogChangeRequest[]
): WorkSession[] => {
  const effectiveSessions = new Map<string, WorkSession>();
  for (const session of sessions) {
    effectiveSessions.set(session.id, session);
  }

  for (const request of changeRequests) {
    if (request.status !== "approved") continue;

    if (request.requestType === "add" && request.requestedStartedAt && request.requestedEndedAt) {
      effectiveSessions.set(`request-${request.id}`, {
        id: `request-${request.id}`,
        assigneeLogin: request.assigneeLogin,
        repository: request.repository,
        issueNumber: request.issueNumber,
        issueTitle: request.issueTitle,
        startedAt: request.requestedStartedAt,
        endedAt: request.requestedEndedAt,
        createdBy: request.requestedBy,
        createdAt: request.createdAt,
        updatedAt: request.reviewedAt ?? request.createdAt,
        excludedAt: null,
        excludeReason: null
      });
    }

    if (request.requestType === "edit" && request.targetSessionId) {
      const target = effectiveSessions.get(request.targetSessionId);
      if (target) {
        effectiveSessions.set(request.targetSessionId, {
          ...target,
          startedAt: request.requestedStartedAt ?? target.startedAt,
          endedAt: request.requestedEndedAt ?? target.endedAt,
          updatedAt: request.reviewedAt ?? target.updatedAt
        });
      }
    }

    if (request.requestType === "exclude" && request.targetSessionId) {
      const target = effectiveSessions.get(request.targetSessionId);
      if (target) {
        effectiveSessions.set(request.targetSessionId, {
          ...target,
          excludedAt: request.reviewedAt ?? request.createdAt,
          excludeReason: request.reason,
          updatedAt: request.reviewedAt ?? target.updatedAt
        });
      }
    }
  }

  return Array.from(effectiveSessions.values());
};

const buildLine = (issue: ProjectIssue, sessions: WorkSession[]): SettlementIssueLine => {
  const warnings: string[] = [];
  const assigneeLogin = issue.assignees.length === 1 ? issue.assignees[0] : null;
  const workMinutes = sessions.reduce((total, session) => total + sessionMinutes(session), 0);
  const fixedRewardYen = issue.fixedRewardYen ?? 0;
  const timedRewardYen =
    issue.rewardMode === "ハイブリッド" && issue.hourlyRateYen
      ? sessions.reduce((total, session) => {
          return total + calculateTimedReward(sessionMinutes(session), issue.hourlyRateYen ?? 0);
        }, 0)
      : 0;

  if (issue.assignees.length !== 1) warnings.push("assigneeが単一ではありません。");
  if (issue.fixedRewardYen === null) warnings.push("固定報酬額が未入力です。");
  if (issue.rewardMode === "ハイブリッド" && issue.hourlyRateYen === null) {
    warnings.push("ハイブリッドIssueの時間単価が未入力です。");
  }
  if (
    issue.rewardMode === "ハイブリッド" &&
    issue.extraCapYen !== null &&
    timedRewardYen > issue.extraCapYen
  ) {
    warnings.push("時間精算額が追加精算上限を超えています。");
  }

  return {
    issue,
    assigneeLogin,
    fixedRewardYen,
    workMinutes,
    timedRewardYen,
    taxExcludedYen: fixedRewardYen + timedRewardYen,
    warnings,
    sessions
  };
};

export const buildSettlementSummaries = (
  month: string,
  issues: ProjectIssue[],
  sessions: WorkSession[],
  changeRequests: WorkLogChangeRequest[]
): SettlementSummary[] => {
  const effectiveSessions = applyApprovedChangeRequests(sessions, changeRequests);
  const payableIssues = issues.filter((issue) => isPayableIssue(issue, month));
  const issueByKey = new Map(issues.map((issue) => [issueKey(issue.repository, issue.number), issue]));
  const payableKeys = new Set(payableIssues.map((issue) => issueKey(issue.repository, issue.number)));
  const sessionsByIssue = new Map<string, WorkSession[]>();

  for (const session of effectiveSessions) {
    const key = issueKey(session.repository, session.issueNumber);
    if (!payableKeys.has(key)) continue;
    const issue = issueByKey.get(key);
    if (!issue?.assignees.includes(session.assigneeLogin)) continue;
    sessionsByIssue.set(key, [...(sessionsByIssue.get(key) ?? []), session]);
  }

  const linesByAssignee = new Map<string, SettlementIssueLine[]>();
  const globalBlockingReasons: string[] = [];

  for (const issue of payableIssues) {
    const key = issueKey(issue.repository, issue.number);
    const line = buildLine(issue, sessionsByIssue.get(key) ?? []);
    if (!line.assigneeLogin) {
      globalBlockingReasons.push(`${issue.repository}#${issue.number}: assigneeが単一ではありません。`);
      continue;
    }
    linesByAssignee.set(line.assigneeLogin, [...(linesByAssignee.get(line.assigneeLogin) ?? []), line]);
  }

  const assignees = new Set<string>([
    ...Array.from(linesByAssignee.keys()),
    ...issues
      .filter((issue) => isUnclosedIssue(issue) && issue.status === "In Progress")
      .flatMap((issue) => issue.assignees),
    ...effectiveSessions.map((session) => session.assigneeLogin),
    ...changeRequests.map((request) => request.assigneeLogin)
  ]);

  return Array.from(assignees)
    .sort()
    .map((assigneeLogin) => {
      const lines = linesByAssignee.get(assigneeLogin) ?? [];
      const pendingRequests = changeRequests.filter((request) => {
        if (request.assigneeLogin !== assigneeLogin || request.status !== "pending") return false;
        const issue = issueByKey.get(issueKey(request.repository, request.issueNumber));
        return !!issue?.closedAt && toJstMonth(issue.closedAt) === month;
      });
      const unclosedSessions = effectiveSessions.filter((session) => {
        const issue = issueByKey.get(issueKey(session.repository, session.issueNumber));
        return session.assigneeLogin === assigneeLogin && !issue?.closedAt && !session.excludedAt;
      });
      const unclosedSessionKeys = new Set(
        unclosedSessions.map((session) => issueKey(session.repository, session.issueNumber))
      );
      const unclosedProjectIssues: UnclosedProjectIssueLine[] = issues
        .filter((issue) => issue.assignees.includes(assigneeLogin))
        .filter((issue) => shouldShowUnclosedIssue(issue, unclosedSessionKeys.has(issueKey(issue.repository, issue.number))))
        .map((issue) => {
          const key = issueKey(issue.repository, issue.number);
          const sessionsForIssue = unclosedSessions.filter(
            (session) => issueKey(session.repository, session.issueNumber) === key
          );
          return {
            issue,
            sessions: sessionsForIssue,
            workMinutes: sessionsForIssue.reduce((total, session) => total + sessionMinutes(session), 0)
          };
        });
      const unclosedProjectIssueKeys = new Set(
        unclosedProjectIssues.map((line) => issueKey(line.issue.repository, line.issue.number))
      );
      const unclosedIssueSessions = unclosedSessions.filter(
        (session) => !unclosedProjectIssueKeys.has(issueKey(session.repository, session.issueNumber))
      );
      const fixedRewardYen = lines.reduce((total, line) => total + line.fixedRewardYen, 0);
      const timedRewardYen = lines.reduce((total, line) => total + line.timedRewardYen, 0);
      const taxExcludedYen = fixedRewardYen + timedRewardYen;
      const approvalRequired = lines.length > 0;
      const lineWarnings = lines.flatMap((line) =>
        line.warnings.map((warning) => `${line.issue.repository}#${line.issue.number}: ${warning}`)
      );
      const blockingReasons = [
        ...globalBlockingReasons,
        ...lineWarnings,
        ...pendingRequests.map((request) => `未処理の修正申請: ${request.repository}#${request.issueNumber}`),
        ...lines.flatMap((line) =>
          line.sessions
            .filter((session) => !session.endedAt && !session.excludedAt)
            .map((session) => `未終了ログ: ${session.repository}#${session.issueNumber}`)
        )
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
        unclosedProjectIssues,
        unclosedIssueSessions,
        approvalRequired,
        blockingReasons
      };
    });
};

export const findSummary = (
  summaries: SettlementSummary[],
  assigneeLogin: string
): SettlementSummary | null => {
  return summaries.find((summary) => summary.assigneeLogin === assigneeLogin) ?? null;
};
