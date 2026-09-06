import { isMonthString } from "$lib/month";
import { z } from "zod";
import { PAYMENT_COMMENT_MAX_LENGTH } from "$lib/paymentComment";
import type { MonthlyPayment } from "$lib/server/db/schema";
import {
  getPaymentRow,
  listPaymentRowsForMonth,
  upsertPaymentPaid,
  upsertPaymentScheduledDate,
  upsertPaymentUnpaid,
} from "$lib/server/payments/paymentRepository";
import {
  defaultPaymentDueDate,
  normalizeDateInput,
} from "$lib/server/payments/paymentDate";
import {
  PAYMENT_STATUS_LABELS,
  type MonthlyPaymentView,
} from "$lib/server/payments/paymentTypes";
import { validateSettlementPaymentEligibility } from "$lib/server/settlements/settlementService";
import {
  dispatchPreparedNotification,
  prepareSettlementNotificationSafely,
} from "$lib/server/notifications/notificationService";
import { buildNotificationOperationId } from "$lib/server/notifications/notificationOperation";

export { normalizeDateInput, defaultPaymentDueDate };

const paymentCommentSchema = z.string().trim().max(PAYMENT_COMMENT_MAX_LENGTH);

const toPaymentView = (
  month: string,
  assigneeLogin: string,
  row: MonthlyPayment | null,
): MonthlyPaymentView => {
  const status = row?.status ?? "unpaid";
  const customScheduledDate = row?.scheduledDate ?? null;
  return {
    month,
    assigneeLogin,
    status,
    statusLabel: PAYMENT_STATUS_LABELS[status],
    paidOn: row?.paidOn ?? null,
    paymentComment: status === "paid" ? (row?.paymentComment ?? null) : null,
    scheduledDate: customScheduledDate ?? defaultPaymentDueDate(month),
    scheduledDateIsDefault: customScheduledDate === null,
    customScheduledDate,
  };
};

const canViewPayment = (
  targetLogin: string,
  viewer: { login: string; isAdmin: boolean },
): boolean => viewer.isAdmin || viewer.login === targetLogin;

/** 本人または管理者のみ支払い情報を閲覧できる。権限がなければ null。 */
export const getPaymentForViewer = async (
  month: string,
  assigneeLogin: string,
  viewer: { login: string; isAdmin: boolean } | null,
): Promise<MonthlyPaymentView | null> => {
  if (!viewer || !canViewPayment(assigneeLogin, viewer)) {
    return null;
  }
  const row = await getPaymentRow(month, assigneeLogin);
  return toPaymentView(month, assigneeLogin, row);
};

/** 月次一覧向け。assignee ごとの支払い情報ビューを返す。 */
export const listPaymentViewsForMonth = async (
  month: string,
  assigneeLogins: string[],
): Promise<MonthlyPaymentView[]> => {
  const uniqueLogins = [...new Set(assigneeLogins.filter(Boolean))];
  const rows = await listPaymentRowsForMonth(month);
  const rowByLogin = new Map(rows.map((row) => [row.assigneeLogin, row]));
  return uniqueLogins.map((login) =>
    toPaymentView(month, login, rowByLogin.get(login) ?? null),
  );
};

/** 管理者による支払い済み登録。支払日と本人向けコメントを保存する。 */
export const markSettlementPaid = async (
  month: string,
  assigneeLogin: string,
  paidOnInput: string,
  paymentCommentInput = "",
): Promise<
  { ok: true; payment: MonthlyPaymentView } | { ok: false; message: string }
> => {
  if (!isMonthString(month)) {
    return { ok: false, message: "対象月が不正です。" };
  }
  const paidOn = normalizeDateInput(paidOnInput);
  if (!paidOn) {
    return { ok: false, message: "支払日はYYYY-MM-DD形式で入力してください。" };
  }
  const comment = paymentCommentSchema.safeParse(
    paymentCommentInput.replace(/\r\n?/g, "\n"),
  );
  if (!comment.success) {
    return {
      ok: false,
      message: `作業者へのコメントは${PAYMENT_COMMENT_MAX_LENGTH.toLocaleString("ja-JP")}文字以内で入力してください。`,
    };
  }
  const paymentComment = comment.data || null;
  const eligibility = await validateSettlementPaymentEligibility(
    month,
    assigneeLogin,
  );
  if (!eligibility.ok) return eligibility;
  const current = await getPaymentRow(month, assigneeLogin);
  if (current?.status === "paid") {
    return { ok: false, message: "すでに支払い済みとして登録されています。" };
  }
  const updatedAt = new Date(
    Math.max(Date.now(), (current?.updatedAt.getTime() ?? -1) + 1),
  );
  const emailNotification = await prepareSettlementNotificationSafely({
    // 本人向け支払いコメントは月次詳細だけに表示し、メールや通知履歴には含めない。
    type: "settlement_paid",
    // 現在の未処理レコード版を使い、複数タブは束ねつつ取り消し後の再登録は別操作にする。
    operationId: buildNotificationOperationId(
      "settlement-paid",
      current?.updatedAt.toISOString() ?? "new",
      paidOn,
    ),
    month,
    assigneeLogin,
    workerDisplayName: assigneeLogin,
    occurredAt: updatedAt,
    taxExcludedYen: eligibility.taxExcludedYen,
    taxIncludedYen: eligibility.taxIncludedYen,
    paidOn,
  });
  const row = await upsertPaymentPaid(
    { month, assigneeLogin, paidOn, paymentComment },
    {
      updatedAt,
      expectedUpdatedAt: current?.updatedAt ?? null,
      ...(emailNotification.mode === "resend"
        ? { notification: emailNotification.write }
        : {}),
    },
  );
  if (!row) {
    return {
      ok: false,
      message:
        "支払い状態が別の操作で更新されました。画面を再読み込みしてください。",
    };
  }
  await dispatchPreparedNotification(emailNotification);
  return { ok: true, payment: toPaymentView(month, assigneeLogin, row) };
};

/** 管理者による支払い済み登録の取り消し。未処理に戻す。 */
export const revertSettlementPayment = async (
  month: string,
  assigneeLogin: string,
): Promise<
  { ok: true; payment: MonthlyPaymentView } | { ok: false; message: string }
> => {
  if (!isMonthString(month)) {
    return { ok: false, message: "対象月が不正です。" };
  }
  const current = await getPaymentRow(month, assigneeLogin);
  if (current?.status !== "paid") {
    return { ok: false, message: "支払い済みの精算ではありません。" };
  }
  const row = await upsertPaymentUnpaid({ month, assigneeLogin });
  return { ok: true, payment: toPaymentView(month, assigneeLogin, row) };
};

/**
 * 管理者による支払い予定日の更新。空文字ならデフォルト（翌月14日）に戻す。
 * 支払い状態とは独立した項目として扱う。
 */
export const updatePaymentScheduledDate = async (
  month: string,
  assigneeLogin: string,
  scheduledDateInput: string,
): Promise<
  { ok: true; payment: MonthlyPaymentView } | { ok: false; message: string }
> => {
  if (!isMonthString(month)) {
    return { ok: false, message: "対象月が不正です。" };
  }
  const trimmed = scheduledDateInput.trim();
  let scheduledDate: string | null = null;
  if (trimmed !== "") {
    scheduledDate = normalizeDateInput(trimmed);
    if (!scheduledDate) {
      return {
        ok: false,
        message: "支払い予定日はYYYY-MM-DD形式で入力してください。",
      };
    }
  }
  const eligibility = await validateSettlementPaymentEligibility(
    month,
    assigneeLogin,
  );
  if (!eligibility.ok) return eligibility;
  const row = await upsertPaymentScheduledDate({
    month,
    assigneeLogin,
    scheduledDate,
  });
  return { ok: true, payment: toPaymentView(month, assigneeLogin, row) };
};
