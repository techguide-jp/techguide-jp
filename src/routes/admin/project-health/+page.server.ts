import { fail } from "@sveltejs/kit";
import { requireAdmin } from "$lib/server/auth/guards";
import { listRecentAuditLogs } from "$lib/server/audit/auditRepository";
import { fetchProjectIssues } from "$lib/server/github/projectClient";
import { requiredProjectFields } from "$lib/server/github/projectTypes";
import { listPendingProjectStatusSyncs } from "$lib/server/github/statusSyncRepository";
import { retryProjectStatusSync } from "$lib/server/github/statusSyncService";
import {
  cleanupExpiredSessions,
  loadOperationalHealth,
} from "$lib/server/ops/operationalHealth";

export const load = async (event) => {
  const user = requireAdmin(event);
  const [projectResult, statusSyncs, operationalHealth, auditLogs] =
    await Promise.all([
      fetchProjectIssues()
        .then((result) => ({ ok: true as const, result }))
        .catch((error: unknown) => ({
          ok: false as const,
          error:
            error instanceof Error
              ? error.message
              : "Project取得に失敗しました。",
        })),
      listPendingProjectStatusSyncs(),
      loadOperationalHealth(),
      listRecentAuditLogs(),
    ]);
  const health = projectResult.ok
    ? projectResult.result.health
    : {
        title: "GitHub Project",
        missingFields: Object.values(requiredProjectFields),
        invalidFields: [],
        availableFields: [],
      };
  const issues = projectResult.ok ? projectResult.result.issues : [];

  return {
    user,
    health,
    issues,
    statusSyncs,
    operationalHealth,
    auditLogs,
    projectFetchError: projectResult.ok ? null : projectResult.error,
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
  cleanupExpiredSessions: async (event) => {
    const user = requireAdmin(event);
    const { deletedCount } = await cleanupExpiredSessions(user.login);
    return { message: `${deletedCount}件の期限切れセッションを削除しました。` };
  },
};
