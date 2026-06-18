import { setProjectItemStatus } from "$lib/server/github/projectClient";
import type { ProjectIssue } from "$lib/server/github/projectTypes";
import {
  getPendingProjectStatusSync,
  markProjectStatusSyncAttemptFailed,
  upsertPendingProjectStatusSync,
  resolveProjectStatusSync,
} from "$lib/server/github/statusSyncRepository";

const errorMessage = (error: unknown): string =>
  error instanceof Error
    ? error.message
    : "GitHub ProjectのStatus更新に失敗しました。";

export const recordProjectStatusSyncFailure = async (
  issue: ProjectIssue,
  assigneeLogin: string,
  targetStatus: string,
  error: unknown,
): Promise<void> => {
  await upsertPendingProjectStatusSync({
    projectItemId: issue.projectItemId,
    repository: issue.repository,
    issueNumber: issue.number,
    issueTitle: issue.title,
    assigneeLogin,
    targetStatus,
    errorMessage: errorMessage(error),
  });
};

export const retryProjectStatusSync = async (
  syncId: string,
  userLogin: string,
  isAdmin: boolean,
): Promise<{ ok: true; message: string } | { ok: false; message: string }> => {
  const sync = await getPendingProjectStatusSync(syncId);
  if (!sync) {
    return { ok: false, message: "再同期対象が見つかりません。" };
  }
  if (!isAdmin && sync.assigneeLogin !== userLogin) {
    return { ok: false, message: "自分以外のStatus再同期はできません。" };
  }

  try {
    await setProjectItemStatus(sync.projectItemId, sync.targetStatus);
    await resolveProjectStatusSync(sync.id);
    return { ok: true, message: "GitHub ProjectのStatusを再同期しました。" };
  } catch (error) {
    await markProjectStatusSyncAttemptFailed(sync.id, errorMessage(error));
    return {
      ok: false,
      message:
        "GitHub ProjectのStatus再同期に失敗しました。Project設定またはGITHUB_PROJECT_TOKENを確認してください。",
    };
  }
};
