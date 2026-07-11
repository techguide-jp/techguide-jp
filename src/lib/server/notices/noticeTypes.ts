export const NOTICE_DOCUMENT_SCHEMA_VERSION = 1;

/** 通知書に表示する明細1行。承認時点の値を凍結する。 */
export type PaymentNoticeLine = {
  repository: string;
  issueNumber: number;
  issueTitle: string;
  issueUrl: string;
  rewardMode: string | null;
  fixedRewardYen: number;
  workMinutes: number;
  hourlyRateYen: number | null;
  timedRewardYen: number;
  taxExcludedYen: number;
  warnings: string[];
};

/** 通知書に表示する稼働ログ1件。除外済みログは含めない。 */
export type PaymentNoticeWorkLog = {
  repository: string;
  issueNumber: number;
  issueTitle: string;
  issueUrl: string;
  startedAt: string;
  endedAt: string | null;
  workMinutes: number;
};

/**
 * 承認時点で凍結する通知書本文。承認済み精算スナップショットを元に生成し、
 * その後に振込先や支払い予定日が変わっても内容は変わらない。
 */
export type PaymentNoticeDocument = {
  schemaVersion: typeof NOTICE_DOCUMENT_SCHEMA_VERSION;
  totals: {
    fixedRewardYen: number;
    timedRewardYen: number;
    taxExcludedYen: number;
    taxYen: number;
    taxIncludedYen: number;
  };
  lines: PaymentNoticeLine[];
  workLogs: PaymentNoticeWorkLog[];
};

/** 通知書用にスナップショット保存する作業者宛先。暗号化して保存する。 */
export type NoticeRecipient = {
  recipientName: string;
  postalCode: string;
  address: string;
};

/** 通知書1行として保存する材料。承認確定・再作成のどちらでも同じ形で保存する。 */
export type PreparedNotice = {
  month: string;
  assigneeLogin: string;
  document: PaymentNoticeDocument;
  workerDisplayName: string;
  recipientEncryptedPayload: string;
  encryptionKeyVersion: number;
  scheduledDate: string;
  approvedBy: string;
  approvedAt: string;
  issuedOn: string;
  createdBy: string;
};

/** 通知書スナップショットを保存できなかった理由。 */
export type NoticeSkipReason =
  | "payout_account_missing"
  | "payout_decrypt_failed";

/** 通知書表示用のビュー。宛先は復号済み。 */
export type PaymentNoticeView = {
  noticeNumber: string;
  month: string;
  assigneeLogin: string;
  workerDisplayName: string;
  recipient: NoticeRecipient;
  recipientLoadError: boolean;
  scheduledDate: string;
  approvedBy: string;
  approvedAt: string;
  issuedOn: string;
  createdAt: string;
  settlementUrl: string;
  document: PaymentNoticeDocument;
};

/** 通知書番号を id から導出する。例: 12 -> "PN-000012"。 */
export const formatNoticeNumber = (id: number): string =>
  `PN-${String(id).padStart(6, "0")}`;
