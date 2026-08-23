import { and, desc, eq, lt, sql } from "drizzle-orm";
import { db } from "$lib/server/db/client";
import { emailDeliveries, type EmailDelivery } from "$lib/server/db/schema";

export const claimEmailDelivery = async (
  id: string,
  expectedStatus: "pending" | "failed",
): Promise<EmailDelivery | null> => {
  const now = new Date();
  const [delivery] = await db
    .update(emailDeliveries)
    .set({
      status: "sending",
      attemptCount: sql`${emailDeliveries.attemptCount} + 1`,
      lastAttemptAt: now,
      updatedAt: now,
    })
    // UI以外からの再送や多重実行でも、送信権は1リクエストだけが取得する。
    .where(
      and(
        eq(emailDeliveries.id, id),
        eq(emailDeliveries.status, expectedStatus),
      ),
    )
    .returning();
  return delivery ?? null;
};

export const markDeliveryResult = async (input: {
  id: string;
  status: "accepted" | "failed" | "unknown";
  resendEmailId?: string;
  errorCode?: string;
}): Promise<void> => {
  const now = new Date();
  await db
    .update(emailDeliveries)
    .set({
      status: input.status,
      resendEmailId: input.resendEmailId,
      acceptedAt: input.status === "accepted" ? now : null,
      errorCode: input.errorCode,
      updatedAt: now,
    })
    .where(
      and(
        eq(emailDeliveries.id, input.id),
        eq(emailDeliveries.status, "sending"),
      ),
    );
};

export const markStaleSendingDeliveriesUnknown = async (
  staleBefore: Date,
): Promise<number> => {
  const now = new Date();
  const deliveries = await db
    .update(emailDeliveries)
    .set({
      status: "unknown",
      errorCode: "stale_sending_requires_confirmation",
      updatedAt: now,
    })
    .where(
      and(
        eq(emailDeliveries.status, "sending"),
        lt(emailDeliveries.lastAttemptAt, staleBefore),
      ),
    )
    .returning();
  return deliveries.length;
};

export const listRecentEmailDeliveries = async (): Promise<EmailDelivery[]> =>
  db
    .select()
    .from(emailDeliveries)
    .orderBy(desc(emailDeliveries.createdAt))
    .limit(100);

export const getEmailDelivery = async (
  id: string,
): Promise<EmailDelivery | null> => {
  const [delivery] = await db
    .select()
    .from(emailDeliveries)
    .where(eq(emailDeliveries.id, id))
    .limit(1);
  return delivery ?? null;
};
