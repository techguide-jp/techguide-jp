import { randomUUID } from "node:crypto";
import { z } from "zod";
import { isIssueCompleted } from "$lib/issueCompletion";
import { currentJstMonth, isMonthString } from "$lib/month";
import type { ProjectIssue } from "$lib/server/github/projectTypes";
import { getPaymentRow } from "$lib/server/payments/paymentRepository";
import { listCompletionBackfillCandidates } from "$lib/server/completions/completionBackfillService";
import {
  confirmCompletionEligibility,
  replaceActiveCompletionReport,
} from "$lib/server/completions/completionRepository";

export const listCompletionMonthCandidates = async (
  issues: ProjectIssue[],
): Promise<ProjectIssue[]> =>
  listCompletionBackfillCandidates(issues.filter(isIssueCompleted));

const inputSchema = z.object({
  repository: z.string().min(1),
  issueNumber: z.coerce.number().int().positive(),
  assigneeLogin: z.string().min(1),
  settlementMonth: z
    .string()
    .refine(isMonthString, "精算月を指定してください。"),
});

export const assignCompletionMonth = async (
  formData: FormData,
  issues: ProjectIssue[],
  actorLogin: string,
): Promise<
  { ok: true; settlementMonth: string } | { ok: false; message: string }
> => {
  try {
    const input = inputSchema.parse(Object.fromEntries(formData));
    if (input.settlementMonth > currentJstMonth()) {
      return { ok: false, message: "未来の精算月は指定できません。" };
    }
    const issue = issues.find(
      (candidate) =>
        candidate.repository === input.repository &&
        candidate.number === input.issueNumber,
    );
    if (!issue || !isIssueCompleted(issue)) {
      return {
        ok: false,
        message: "IssueがClosedかつStatusがDoneのときに精算月を指定できます。",
      };
    }
    if (
      issue.assignees.length !== 1 ||
      issue.assignees[0] !== input.assigneeLogin
    ) {
      return {
        ok: false,
        message:
          "担当者が変更されているか、1人に設定されていません。再読み込みしてください。",
      };
    }
    if (
      (issue.rewardMode !== "固定" && issue.rewardMode !== "ハイブリッド") ||
      issue.fixedRewardYen === null ||
      issue.fixedRewardYen < 0
    ) {
      return { ok: false, message: "報酬方式と固定報酬額を設定してください。" };
    }
    const payment = await getPaymentRow(
      input.settlementMonth,
      input.assigneeLogin,
    );
    if (payment?.status === "paid") {
      return { ok: false, message: "支払い済み月には精算月を指定できません。" };
    }
    const report = await replaceActiveCompletionReport({
      id: randomUUID(),
      projectItemId: issue.projectItemId,
      repository: issue.repository,
      issueNumber: issue.number,
      issueTitle: issue.title,
      issueUrl: issue.url,
      assigneeLogin: input.assigneeLogin,
      settlementMonth: input.settlementMonth,
      // 管理者の操作日時と指定した精算月を分け、過去の完了報告日時を推測しない。
      reportedAt: new Date(),
      rewardMode: issue.rewardMode,
      fixedRewardYen: issue.fixedRewardYen,
      source: "admin_confirmation",
      evidenceUrl: issue.url,
      evidenceNote:
        "IssueがClosedかつProjectのStatusがDoneであることを確認して精算月を指定しました。",
      createdBy: actorLogin,
    });
    await confirmCompletionEligibility({ report, confirmedAt: new Date() });
    return { ok: true, settlementMonth: report.settlementMonth };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "精算月を登録できませんでした。",
    };
  }
};
