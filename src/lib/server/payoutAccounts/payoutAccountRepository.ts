import { and, eq, inArray } from "drizzle-orm";
import { db } from "$lib/server/db/client";
import {
  workerPayoutAccounts,
  type WorkerPayoutAccount,
} from "$lib/server/db/schema";
import { encryptPayload } from "$lib/server/payoutAccounts/payoutAccountCrypto";
import type { WorkerPayoutAccountPayload } from "$lib/server/payoutAccounts/payoutAccountTypes";

export type PayoutAccountStatusRow = {
  login: string;
  updatedAt: Date;
};

export const getPayoutAccountRow = async (
  login: string,
): Promise<WorkerPayoutAccount | null> => {
  const [row] = await db
    .select()
    .from(workerPayoutAccounts)
    .where(eq(workerPayoutAccounts.login, login))
    .limit(1);
  return row ?? null;
};

export const listPayoutAccountStatusRows = async (
  logins: string[],
): Promise<PayoutAccountStatusRow[]> => {
  const uniqueLogins = [...new Set(logins.filter(Boolean))];
  if (uniqueLogins.length === 0) return [];

  return db
    .select({
      login: workerPayoutAccounts.login,
      updatedAt: workerPayoutAccounts.updatedAt,
    })
    .from(workerPayoutAccounts)
    .where(inArray(workerPayoutAccounts.login, uniqueLogins));
};

export const upsertPayoutAccount = async (input: {
  login: string;
  payload: WorkerPayoutAccountPayload;
  updatedBy: string;
  expectedVersion: number;
}): Promise<
  | { ok: true; row: WorkerPayoutAccount }
  | { ok: false; reason: "conflict" | "not_found" }
> => {
  const encryptedPayload = encryptPayload(input.payload);
  const existing = await getPayoutAccountRow(input.login);

  if (!existing) {
    if (input.expectedVersion !== 0) {
      return { ok: false, reason: "conflict" };
    }

    const [row] = await db
      .insert(workerPayoutAccounts)
      .values({
        login: input.login,
        encryptedPayload,
        encryptionKeyVersion: 1,
        updatedBy: input.updatedBy,
        version: 1,
      })
      .onConflictDoNothing({ target: workerPayoutAccounts.login })
      .returning();
    if (!row) {
      return { ok: false, reason: "conflict" };
    }
    return { ok: true, row };
  }

  if (existing.version !== input.expectedVersion) {
    return { ok: false, reason: "conflict" };
  }

  const [row] = await db
    .update(workerPayoutAccounts)
    .set({
      encryptedPayload,
      encryptionKeyVersion: 1,
      updatedBy: input.updatedBy,
      version: existing.version + 1,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(workerPayoutAccounts.login, input.login),
        eq(workerPayoutAccounts.version, input.expectedVersion),
      ),
    )
    .returning();

  if (!row) {
    return { ok: false, reason: "conflict" };
  }

  return { ok: true, row };
};
