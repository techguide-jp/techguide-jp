import { requireAdmin } from "$lib/server/auth/guards";
import { fetchProjectIssues } from "$lib/server/github/projectClient";

export const load = async (event) => {
  requireAdmin(event);
  const { health, issues } = await fetchProjectIssues();

  return {
    health,
    issues,
    issueWarnings: issues
      .map((issue) => {
        const warnings: string[] = [];
        if (issue.assignees.length !== 1) warnings.push("assigneeが単一ではありません");
        if (issue.status === "Done" && issue.fixedRewardYen === null) warnings.push("固定報酬額が未入力です");
        if (issue.rewardMode === "ハイブリッド" && issue.hourlyRateYen === null) {
          warnings.push("時間単価が未入力です");
        }
        return { issue, warnings };
      })
      .filter((entry) => entry.warnings.length > 0)
  };
};
