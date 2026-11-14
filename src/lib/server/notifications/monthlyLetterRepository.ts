import { and, eq, sql } from "drizzle-orm";
import { db } from "$lib/server/db/client";
import {
  monthlyWorkerLetters,
  monthlyWorkerLetterSettings,
} from "$lib/server/db/schema";
import {
  defaultMonthlyLetterTemplates,
  type MonthlyLetterTemplates,
} from "$lib/monthlyLetter";

export const getMonthlyLetterTemplates = async () => {
  const { requiredSubject, standardSubject, defaultBody, version } =
    monthlyWorkerLetterSettings;
  const [settings] = await db
    .select({ requiredSubject, standardSubject, defaultBody, version })
    .from(monthlyWorkerLetterSettings);
  return settings ?? { ...defaultMonthlyLetterTemplates, version: 0 };
};

export const saveMonthlyLetterTemplates = async (
  templates: MonthlyLetterTemplates,
  version: number,
): Promise<boolean> => {
  if (version === 0) {
    const rows = await db
      .insert(monthlyWorkerLetterSettings)
      .values(templates)
      .onConflictDoNothing({ target: monthlyWorkerLetterSettings.id })
      .returning();
    return rows.length > 0;
  }
  const rows = await db
    .update(monthlyWorkerLetterSettings)
    .set({
      ...templates,
      version: sql`${monthlyWorkerLetterSettings.version} + 1`,
    })
    .where(
      and(
        eq(monthlyWorkerLetterSettings.id, 1),
        eq(monthlyWorkerLetterSettings.version, version),
      ),
    )
    .returning();
  return rows.length > 0;
};

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
