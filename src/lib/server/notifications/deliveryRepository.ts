import { desc, eq, sql } from "drizzle-orm";
import { db } from "$lib/server/db/client";
import { emailDeliveries, type EmailDelivery } from "$lib/server/db/schema";

export const markDeliverySending = async (id: string): Promise<void> => {
  await db
    .update(emailDeliveries)
    .set({
      status: "sending",
      attemptCount: sql`${emailDeliveries.attemptCount} + 1`,
      lastAttemptAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(emailDeliveries.id, id));
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
    .where(eq(emailDeliveries.id, input.id));
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
