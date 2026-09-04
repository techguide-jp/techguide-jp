import { and, eq } from "drizzle-orm";
import { db, neonClient, postgresClient } from "$lib/server/db/client";
import {
  monthlyWorkSubmissions,
  type MonthlyWorkSubmission,
} from "$lib/server/db/schema";
import { createSettlementSnapshotPayload } from "$lib/server/settlements/settlementSnapshot";
import type { SettlementSummary } from "$lib/server/settlements/settlementTypes";
import {
  notificationInsertQuery,
  type PreparedNotificationWrite,
  type SqlTag,
} from "$lib/server/notifications/notificationWrite";

export const getWorkSubmission = async (
  month: string,
  assigneeLogin: string,
): Promise<MonthlyWorkSubmission | null> => {
  const [submission] = await db
    .select()
    .from(monthlyWorkSubmissions)
    .where(
      and(
        eq(monthlyWorkSubmissions.month, month),
        eq(monthlyWorkSubmissions.assigneeLogin, assigneeLogin),
      ),
    )
    .limit(1);
  return submission ?? null;
};

export const listWorkSubmissionsForMonth = async (
  month: string,
): Promise<MonthlyWorkSubmission[]> => {
  return db
    .select()
    .from(monthlyWorkSubmissions)
    .where(eq(monthlyWorkSubmissions.month, month));
};

export const listWorkSubmissions = async (): Promise<MonthlyWorkSubmission[]> =>
  db.select().from(monthlyWorkSubmissions);

export const upsertWorkSubmission = async (
  summary: SettlementSummary,
  submittedBy: string,
  options?: {
    submittedAt: Date;
    notification?: PreparedNotificationWrite;
  },
): Promise<MonthlyWorkSubmission> => {
  const payload = createSettlementSnapshotPayload(summary);
  const submittedAt = options?.submittedAt ?? new Date();
  if (options?.notification) {
    const payloadJson = JSON.stringify(payload);
    if (postgresClient) {
      await postgresClient.begin(async (sql) => {
        await sql`
          INSERT INTO monthly_work_submissions (
            month, assignee_login, snapshot, submitted_by, submitted_at
          ) VALUES (
            ${summary.month}, ${summary.assigneeLogin}, ${payloadJson}::jsonb,
            ${submittedBy}, ${submittedAt.toISOString()}::timestamptz
          )
          ON CONFLICT (month, assignee_login) DO UPDATE SET
            snapshot = EXCLUDED.snapshot,
            submitted_by = EXCLUDED.submitted_by,
            submitted_at = EXCLUDED.submitted_at
        `;
        await notificationInsertQuery(
          sql as unknown as SqlTag<ReturnType<typeof sql>>,
          options.notification as PreparedNotificationWrite,
        );
      });
    } else if (neonClient) {
      const notification = options.notification;
      await neonClient.transaction((sql) => [
        sql`
          INSERT INTO monthly_work_submissions (
            month, assignee_login, snapshot, submitted_by, submitted_at
          ) VALUES (
            ${summary.month}, ${summary.assigneeLogin}, ${payloadJson}::jsonb,
            ${submittedBy}, ${submittedAt.toISOString()}::timestamptz
          )
          ON CONFLICT (month, assignee_login) DO UPDATE SET
            snapshot = EXCLUDED.snapshot,
            submitted_by = EXCLUDED.submitted_by,
            submitted_at = EXCLUDED.submitted_at
        `,
        notificationInsertQuery(
          sql as unknown as SqlTag<ReturnType<typeof sql>>,
          notification,
        ),
      ]);
    } else {
      throw new Error("Database client is not configured.");
    }
    return {
      month: summary.month,
      assigneeLogin: summary.assigneeLogin,
      snapshot: payload,
      submittedBy,
      submittedAt,
    };
  }
  const [submission] = await db
    .insert(monthlyWorkSubmissions)
    .values({
      month: summary.month,
      assigneeLogin: summary.assigneeLogin,
      snapshot: payload,
      submittedBy,
      submittedAt,
    })
    .onConflictDoUpdate({
      target: [
        monthlyWorkSubmissions.month,
        monthlyWorkSubmissions.assigneeLogin,
      ],
      set: {
        snapshot: payload,
        submittedBy,
        submittedAt,
      },
    })
    .returning();
  return submission;
};
