import { z } from "zod";
import { setProjectItemStatus } from "$lib/server/github/projectClient";
import { recordProjectStatusSyncFailure } from "$lib/server/github/statusSyncService";
import type { ProjectIssue } from "$lib/server/github/projectTypes";
import { parseJstDatetimeLocal } from "$lib/server/time";
import {
  createChangeRequest,
  createWorkSession,
  endWorkSession,
  findOpenWorkSession,
  getWorkSessionById,
} from "$lib/server/work/workRepository";

const issueInputSchema = z.object({
  repository: z.string().min(1),
  issueNumber: z.coerce.number().int().positive(),
});

const changeRequestSchema = z.object({
  requestType: z.enum(["add", "edit", "exclude"]),
  issueKey: z.string().min(1),
  targetSessionId: z.string().uuid().optional().or(z.literal("")),
  requestedStartedAt: z.string().optional(),
  requestedEndedAt: z.string().optional(),
  reason: z.string().min(1).max(1000),
});

const findProjectIssue = (
  issues: ProjectIssue[],
  repository: string,
  issueNumber: number,
  assigneeLogin: string,
): ProjectIssue => {
  const issue = issues.find((candidate) => {
    return (
      candidate.repository === repository &&
      candidate.number === issueNumber &&
      candidate.assignees.includes(assigneeLogin)
    );
  });

  if (!issue) {
    throw new Error("Project内の担当Issueが見つかりません。");
  }
  return issue;
};

const parseIssueKey = (
  issueKey: string,
): { repository: string; issueNumber: number } => {
  const separatorIndex = issueKey.lastIndexOf("#");
  if (separatorIndex <= 0) {
    throw new Error("Issueの指定が不正です。");
  }

  const repository = issueKey.slice(0, separatorIndex);
  const issueNumber = Number(issueKey.slice(separatorIndex + 1));
  if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
    throw new Error("Issue番号が不正です。");
  }

  return { repository, issueNumber };
};

const isUniqueViolation = (error: unknown): boolean => {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
};

const isClosedForNormalWork = (issue: ProjectIssue): boolean =>
  issue.state === "CLOSED" || issue.status === "Done";

export const startIssueWork = async (
  formData: FormData,
  issues: ProjectIssue[],
  userLogin: string,
): Promise<{ ok: true; message?: string } | { ok: false; message: string }> => {
  try {
    const input = issueInputSchema.parse(Object.fromEntries(formData));
    const issue = findProjectIssue(
      issues,
      input.repository,
      input.issueNumber,
      userLogin,
    );
    if (isClosedForNormalWork(issue)) {
      return {
        ok: false,
        message:
          "完了済みのIssueは稼働開始できません。必要な場合は追加申請を使ってください。",
      };
    }
    const existing = await findOpenWorkSession(
      userLogin,
      issue.repository,
      issue.number,
    );
    if (existing) {
      return { ok: false, message: "このIssueはすでに稼働中です。" };
    }

    try {
      await createWorkSession({
        assigneeLogin: userLogin,
        repository: issue.repository,
        issueNumber: issue.number,
        issueTitle: issue.title,
        createdBy: userLogin,
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return { ok: false, message: "このIssueはすでに稼働中です。" };
      }
      throw error;
    }

    if (issue.status === "Todo") {
      try {
        await setProjectItemStatus(issue.projectItemId, "In Progress");
        return {
          ok: true,
          message: "稼働を開始し、StatusをIn Progressに更新しました。",
        };
      } catch (error) {
        try {
          await recordProjectStatusSyncFailure(
            issue,
            userLogin,
            "In Progress",
            error,
          );
        } catch {
          // 稼働ログ作成は成功済みなので、再同期キュー保存の失敗で開始自体は取り消さない。
        }
        return {
          ok: true,
          message:
            "稼働を開始しましたが、GitHub ProjectのStatus更新に失敗しました。あとで稼働画面から再同期できます。",
        };
      }
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "稼働開始に失敗しました。",
    };
  }
};

export const stopIssueWork = async (
  formData: FormData,
  userLogin: string,
): Promise<{ ok: true } | { ok: false; message: string }> => {
  const sessionId = String(formData.get("sessionId") ?? "");
  if (!sessionId) {
    return { ok: false, message: "終了対象の稼働ログが見つかりません。" };
  }

  const session = await endWorkSession(sessionId, userLogin);
  if (!session) {
    return {
      ok: false,
      message: "稼働終了に失敗しました。すでに終了済みの可能性があります。",
    };
  }

  return { ok: true };
};

export const requestWorkLogChange = async (
  formData: FormData,
  issues: ProjectIssue[],
  userLogin: string,
): Promise<{ ok: true } | { ok: false; message: string }> => {
  try {
    const input = changeRequestSchema.parse(Object.fromEntries(formData));
    const parsedIssue = parseIssueKey(input.issueKey);
    const issue = findProjectIssue(
      issues,
      parsedIssue.repository,
      parsedIssue.issueNumber,
      userLogin,
    );
    const startedAt = input.requestedStartedAt
      ? parseJstDatetimeLocal(input.requestedStartedAt)
      : undefined;
    const endedAt = input.requestedEndedAt
      ? parseJstDatetimeLocal(input.requestedEndedAt)
      : undefined;

    if (
      (input.requestType === "edit" || input.requestType === "exclude") &&
      !input.targetSessionId
    ) {
      return { ok: false, message: "修正・除外申請には対象ログIDが必要です。" };
    }
    if (
      (input.requestType === "add" || input.requestType === "edit") &&
      (!startedAt || !endedAt)
    ) {
      return {
        ok: false,
        message: "追加・修正申請には開始時刻と終了時刻が必要です。",
      };
    }
    if (startedAt && endedAt && startedAt >= endedAt) {
      return { ok: false, message: "終了時刻は開始時刻より後にしてください。" };
    }
    if (
      (startedAt && Number.isNaN(startedAt.getTime())) ||
      (endedAt && Number.isNaN(endedAt.getTime()))
    ) {
      return { ok: false, message: "日時の形式が不正です。" };
    }
    const requestedStartedAt = startedAt ?? undefined;
    const requestedEndedAt = endedAt ?? undefined;

    if (input.targetSessionId) {
      const targetSession = await getWorkSessionById(input.targetSessionId);
      if (!targetSession) {
        return { ok: false, message: "対象ログが見つかりません。" };
      }
      if (
        targetSession.assigneeLogin !== userLogin ||
        targetSession.repository !== issue.repository ||
        targetSession.issueNumber !== issue.number
      ) {
        return {
          ok: false,
          message: "対象ログとIssueの組み合わせが不正です。",
        };
      }
      if (!targetSession.endedAt) {
        return {
          ok: false,
          message:
            "計測中のログは修正・除外申請できません。終了してから申請してください。",
        };
      }
    }

    await createChangeRequest({
      requestType: input.requestType,
      assigneeLogin: userLogin,
      repository: issue.repository,
      issueNumber: issue.number,
      issueTitle: issue.title,
      targetSessionId: input.targetSessionId || undefined,
      requestedStartedAt,
      requestedEndedAt,
      reason: input.reason,
      requestedBy: userLogin,
    });

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "修正申請に失敗しました。",
    };
  }
};
