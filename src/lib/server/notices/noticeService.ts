import { env } from "$lib/server/env";
import { minutesBetween } from "$lib/server/time";
import { decryptPayload } from "$lib/server/payoutAccounts/payoutAccountCrypto";
import { getPayoutAccountRow } from "$lib/server/payoutAccounts/payoutAccountRepository";
import { ENCRYPTION_KEY_VERSION } from "$lib/server/crypto/envelopeCrypto";
import { getWorkerProfile } from "$lib/server/workers/workerProfileRepository";
import {
  decryptNoticeRecipient,
  encryptNoticeRecipient,
} from "$lib/server/notices/noticeCrypto";
import { getLatestNotice } from "$lib/server/notices/noticeRepository";
import {
  NOTICE_DOCUMENT_SCHEMA_VERSION,
  formatNoticeNumber,
  type NoticeRecipient,
  type NoticeSkipReason,
  type PayerInformationResult,
  type PaymentNoticeDocument,
  type PaymentNoticeLine,
  type PaymentNoticeView,
  type PaymentNoticeWorkLog,
  type PreparedNotice,
} from "$lib/server/notices/noticeTypes";
import type { PaymentNotice } from "$lib/server/db/schema";
import type { SettlementSummary } from "$lib/server/settlements/settlementTypes";

/** 対象月・作業者の精算ページURL。APP_ORIGIN 未設定時は相対パスを返す。 */
const settlementUrlFor = (month: string, assigneeLogin: string): string =>
  `${env.appOrigin ?? ""}/settlements/${month}/${encodeURIComponent(assigneeLogin)}`;

/**
 * ADMIN_GITHUB_LOGINS の先頭ユーザーに登録された宛先3項目を、
 * 通知書の支払い者情報として返す。
 */
export const getPayerInformation =
  async (): Promise<PayerInformationResult> => {
    const payerLogin = env.adminGithubLogins.values().next().value;
    if (!payerLogin) {
      return { ok: false, reason: "admin_not_configured" };
    }

    const row = await getPayoutAccountRow(payerLogin);
    if (!row) {
      return { ok: false, reason: "payout_account_missing" };
    }

    try {
      const payload = decryptPayload(row.encryptedPayload);
      return {
        ok: true,
        recipient: {
          recipientName: payload.recipientName,
          postalCode: payload.postalCode,
          address: payload.address,
        },
      };
    } catch {
      return { ok: false, reason: "payout_decrypt_failed" };
    }
  };

/** JST の日付を YYYY-MM-DD で返す。 */
export const jstDateString = (date: Date): string => {
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return `${year}-${month}-${day}`;
};

const sessionWorkMinutes = (
  startedAt: Date | string,
  endedAt: Date | string | null,
): number => {
  if (!endedAt) return 0;
  return minutesBetween(new Date(startedAt), new Date(endedAt));
};

/** 承認済み精算サマリーから、通知書本文（凍結対象）を生成する。 */
export const buildNoticeDocument = (
  summary: SettlementSummary,
): PaymentNoticeDocument => {
  const lines: PaymentNoticeLine[] = summary.lines.map((line) => ({
    repository: line.issue.repository,
    issueNumber: line.issue.number,
    issueTitle: line.issue.title,
    issueUrl: line.issue.url,
    rewardMode: line.issue.rewardMode,
    fixedRewardYen: line.fixedRewardYen,
    workMinutes: line.workMinutes,
    hourlyRateYen: line.issue.hourlyRateYen,
    timedRewardYen: line.timedRewardYen,
    taxExcludedYen: line.taxExcludedYen,
    warnings: line.warnings,
  }));

  const workLogs: PaymentNoticeWorkLog[] = summary.lines
    .flatMap((line) =>
      line.sessions
        .filter((session) => !session.excludedAt)
        .map((session) => ({
          repository: line.issue.repository,
          issueNumber: line.issue.number,
          issueTitle: line.issue.title,
          issueUrl: line.issue.url,
          startedAt: new Date(session.startedAt).toISOString(),
          endedAt: session.endedAt
            ? new Date(session.endedAt).toISOString()
            : null,
          workMinutes: sessionWorkMinutes(session.startedAt, session.endedAt),
        })),
    )
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));

  return {
    schemaVersion: NOTICE_DOCUMENT_SCHEMA_VERSION,
    totals: {
      fixedRewardYen: summary.fixedRewardYen,
      timedRewardYen: summary.timedRewardYen,
      taxExcludedYen: summary.taxExcludedYen,
      taxYen: summary.taxYen,
      taxIncludedYen: summary.taxIncludedYen,
    },
    lines,
    workLogs,
  };
};

/**
 * 通知書1行の保存材料を組み立てる。振込先を復号して宛先を凍結する。
 * 振込先が未登録・復号失敗の場合はスナップショットを保存できない理由を返す。
 */
export const prepareNoticeWriteInput = async (params: {
  month: string;
  assigneeLogin: string;
  summary: SettlementSummary;
  scheduledDate: string;
  approvedBy: string;
  approvedAt: string;
  issuedOn: string;
  createdBy: string;
}): Promise<
  { ok: true; notice: PreparedNotice } | { ok: false; reason: NoticeSkipReason }
> => {
  const row = await getPayoutAccountRow(params.assigneeLogin);
  if (!row) {
    return { ok: false, reason: "payout_account_missing" };
  }

  let recipient: NoticeRecipient;
  try {
    const payload = decryptPayload(row.encryptedPayload);
    recipient = {
      recipientName: payload.recipientName,
      postalCode: payload.postalCode,
      address: payload.address,
    };
  } catch {
    return { ok: false, reason: "payout_decrypt_failed" };
  }

  const profile = await getWorkerProfile(params.assigneeLogin);

  return {
    ok: true,
    notice: {
      month: params.month,
      assigneeLogin: params.assigneeLogin,
      document: buildNoticeDocument(params.summary),
      workerDisplayName: profile?.displayName ?? params.assigneeLogin,
      recipientEncryptedPayload: encryptNoticeRecipient(recipient),
      encryptionKeyVersion: ENCRYPTION_KEY_VERSION,
      scheduledDate: params.scheduledDate,
      approvedBy: params.approvedBy,
      approvedAt: params.approvedAt,
      issuedOn: params.issuedOn,
      createdBy: params.createdBy,
    },
  };
};

/** 通知書スナップショットを保存できなかった理由の表示メッセージ。 */
export const noticeSkipMessage = (reason: NoticeSkipReason): string =>
  reason === "payout_account_missing"
    ? "振込先情報が未登録のため支払い通知書を作成できませんでした。作業者へ振込先の登録を依頼してください。"
    : "振込先情報を復号できなかったため支払い通知書を作成できませんでした。管理者に確認してください。";

const toNoticeView = (row: PaymentNotice): PaymentNoticeView => {
  let recipient: NoticeRecipient = {
    recipientName: "",
    postalCode: "",
    address: "",
  };
  let recipientLoadError = false;
  try {
    recipient = decryptNoticeRecipient(row.recipientEncryptedPayload);
  } catch {
    recipientLoadError = true;
  }

  return {
    noticeNumber: formatNoticeNumber(row.id),
    month: row.month,
    assigneeLogin: row.assigneeLogin,
    workerDisplayName: row.workerDisplayName,
    recipient,
    recipientLoadError,
    scheduledDate: row.scheduledDate,
    approvedBy: row.approvedBy,
    approvedAt: row.approvedAt.toISOString(),
    issuedOn: row.issuedOn,
    createdAt: row.createdAt.toISOString(),
    settlementUrl: settlementUrlFor(row.month, row.assigneeLogin),
    document: row.document,
  };
};

/** 本人または管理者のみ通知書を閲覧できる。権限がなければ null。 */
export const getNoticeForViewer = async (
  month: string,
  assigneeLogin: string,
  viewer: { login: string; isAdmin: boolean } | null,
): Promise<PaymentNoticeView | null> => {
  if (!viewer || (!viewer.isAdmin && viewer.login !== assigneeLogin)) {
    return null;
  }
  const row = await getLatestNotice(month, assigneeLogin);
  return row ? toNoticeView(row) : null;
};
