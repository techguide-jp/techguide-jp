import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createAuditLog } from "$lib/server/audit/auditRepository";
import type { IssueCompletionReport } from "$lib/server/db/schema";
import type { ProjectIssue } from "$lib/server/github/projectTypes";
import { getPaymentRow } from "$lib/server/payments/paymentRepository";
import { toJstMonth, parseJstDatetimeLocal } from "$lib/server/time";
import { findOpenWorkSession } from "$lib/server/work/workRepository";
import {
  confirmCompletionEligibility,
  getActiveCompletionReport,
  invalidateActiveCompletionReport,
  listActiveCompletionReports,
  listCompletionReportsForAssignee,
  replaceActiveCompletionReport,
} from "$lib/server/completions/completionRepository";

const issueInputSchema = z.object({
  repository: z.string().min(1),
  issueNumber: z.coerce.number().int().positive(),
});

const backfillSchema = issueInputSchema.extend({
  assigneeLogin: z.string().min(1),
  reportedAt: z.string().min(1),
  evidenceUrl: z.string().url().max(2000),
  evidenceNote: z.string().trim().min(1).max(2000),
});

const findAssignedIssue = (
  issues: ProjectIssue[],
  repository: string,
  issueNumber: number,
  assigneeLogin: string,
): ProjectIssue => {
  const issue = issues.find(
    (candidate) =>
      candidate.repository === repository &&
      candidate.number === issueNumber &&
      candidate.assignees.includes(assigneeLogin),
  );
  if (!issue) throw new Error("Project内の担当Issueが見つかりません。");
  if (issue.assignees.length !== 1) {
    throw new Error("完了報告はassigneeが1人のIssueだけ提出できます。");
  }
  if (issue.rewardMode !== "固定" && issue.rewardMode !== "ハイブリッド") {
    throw new Error("報酬方式を設定してから完了報告してください。");
  }
  if (issue.fixedRewardYen === null || issue.fixedRewardYen < 0) {
    throw new Error("固定報酬額を設定してから完了報告してください。");
  }
  return issue;
};

const writeReport = async (input: {
  issue: ProjectIssue;
  assigneeLogin: string;
  reportedAt: Date;
  source: "worker" | "admin_backfill";
  evidenceUrl?: string;
  evidenceNote?: string;
  actorLogin: string;
}): Promise<IssueCompletionReport> =>
  replaceActiveCompletionReport({
    id: randomUUID(),
    projectItemId: input.issue.projectItemId,
    repository: input.issue.repository,
    issueNumber: input.issue.number,
    issueTitle: input.issue.title,
    issueUrl: input.issue.url,
    assigneeLogin: input.assigneeLogin,
    settlementMonth: toJstMonth(input.reportedAt),
    reportedAt: input.reportedAt,
    rewardMode: input.issue.rewardMode as "固定" | "ハイブリッド",
    fixedRewardYen: input.issue.fixedRewardYen ?? 0,
    source: input.source,
    evidenceUrl: input.evidenceUrl,
    evidenceNote: input.evidenceNote,
    createdBy: input.actorLogin,
  });

export const reportIssueCompletion = async (
  formData: FormData,
  issues: ProjectIssue[],
  userLogin: string,
): Promise<
  { ok: true; report: IssueCompletionReport } | { ok: false; message: string }
> => {
  try {
    const input = issueInputSchema.parse(Object.fromEntries(formData));
    const issue = findAssignedIssue(
      issues,
      input.repository,
      input.issueNumber,
      userLogin,
    );
    const openSession = await findOpenWorkSession(
      userLogin,
      issue.repository,
      issue.number,
    );
    if (openSession) {
      return { ok: false, message: "稼働を終了してから完了報告してください。" };
    }
    const current = await getActiveCompletionReport({
      repository: issue.repository,
      issueNumber: issue.number,
      assigneeLogin: userLogin,
    });
    if (current?.eligibilityConfirmedAt) {
      return {
        ok: false,
        message: "Issue完了確認済みの完了報告は変更できません。",
      };
    }
    const report = await writeReport({
      issue,
      assigneeLogin: userLogin,
      reportedAt: new Date(),
      source: "worker",
      actorLogin: userLogin,
    });
    return { ok: true, report };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "完了報告に失敗しました。",
    };
  }
};

export const withdrawIssueCompletion = async (
  formData: FormData,
  userLogin: string,
): Promise<{ ok: true } | { ok: false; message: string }> => {
  try {
    const input = issueInputSchema.parse(Object.fromEntries(formData));
    const current = await getActiveCompletionReport({
      repository: input.repository,
      issueNumber: input.issueNumber,
      assigneeLogin: userLogin,
    });
    if (current?.eligibilityConfirmedAt) {
      return {
        ok: false,
        message: "Issue完了確認済みの完了報告は取り下げできません。",
      };
    }
    const count = await invalidateActiveCompletionReport({
      repository: input.repository,
      issueNumber: input.issueNumber,
      assigneeLogin: userLogin,
      invalidatedBy: userLogin,
      reason: "作業者が完了報告を取り下げました。",
    });
    if (count > 0) {
      await createAuditLog({
        actorLogin: userLogin,
        action: "issue_completion_invalidated",
        targetType: "project_issue",
        targetId: `${input.repository}#${input.issueNumber}`,
        details: { reason: "worker_withdrawal" },
      });
    }
    return count > 0
      ? { ok: true }
      : { ok: false, message: "有効な完了報告が見つかりません。" };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "完了報告の取り下げに失敗しました。",
    };
  }
};

export const backfillIssueCompletion = async (
  formData: FormData,
  issues: ProjectIssue[],
  actorLogin: string,
): Promise<
  { ok: true; report: IssueCompletionReport } | { ok: false; message: string }
> => {
  try {
    const input = backfillSchema.parse(Object.fromEntries(formData));
    const reportedAt = parseJstDatetimeLocal(input.reportedAt);
    if (!reportedAt) return { ok: false, message: "完了日時が不正です。" };
    if (reportedAt > new Date()) {
      return { ok: false, message: "未来の完了日時は登録できません。" };
    }
    const month = toJstMonth(reportedAt);
    if (month < "2026-08") {
      return {
        ok: false,
        message: "移行登録は2026年8月分以降だけが対象です。",
      };
    }
    const payment = await getPaymentRow(month, input.assigneeLogin);
    if (payment?.status === "paid") {
      return { ok: false, message: "支払い済み月へ完了報告は追加できません。" };
    }
    const issue = findAssignedIssue(
      issues,
      input.repository,
      input.issueNumber,
      input.assigneeLogin,
    );
    const active = await getActiveCompletionReport({
      repository: issue.repository,
      issueNumber: issue.number,
      assigneeLogin: input.assigneeLogin,
    });
    if (active) {
      return {
        ok: false,
        message: "有効な完了報告がすでにあるため移行登録できません。",
      };
    }
    const report = await writeReport({
      issue,
      assigneeLogin: input.assigneeLogin,
      reportedAt,
      source: "admin_backfill",
      evidenceUrl: input.evidenceUrl,
      evidenceNote: input.evidenceNote,
      actorLogin,
    });
    return { ok: true, report };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "完了報告の移行登録に失敗しました。",
    };
  }
};

export const listCompletionReportsForWork = async (
  assigneeLogin: string,
): Promise<IssueCompletionReport[]> =>
  listCompletionReportsForAssignee(assigneeLogin);

export const reconcileCompletionReports = async (
  issues: ProjectIssue[],
): Promise<{ base: number; supplemental: number }> => {
  const issueByKey = new Map(
    issues.map((issue) => [`${issue.repository}#${issue.number}`, issue]),
  );
  const reports = await listActiveCompletionReports();
  let base = 0;
  let supplemental = 0;

  for (const report of reports) {
    const issue = issueByKey.get(`${report.repository}#${report.issueNumber}`);
    // 支払対象の完了条件はIssueのclosedかつDone。関連PRの有無・状態は条件に含めない。
    if (
      !issue ||
      issue.state !== "CLOSED" ||
      issue.status !== "Done" ||
      issue.assignees.length !== 1
    )
      continue;
    const result = await confirmCompletionEligibility({
      report,
      confirmedAt: new Date(),
    });
    if (result === "base") base += 1;
    if (result === "supplemental") supplemental += 1;
  }

  return { base, supplemental };
};
