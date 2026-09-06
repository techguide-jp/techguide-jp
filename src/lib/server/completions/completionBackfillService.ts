import type { ProjectIssue } from "$lib/server/github/projectTypes";
import { listBackfillableIssueRefs } from "$lib/server/completions/completionBackfillRepository";

export const listCompletionBackfillCandidates = async (
  issues: ProjectIssue[],
): Promise<ProjectIssue[]> => {
  const candidates = issues.filter(
    (issue) =>
      issue.assignees.length === 1 &&
      (issue.rewardMode === "固定" || issue.rewardMode === "ハイブリッド") &&
      issue.fixedRewardYen !== null &&
      issue.fixedRewardYen >= 0,
  );
  const refs = await listBackfillableIssueRefs(candidates);
  const available = new Set(
    refs.map((issue) => `${issue.repository}#${issue.number}`),
  );
  return candidates
    .filter((issue) => available.has(`${issue.repository}#${issue.number}`))
    .sort(
      (left, right) =>
        left.repository.localeCompare(right.repository) ||
        right.number - left.number,
    );
};
