export type PaymentStatus = "unpaid" | "paid";

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  unpaid: "未処理",
  paid: "支払い済み",
};

/**
 * 月次精算1件分の支払い情報。稼働者・管理者どちらの画面でも共通で使う。
 * 支払い状態と支払い予定日は別項目として扱う。
 */
export type MonthlyPaymentView = {
  month: string;
  assigneeLogin: string;
  status: PaymentStatus;
  statusLabel: string;
  /** 支払い済み時の支払日（YYYY-MM-DD）。未処理なら null。 */
  paidOn: string | null;
  /** 画面表示に使う支払い予定日（YYYY-MM-DD）。個別未設定なら翌月14日。 */
  scheduledDate: string;
  /** 支払い予定日が個別設定ではなくデフォルト（翌月14日）かどうか。 */
  scheduledDateIsDefault: boolean;
  /** 個別に保存された支払い予定日（YYYY-MM-DD）。未設定なら null。 */
  customScheduledDate: string | null;
};
