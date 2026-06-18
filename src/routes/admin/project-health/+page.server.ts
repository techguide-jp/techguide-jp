import { fail } from "@sveltejs/kit";
import { requireAdmin } from "$lib/server/auth/guards";
import { fetchProjectIssues } from "$lib/server/github/projectClient";
import { listPendingProjectStatusSyncs } from "$lib/server/github/statusSyncRepository";
import { retryProjectStatusSync } from "$lib/server/github/statusSyncService";

export const load = async (event) => {
  const user = requireAdmin(event);
  const [{ health, issues }, statusSyncs] = await Promise.all([
    fetchProjectIssues(),
    listPendingProjectStatusSyncs(),
  ]);

  return {
    user,
    health,
    issues,
    statusSyncs,
    issueWarnings: issues
      .map((issue) => {
        const warnings: string[] = [];
        if (issue.assignees.length !== 1)
          warnings.push("assigneeが単一ではありません");
        if (issue.status === "Done" && issue.fixedRewardYen === null)
          warnings.push("固定報酬額が未入力です");
        if (
          issue.rewardMode === "ハイブリッド" &&
          issue.hourlyRateYen === null
        ) {
          warnings.push("時間単価が未入力です");
        }
        return { issue, warnings };
      })
      .filter((entry) => entry.warnings.length > 0),
  };
};

export const actions = {
  retryStatusSync: async (event) => {
    const user = requireAdmin(event);
    const formData = await event.request.formData();
    const syncId = String(formData.get("syncId") ?? "");
    const result = await retryProjectStatusSync(syncId, user.login, true);
    if (!result.ok) return fail(400, { message: result.message });
    return { message: result.message };
  },
};
