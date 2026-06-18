import { fail } from "@sveltejs/kit";
import { requireUser } from "$lib/server/auth/guards";
import { fetchProjectIssues } from "$lib/server/github/projectClient";
import { listPendingProjectStatusSyncsForAssignee } from "$lib/server/github/statusSyncRepository";
import { retryProjectStatusSync } from "$lib/server/github/statusSyncService";
import {
  listChangeRequests,
  listOpenWorkSessionsForAssignee,
  listWorkSessionsForAssignee
} from "$lib/server/work/workRepository";
import { requestWorkLogChange, startIssueWork, stopIssueWork } from "$lib/server/work/workService";

export const load = async (event) => {
  const user = requireUser(event);
  const [{ health, issues }, openSessions, sessions, requests, statusSyncs] = await Promise.all([
    fetchProjectIssues(),
    listOpenWorkSessionsForAssignee(user.login),
    listWorkSessionsForAssignee(user.login),
    listChangeRequests(),
    listPendingProjectStatusSyncsForAssignee(user.login)
  ]);

  return {
    health,
    issues: issues.filter((issue) => issue.assignees.includes(user.login)),
    openSessions,
    sessions,
    requests: requests.filter((request) => request.assigneeLogin === user.login),
    statusSyncs
  };
};

export const actions = {
  start: async (event) => {
    const user = requireUser(event);
    const { issues } = await fetchProjectIssues();
    const result = await startIssueWork(await event.request.formData(), issues, user.login);
    if (!result.ok) return fail(400, { message: result.message });
    return { message: result.message ?? "稼働を開始しました。" };
  },
  stop: async (event) => {
    const user = requireUser(event);
    const result = await stopIssueWork(await event.request.formData(), user.login);
    if (!result.ok) return fail(400, { message: result.message });
    return { message: "稼働を終了しました。" };
  },
  requestChange: async (event) => {
    const user = requireUser(event);
    const { issues } = await fetchProjectIssues();
    const result = await requestWorkLogChange(await event.request.formData(), issues, user.login);
    if (!result.ok) return fail(400, { message: result.message });
    return { message: "修正申請を登録しました。" };
  },
  retryStatusSync: async (event) => {
    const user = requireUser(event);
    const formData = await event.request.formData();
    const syncId = String(formData.get("syncId") ?? "");
    const result = await retryProjectStatusSync(syncId, user.login, user.isAdmin);
    if (!result.ok) return fail(400, { message: result.message });
    return { message: result.message };
  }
};
