import { desc } from "drizzle-orm";
import { db } from "$lib/server/db/client";
import { auditLogs, type AuditLog } from "$lib/server/db/schema";

export type AuditAction =
  | "monthly_work_submitted"
  | "monthly_settlement_approved"
  | "work_log_change_reviewed"
  | "expired_sessions_deleted";

export const createAuditLog = async (input: {
  actorLogin: string;
  action: AuditAction;
  targetType: string;
  targetId: string;
  details?: Record<string, unknown>;
}): Promise<AuditLog> => {
  const [log] = await db
    .insert(auditLogs)
    .values({
      actorLogin: input.actorLogin,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      details: input.details ?? {},
    })
    .returning();
  return log;
};

export const listRecentAuditLogs = async (limit = 20): Promise<AuditLog[]> => {
  return db
    .select()
    .from(auditLogs)
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);
};
