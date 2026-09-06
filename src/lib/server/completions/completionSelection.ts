import type { IssueCompletionReport } from "$lib/server/db/schema";

export const completionIssueKey = (
  report: Pick<IssueCompletionReport, "repository" | "issueNumber">,
): string => `${report.repository}#${report.issueNumber}`;

/** 帰属月や現在の担当者ではなく、Issue全期間から固定報酬の根拠を一つ選ぶ。 */
export const selectCompletionReports = (
  reports: IssueCompletionReport[],
): { selected: IssueCompletionReport[]; conflicts: Set<string> } => {
  const byIssue = new Map<string, IssueCompletionReport[]>();
  for (const report of reports) {
    if (report.invalidatedAt) continue;
    const key = completionIssueKey(report);
    byIssue.set(key, [...(byIssue.get(key) ?? []), report]);
  }
  const selected: IssueCompletionReport[] = [];
  const conflicts = new Set<string>();
  for (const [key, candidates] of byIssue) {
    const confirmed = candidates.filter(
      (report) => report.eligibilityConfirmedAt,
    );
    // 支払対象化済みの重複を自動で取り消すと既存支払いと食い違うため、確認を求める。
    if (confirmed.length > 1) {
      conflicts.add(key);
      continue;
    }
    const latest =
      confirmed[0] ??
      [...candidates].sort(
        (a, b) =>
          b.reportedAt.getTime() - a.reportedAt.getTime() ||
          b.createdAt.getTime() - a.createdAt.getTime() ||
          b.id.localeCompare(a.id),
      )[0];
    if (latest) selected.push(latest);
  }
  return { selected, conflicts };
};
