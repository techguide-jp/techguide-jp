import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
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
      resendEmailId: input.resendEmailId ?? null,
      acceptedAt: input.status === "accepted" ? now : null,
      errorCode: input.errorCode ?? null,
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

const unresolvedStatuses = ["pending", "sending", "failed", "unknown"] as const;
const terminalStatuses = ["accepted", "skipped"] as const;

export const listOperationalEmailDeliveries = async (): Promise<
  EmailDelivery[]
> => {
  const [unresolved, recentTerminal] = await Promise.all([
    // 再送・確認の操作対象を履歴件数で失わないよう、未解決配送には上限を設けない。
    db
      .select()
      .from(emailDeliveries)
      .where(inArray(emailDeliveries.status, [...unresolvedStatuses]))
      .orderBy(desc(emailDeliveries.createdAt)),
    db
      .select()
      .from(emailDeliveries)
      .where(inArray(emailDeliveries.status, [...terminalStatuses]))
      .orderBy(desc(emailDeliveries.createdAt))
      .limit(100),
  ]);

  return [...unresolved, ...recentTerminal].sort(
    (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
  );
};

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
