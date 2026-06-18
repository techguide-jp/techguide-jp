import { and, eq } from "drizzle-orm";
import { db } from "$lib/server/db/client";
import { monthlyWorkSubmissions, type MonthlyWorkSubmission } from "$lib/server/db/schema";
import type { SettlementSummary } from "$lib/server/settlements/settlementTypes";

export const getWorkSubmission = async (
  month: string,
  assigneeLogin: string
): Promise<MonthlyWorkSubmission | null> => {
  const [submission] = await db
    .select()
    .from(monthlyWorkSubmissions)
    .where(
      and(
        eq(monthlyWorkSubmissions.month, month),
        eq(monthlyWorkSubmissions.assigneeLogin, assigneeLogin)
      )
    )
    .limit(1);
  return submission ?? null;
};

export const listWorkSubmissionsForMonth = async (month: string): Promise<MonthlyWorkSubmission[]> => {
  return db
    .select()
    .from(monthlyWorkSubmissions)
    .where(eq(monthlyWorkSubmissions.month, month));
};

export const upsertWorkSubmission = async (
  summary: SettlementSummary,
  submittedBy: string
): Promise<MonthlyWorkSubmission> => {
  const payload = JSON.parse(JSON.stringify(summary));
  const [submission] = await db
    .insert(monthlyWorkSubmissions)
    .values({
      month: summary.month,
      assigneeLogin: summary.assigneeLogin,
      snapshot: payload,
      submittedBy,
      submittedAt: new Date()
    })
    .onConflictDoUpdate({
      target: [monthlyWorkSubmissions.month, monthlyWorkSubmissions.assigneeLogin],
      set: {
        snapshot: payload,
        submittedBy,
        submittedAt: new Date()
      }
    })
    .returning();
  return submission;
};
