import { addMonths, isMonthString } from "$lib/month";
import type { MonthlyPayment } from "$lib/server/db/schema";
import {
  getPaymentRow,
  listPaymentRowsForMonth,
  upsertPaymentPaid,
  upsertPaymentScheduledDate,
  upsertPaymentUnpaid,
} from "$lib/server/payments/paymentRepository";
import { normalizeDateInput } from "$lib/server/payments/paymentDate";
import {
  PAYMENT_STATUS_LABELS,
  type MonthlyPaymentView,
} from "$lib/server/payments/paymentTypes";
import { validateSettlementPaymentEligibility } from "$lib/server/settlements/settlementService";

export { normalizeDateInput };

/**
 * 対象月の翌月14日を、デフォルトの支払い予定日として返す。
 * 例: "2026-06" -> "2026-07-14"
 */
export const defaultPaymentDueDate = (month: string): string => {
  if (!isMonthString(month)) return "";
  return `${addMonths(month, 1)}-14`;
};

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

/** 管理者による支払い済み登録。支払日を保存する。 */
export const markSettlementPaid = async (
  month: string,
  assigneeLogin: string,
  paidOnInput: string,
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
  const eligibility = await validateSettlementPaymentEligibility(
    month,
    assigneeLogin,
  );
  if (!eligibility.ok) return eligibility;
  const row = await upsertPaymentPaid({ month, assigneeLogin, paidOn });
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
