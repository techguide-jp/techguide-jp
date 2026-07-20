import { and, desc, eq } from "drizzle-orm";
import { db } from "$lib/server/db/client";
import { paymentNotices, type PaymentNotice } from "$lib/server/db/schema";
import type { PreparedNotice } from "$lib/server/notices/noticeTypes";

/** 通知書を1行 append する。過去の通知書は上書きしない。 */
export const insertPaymentNotice = async (
  notice: PreparedNotice,
): Promise<PaymentNotice> => {
  const [row] = await db
    .insert(paymentNotices)
    .values({
      month: notice.month,
      assigneeLogin: notice.assigneeLogin,
      document: notice.document,
      workerDisplayName: notice.workerDisplayName,
      recipientEncryptedPayload: notice.recipientEncryptedPayload,
      payerEncryptedPayload: notice.payerEncryptedPayload,
      encryptionKeyVersion: notice.encryptionKeyVersion,
      scheduledDate: notice.scheduledDate,
      approvedBy: notice.approvedBy,
      approvedAt: new Date(notice.approvedAt),
      issuedOn: notice.issuedOn,
      createdBy: notice.createdBy,
    })
    .returning();
  return row;
};

/** 対象月・作業者の最新の通知書を取得する。無ければ null。 */
export const getLatestNotice = async (
  month: string,
  assigneeLogin: string,
): Promise<PaymentNotice | null> => {
  const [row] = await db
    .select()
    .from(paymentNotices)
    .where(
      and(
        eq(paymentNotices.month, month),
        eq(paymentNotices.assigneeLogin, assigneeLogin),
      ),
    )
    .orderBy(desc(paymentNotices.createdAt), desc(paymentNotices.id))
    .limit(1);
  return row ?? null;
};

/** 対象月に通知書が1件以上ある作業者の login を返す。 */
export const listNoticeAssigneeLoginsForMonth = async (
  month: string,
): Promise<string[]> => {
  const rows = await db
    .selectDistinct({ assigneeLogin: paymentNotices.assigneeLogin })
    .from(paymentNotices)
    .where(eq(paymentNotices.month, month));
  return rows.map((row) => row.assigneeLogin);
};
