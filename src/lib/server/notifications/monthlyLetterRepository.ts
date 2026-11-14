import { and, eq, sql } from "drizzle-orm";
import { db } from "$lib/server/db/client";
import { monthlyWorkerLetters } from "$lib/server/db/schema";

export const getMonthlyWorkerLetter = async (
  sendMonth: string,
): Promise<typeof monthlyWorkerLetters.$inferSelect | null> => {
  const [letter] = await db
    .select()
    .from(monthlyWorkerLetters)
    .where(eq(monthlyWorkerLetters.sendMonth, sendMonth));
  return letter ?? null;
};

export const saveMonthlyWorkerLetter = async (input: {
  sendMonth: string;
  body: string;
  updatedBy: string;
  version: number;
}): Promise<boolean> => {
  const { sendMonth, body, updatedBy, version } = input;
  if (version === 0) {
    const rows = await db
      .insert(monthlyWorkerLetters)
      .values({ sendMonth, body, updatedBy })
      .onConflictDoNothing({ target: monthlyWorkerLetters.sendMonth })
      .returning();
    return rows.length > 0;
  }
  const rows = await db
    .update(monthlyWorkerLetters)
    .set({
      body,
      updatedBy,
      updatedAt: new Date(),
      version: sql`${monthlyWorkerLetters.version} + 1`,
    })
    .where(
      and(
        eq(monthlyWorkerLetters.sendMonth, sendMonth),
        eq(monthlyWorkerLetters.version, version),
      ),
    )
    .returning();
  return rows.length > 0;
};
