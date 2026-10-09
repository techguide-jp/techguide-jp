import type { SessionUser } from "$lib/server/auth/session";
import { env } from "$lib/server/env";
import { fetchProjectIssuesForPage } from "$lib/server/github/projectClient";
import { fetchIssueDescription } from "$lib/server/github/issueDetailClient";
import {
  listCompletionReportsForWork,
  reportIssueCompletion,
  withdrawIssueCompletion,
} from "$lib/server/completions/completionService";
import {
  getWorkSessionById,
  listWorkSessionsForAssignee,
  listChangeRequests,
} from "$lib/server/work/workRepository";
import { startIssueWork, stopIssueWork } from "$lib/server/work/workService";
import { applyApprovedChangeRequests } from "$lib/server/settlements/settlementCalculator";
import type { WorkIssueRef } from "$lib/workIssueRoute";
import type { ProjectIssue } from "$lib/server/github/projectTypes";
import type { WorkSession, IssueCompletionReport } from "$lib/server/db/schema";
import type { IssueDescription } from "$lib/server/github/issueDetailClient";
import { z } from "zod";

type Failure = { ok: false; status: 403 | 404 | 503 | 400; message: string };
export type WorkIssueDetails = IssueDescription & {
  ok: true;
  issue: ProjectIssue;
  descriptionError: string | null;
  isAssignee: boolean;
  sessions: WorkSession[];
  openSession: WorkSession | null;
  completionReport: IssueCompletionReport | null;
  settlementRuleV2Enabled: boolean;
};
const matchesIssue = (row: WorkIssueRef, ref: WorkIssueRef): boolean =>
  row.repository === ref.repository && row.issueNumber === ref.issueNumber;

export const findAccessibleWorkIssue = async (
  ref: WorkIssueRef,
  user: SessionUser,
): Promise<{ ok: true; issue: ProjectIssue } | Failure> => {
  const project = await fetchProjectIssuesForPage();
  if (project.projectFetchError)
    return {
      ok: false,
      status: 503,
      message: project.projectFetchError,
    } as const;
  const issue = project.issues.find(
    (item) =>
      item.repository === ref.repository && item.number === ref.issueNumber,
  );
  // URLを知っていても閲覧権限は得られない。本文の取得より先にProject内の担当を確認する。
  if (!issue || (!user.isAdmin && !issue.assignees.includes(user.login)))
    return {
      ok: false,
      status: 404,
      message:
        "この案件は見つからないか、閲覧権限がありません。担当者設定を依頼者に確認してください。",
    } as const;
  return { ok: true, issue } as const;
};

export const loadWorkIssue = async (
  ref: WorkIssueRef,
  user: SessionUser,
): Promise<WorkIssueDetails | Failure> => {
  const access = await findAccessibleWorkIssue(ref, user);
  if (!access.ok) return access;
  const [description, sessions, requests, reports] = await Promise.all([
    fetchIssueDescription(ref)
      .then((value) => ({ ...value, descriptionError: null }))
      .catch(() => ({
        body: "",
        labels: [] as string[],
        descriptionError:
          "依頼内容を取得できませんでした。GitHubで内容を確認するか、時間をおいて再読み込みしてください。",
      })),
    listWorkSessionsForAssignee(user.login),
    listChangeRequests(),
    env.settlementRuleV2Enabled
      ? listCompletionReportsForWork(user.login)
      : Promise.resolve([]),
  ]);
  const ownRequests = requests.filter(
    (request) => request.assigneeLogin === user.login,
  );
  return {
    ok: true,
    issue: access.issue,
    ...description,
    isAssignee: access.issue.assignees.includes(user.login),
    sessions: applyApprovedChangeRequests(sessions, ownRequests).filter(
      (session) => matchesIssue(session, ref),
    ),
    openSession:
      sessions.find(
        (session) => matchesIssue(session, ref) && !session.endedAt,
      ) ?? null,
    completionReport:
      reports.find(
        (report) => matchesIssue(report, ref) && !report.invalidatedAt,
      ) ?? null,
    settlementRuleV2Enabled: env.settlementRuleV2Enabled,
  } as const;
};

export type IssueWorkAction =
  | "start"
  | "stop"
  | "reportCompletion"
  | "withdrawCompletion";
export const performIssueWorkAction = async (
  ref: WorkIssueRef,
  user: SessionUser,
  action: IssueWorkAction,
  input: FormData,
): Promise<{ ok: true; message: string } | Failure> => {
  const access = await findAccessibleWorkIssue(ref, user);
  if (!access.ok) return access;
  if (!access.issue.assignees.includes(user.login))
    return {
      ok: false,
      status: 403,
      message: "稼働・完了報告は担当者本人が操作してください。",
    };
  const form = new FormData();
  // 直接POSTでも別案件にすり替えられないよう、対象はURLから確定する。
  form.set("repository", ref.repository);
  form.set("issueNumber", String(ref.issueNumber));
  if (action === "stop") {
    const sessionId = String(input.get("sessionId") ?? "");
    if (!z.string().uuid().safeParse(sessionId).success)
      return { ok: false, status: 400, message: "稼働ログの指定が不正です。" };
    const session = await getWorkSessionById(sessionId);
    if (
      !session ||
      session.assigneeLogin !== user.login ||
      !matchesIssue(session, ref)
    )
      return {
        ok: false,
        status: 400,
        message: "この案件の稼働ログが見つかりません。",
      };
    form.set("sessionId", sessionId);
    const result = await stopIssueWork(form, user.login);
    return result.ok
      ? { ok: true, message: "稼働を終了しました。" }
      : { ...result, status: 400 };
  }
  if (action === "start") {
    const result = await startIssueWork(form, [access.issue], user.login);
    return result.ok
      ? { ok: true, message: result.message ?? "稼働を開始しました。" }
      : { ...result, status: 400 };
  }
  if (!env.settlementRuleV2Enabled)
    return {
      ok: false,
      status: 503,
      message: "新しい精算ルールはまだ有効ではありません。",
    };
  if (action === "reportCompletion") {
    const result = await reportIssueCompletion(
      form,
      [access.issue],
      user.login,
    );
    return result.ok
      ? {
          ok: true,
          message: `${result.report.settlementMonth}分として完了報告しました。`,
        }
      : { ...result, status: 400 };
  }
  const result = await withdrawIssueCompletion(
    form,
    [access.issue],
    user.login,
  );
  return result.ok
    ? { ok: true, message: "完了報告を取り下げました。" }
    : { ...result, status: 400 };
};
