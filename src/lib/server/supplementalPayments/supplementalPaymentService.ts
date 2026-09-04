import { z } from "zod";
import { normalizeDateInput } from "$lib/server/payments/paymentDate";
import {
  jstDateString,
  noticeSkipMessage,
  prepareNoticeWriteInput,
} from "$lib/server/notices/noticeService";
import type { NoticeSkipReason } from "$lib/server/notices/noticeTypes";
import {
  dispatchPreparedNotification,
  prepareSettlementNotificationSafely,
} from "$lib/server/notifications/notificationService";
import { buildNotificationOperationId } from "$lib/server/notifications/notificationOperation";
import type { SettlementSummary } from "$lib/server/settlements/settlementTypes";
import {
  getSupplementalPaymentWithReport,
  listSupplementalPaymentsWithReports,
  markSupplementalPaymentPaid as persistPaid,
  revertSupplementalPayment as persistReverted,
  scheduleSupplementalPayment as persistScheduled,
} from "$lib/server/supplementalPayments/supplementalPaymentRepository";

const idSchema = z.string().uuid();

const toNoticeSummary = (
  record: NonNullable<
    Awaited<ReturnType<typeof getSupplementalPaymentWithReport>>
  >,
): SettlementSummary => {
  const { payment, report } = record;
  const issue = {
    projectItemId: report.projectItemId,
    repository: report.repository,
    number: report.issueNumber,
    title: report.issueTitle,
    state: "CLOSED" as const,
    url: report.issueUrl,
    createdAt: report.reportedAt.toISOString(),
    closedAt: report.eligibilityConfirmedAt?.toISOString() ?? null,
    assignees: [report.assigneeLogin],
    status: "Done",
    rewardMode: report.rewardMode,
    fixedRewardYen: report.fixedRewardYen,
    extraCapYen: null,
    hourlyRateYen: null,
  };
  return {
    month: payment.month,
    assigneeLogin: payment.assigneeLogin,
    fixedRewardYen: payment.taxExcludedYen,
    timedRewardYen: 0,
    taxExcludedYen: payment.taxExcludedYen,
    taxYen: payment.taxYen,
    taxIncludedYen: payment.taxIncludedYen,
    lines: [
      {
        issue,
        assigneeLogin: payment.assigneeLogin,
        fixedRewardYen: payment.taxExcludedYen,
        workMinutes: 0,
        timedRewardYen: 0,
        taxExcludedYen: payment.taxExcludedYen,
        warnings: [],
        sessions: [],
        hourlyRateYenSnapshot: null,
        completionReportId: report.id,
      },
    ],
    pendingRequests: [],
    unsettledProjectIssues: [],
    unsettledIssueSessions: [],
    approvalRequired: true,
    blockingReasons: [],
    completionReports: [report],
    supplementalPayments: [payment],
  };
};

export const listSupplementalPaymentViews = async (
  month?: string,
  assigneeLogin?: string,
) => listSupplementalPaymentsWithReports(month, assigneeLogin);

export const scheduleSupplementalPayment = async (input: {
  id: string;
  scheduledDateInput: string;
  actorLogin: string;
}): Promise<
  | { ok: true }
  | { ok: false; message: string; noticeSkippedReason?: NoticeSkipReason }
> => {
  const parsedId = idSchema.safeParse(input.id);
  const scheduledDate = normalizeDateInput(input.scheduledDateInput);
  if (!parsedId.success) {
    return { ok: false, message: "追加支払いIDが不正です。" };
  }
  if (!scheduledDate) {
    return {
      ok: false,
      message: "支払い予定日はYYYY-MM-DD形式で入力してください。",
    };
  }
  const record = await getSupplementalPaymentWithReport(parsedId.data);
  if (!record) return { ok: false, message: "追加支払いが見つかりません。" };
  if (record.payment.status === "paid") {
    return { ok: false, message: "支払い済みの追加支払いは変更できません。" };
  }
  if (record.payment.scheduledDate) {
    return {
      ok: false,
      message: "支払い予定日は設定済みです。通知書の固定後は変更できません。",
    };
  }

  const now = new Date(
    Math.max(Date.now(), record.payment.updatedAt.getTime() + 1),
  );
  const summary = toNoticeSummary(record);
  const preparedNotice = await prepareNoticeWriteInput({
    supplementalPaymentId: record.payment.id,
    month: record.payment.month,
    assigneeLogin: record.payment.assigneeLogin,
    summary,
    scheduledDate,
    approvedBy: input.actorLogin,
    approvedAt: now.toISOString(),
    issuedOn: jstDateString(now),
    createdBy: input.actorLogin,
  });
  if (!preparedNotice.ok) {
    return {
      ok: false,
      message: noticeSkipMessage(preparedNotice.reason),
      noticeSkippedReason: preparedNotice.reason,
    };
  }
  const notification = await prepareSettlementNotificationSafely({
    type: "supplemental_payment_scheduled",
    operationId: buildNotificationOperationId(
      "supplemental-payment-scheduled",
      record.payment.id,
      record.payment.updatedAt.toISOString(),
    ),
    month: record.payment.month,
    assigneeLogin: record.payment.assigneeLogin,
    workerDisplayName: record.payment.assigneeLogin,
    occurredAt: now,
    taxExcludedYen: record.payment.taxExcludedYen,
    taxIncludedYen: record.payment.taxIncludedYen,
    scheduledDate,
    hasPaymentNotice: true,
    supplementalPaymentId: record.payment.id,
  });
  const updated = await persistScheduled({
    id: record.payment.id,
    scheduledDate,
    actorLogin: input.actorLogin,
    updatedAt: now,
    expectedUpdatedAt: record.payment.updatedAt,
    notice: preparedNotice.notice,
    ...(notification.mode === "resend"
      ? { notification: notification.write }
      : {}),
  });
  if (!updated) {
    return {
      ok: false,
      message:
        "追加支払いが別の操作で更新されました。画面を再読み込みしてください。",
    };
  }
  await dispatchPreparedNotification(notification);
  return { ok: true };
};

export const markSupplementalPaymentPaid = async (input: {
  id: string;
  paidOnInput: string;
  actorLogin: string;
}): Promise<{ ok: true } | { ok: false; message: string }> => {
  const parsedId = idSchema.safeParse(input.id);
  const paidOn = normalizeDateInput(input.paidOnInput);
  if (!parsedId.success) {
    return { ok: false, message: "追加支払いIDが不正です。" };
  }
  if (!paidOn) {
    return { ok: false, message: "支払日はYYYY-MM-DD形式で入力してください。" };
  }
  const record = await getSupplementalPaymentWithReport(parsedId.data);
  if (!record) return { ok: false, message: "追加支払いが見つかりません。" };
  if (record.payment.status === "paid") {
    return { ok: false, message: "すでに支払い済みです。" };
  }
  if (!record.payment.scheduledDate) {
    return { ok: false, message: "先に支払い予定日を設定してください。" };
  }
  const now = new Date(
    Math.max(Date.now(), record.payment.updatedAt.getTime() + 1),
  );
  const notification = await prepareSettlementNotificationSafely({
    type: "supplemental_payment_paid",
    operationId: buildNotificationOperationId(
      "supplemental-payment-paid",
      record.payment.id,
      record.payment.updatedAt.toISOString(),
      paidOn,
    ),
    month: record.payment.month,
    assigneeLogin: record.payment.assigneeLogin,
    workerDisplayName: record.payment.assigneeLogin,
    occurredAt: now,
    taxExcludedYen: record.payment.taxExcludedYen,
    taxIncludedYen: record.payment.taxIncludedYen,
    paidOn,
    supplementalPaymentId: record.payment.id,
  });
  const updated = await persistPaid({
    id: record.payment.id,
    paidOn,
    actorLogin: input.actorLogin,
    updatedAt: now,
    expectedUpdatedAt: record.payment.updatedAt,
    ...(notification.mode === "resend"
      ? { notification: notification.write }
      : {}),
  });
  if (!updated) {
    return {
      ok: false,
      message:
        "追加支払いが別の操作で更新されました。画面を再読み込みしてください。",
    };
  }
  await dispatchPreparedNotification(notification);
  return { ok: true };
};

export const revertSupplementalPayment = async (input: {
  id: string;
  actorLogin: string;
}): Promise<{ ok: true } | { ok: false; message: string }> => {
  const parsedId = idSchema.safeParse(input.id);
  if (!parsedId.success) {
    return { ok: false, message: "追加支払いIDが不正です。" };
  }
  const record = await getSupplementalPaymentWithReport(parsedId.data);
  if (!record) return { ok: false, message: "追加支払いが見つかりません。" };
  if (record.payment.status !== "paid") {
    return { ok: false, message: "支払い済みの追加支払いではありません。" };
  }
  const now = new Date(
    Math.max(Date.now(), record.payment.updatedAt.getTime() + 1),
  );
  const updated = await persistReverted({
    id: record.payment.id,
    actorLogin: input.actorLogin,
    updatedAt: now,
    expectedUpdatedAt: record.payment.updatedAt,
  });
  return updated
    ? { ok: true }
    : {
        ok: false,
        message:
          "追加支払いが別の操作で更新されました。画面を再読み込みしてください。",
      };
};
