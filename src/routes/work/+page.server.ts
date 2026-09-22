import { cancelWorkLogChange } from "$lib/server/work/changeRequestCancellation";
import { fail } from "@sveltejs/kit";
import { requireUser } from "$lib/server/auth/guards";
import {
  fetchProjectIssues,
  fetchProjectIssuesForPage,
  projectFetchErrorMessage,
} from "$lib/server/github/projectClient";
import { listPendingProjectStatusSyncsForAssignee } from "$lib/server/github/statusSyncRepository";
import { retryProjectStatusSync } from "$lib/server/github/statusSyncService";
import {
  listChangeRequests,
  listOpenWorkSessionsForAssignee,
  listWorkSessionsForAssignee,
} from "$lib/server/work/workRepository";
import {
  requestWorkLogChange,
  startIssueWork,
  stopIssueWork,
} from "$lib/server/work/workService";
import {
  listCompletionReportsForWork,
  reportIssueCompletion,
  withdrawIssueCompletion,
} from "$lib/server/completions/completionService";
import { env } from "$lib/server/env";
import { currentJstMonth } from "$lib/month";
import { submissionNextStep } from "$lib/submissionReadiness";
import { loadSettlementAssignee } from "$lib/server/settlements/settlementService";
import { listWorkSessionLocks } from "$lib/server/work/workSessionLockRepository";
import { applyApprovedChangeRequests } from "$lib/server/settlements/settlementCalculator";

export const load = async (event) => {
  const user = requireUser(event);
  const [
    { health, issues, projectFetchError },
    openSessions,
    sessions,
    requests,
    statusSyncs,
    completionReports,
    sessionLocks,
    settlement,
  ] = await Promise.all([
    fetchProjectIssuesForPage(),
    listOpenWorkSessionsForAssignee(user.login),
    listWorkSessionsForAssignee(user.login),
    listChangeRequests(),
    listPendingProjectStatusSyncsForAssignee(user.login),
    env.settlementRuleV2Enabled
      ? listCompletionReportsForWork(user.login)
      : Promise.resolve([]),
    listWorkSessionLocks(user.login),
    loadSettlementAssignee(currentJstMonth(), user.login),
  ]);
  const sessionIds = new Set(sessions.map((session) => session.id));

  return {
    health,
    projectFetchError,
    issues: issues.filter((issue) => issue.assignees.includes(user.login)),
    openSessions,
    sessions: applyApprovedChangeRequests(sessions, requests).filter(
      (session) => sessionIds.has(session.id),
    ),
    sessionLocks,
    submissionNotice: submissionNextStep({
      month: currentJstMonth(),
      assignee: user.login,
      required: Boolean(settlement.summary?.approvalRequired),
      projectFetchError: settlement.projectFetchError,
      blockingReasons: settlement.submissionBlockingReasons,
      submission: settlement.submission,
    }),
    requests: requests.filter(
      (request) => request.assigneeLogin === user.login,
    ),
    statusSyncs,
    completionReports,
    settlementRuleV2Enabled: env.settlementRuleV2Enabled,
  };
};

export const actions = {
  cancelChange: async (event) => {
    const user = requireUser(event);
    const form = await event.request.formData();
    const result = await cancelWorkLogChange(
      String(form.get("requestId") ?? ""),
      user.login,
    );
    if (!result.ok)
      return fail(400, { scope: "changeRequests", message: result.message });
    return {
      scope: "changeRequests",
      message: "申請を取り消しました。元の稼働ログは変更されません。",
    };
  },
  start: async (event) => {
    const user = requireUser(event);
    const projectResult = await fetchProjectIssues()
      .then((result) => ({ ok: true as const, result }))
      .catch((error: unknown) => ({
        ok: false as const,
        message: projectFetchErrorMessage(error),
      }));
    if (!projectResult.ok) return fail(503, { message: projectResult.message });
    const result = await startIssueWork(
      await event.request.formData(),
      projectResult.result.issues,
      user.login,
    );
    if (!result.ok) return fail(400, { message: result.message });
    return { message: result.message ?? "稼働を開始しました。" };
  },
  stop: async (event) => {
    const user = requireUser(event);
    const result = await stopIssueWork(
      await event.request.formData(),
      user.login,
    );
    if (!result.ok) return fail(400, { message: result.message });
    return { message: "稼働を終了しました。" };
  },
  requestChange: async (event) => {
    const user = requireUser(event);
    const projectResult = await fetchProjectIssues()
      .then((result) => ({ ok: true as const, result }))
      .catch((error: unknown) => ({
        ok: false as const,
        message: projectFetchErrorMessage(error),
      }));
    if (!projectResult.ok) return fail(503, { message: projectResult.message });
    const result = await requestWorkLogChange(
      await event.request.formData(),
      projectResult.result.issues,
      user.login,
    );
    if (!result.ok) return fail(400, { message: result.message });
    return { message: "修正申請を登録しました。" };
  },
  reportCompletion: async (event) => {
    const user = requireUser(event);
    if (!env.settlementRuleV2Enabled) {
      return fail(503, {
        message: "新しい精算ルールはまだ有効ではありません。",
      });
    }
    const projectResult = await fetchProjectIssues()
      .then((result) => ({ ok: true as const, result }))
      .catch((error: unknown) => ({
        ok: false as const,
        message: projectFetchErrorMessage(error),
      }));
    if (!projectResult.ok) return fail(503, { message: projectResult.message });
    const result = await reportIssueCompletion(
      await event.request.formData(),
      projectResult.result.issues,
      user.login,
    );
    if (!result.ok) return fail(400, { message: result.message });
    return {
      message: `${result.report.settlementMonth}分として完了報告しました。`,
    };
  },
  withdrawCompletion: async (event) => {
    const user = requireUser(event);
    if (!env.settlementRuleV2Enabled) {
      return fail(503, {
        message: "新しい精算ルールはまだ有効ではありません。",
      });
    }
    const project = await fetchProjectIssuesForPage();
    if (project.projectFetchError)
      return fail(503, { message: project.projectFetchError });
    const result = await withdrawIssueCompletion(
      await event.request.formData(),
      project.issues,
      user.login,
    );
    if (!result.ok) return fail(400, { message: result.message });
    return { message: "完了報告を取り下げました。" };
  },
  retryStatusSync: async (event) => {
    const user = requireUser(event);
    const formData = await event.request.formData();
    const syncId = String(formData.get("syncId") ?? "");
    const result = await retryProjectStatusSync(
      syncId,
      user.login,
      user.isAdmin,
    );
    if (!result.ok) return fail(400, { message: result.message });
    return { message: result.message };
  },
};
