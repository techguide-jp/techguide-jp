import { error, fail, type RequestEvent } from "@sveltejs/kit";
import { requireUser } from "$lib/server/auth/guards";
import {
  loadWorkIssue,
  performIssueWorkAction,
  type IssueWorkAction,
} from "$lib/server/work/workIssueService";
import { parseWorkIssueRoute } from "$lib/server/work/workIssueRoute";

export const load = async (event) => {
  const user = requireUser(event);
  const ref = parseWorkIssueRoute(event.params);
  if (!ref) error(404, "案件URLが不正です。");
  const result = await loadWorkIssue(ref, user);
  if (!result.ok) error(result.status, result.message);
  return result;
};

const runAction = async (event: RequestEvent, action: IssueWorkAction) => {
  const user = requireUser(event);
  const ref = parseWorkIssueRoute(event.params);
  if (!ref) return fail(400, { message: "案件URLが不正です。" });
  const result = await performIssueWorkAction(
    ref,
    user,
    action,
    await event.request.formData(),
  );
  if (!result.ok) return fail(result.status, { message: result.message });
  return { message: result.message };
};

export const actions = {
  start: (event) => runAction(event, "start"),
  stop: (event) => runAction(event, "stop"),
  reportCompletion: (event) => runAction(event, "reportCompletion"),
  withdrawCompletion: (event) => runAction(event, "withdrawCompletion"),
};
