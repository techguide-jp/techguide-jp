import { and, eq } from "drizzle-orm";
import { db } from "$lib/server/db/client";
import { monthlySettlementSnapshots, type MonthlySettlementSnapshot } from "$lib/server/db/schema";
import type { SettlementSummary } from "$lib/server/settlements/settlementTypes";

export const getSnapshot = async (
  month: string,
  assigneeLogin: string
): Promise<MonthlySettlementSnapshot | null> => {
  const [snapshot] = await db
    .select()
    .from(monthlySettlementSnapshots)
    .where(
      and(
        eq(monthlySettlementSnapshots.month, month),
        eq(monthlySettlementSnapshots.assigneeLogin, assigneeLogin)
      )
    )
    .limit(1);
  return snapshot ?? null;
};

export const listSnapshotsForMonth = async (month: string): Promise<MonthlySettlementSnapshot[]> => {
  return db
    .select()
    .from(monthlySettlementSnapshots)
    .where(eq(monthlySettlementSnapshots.month, month));
};

export const upsertSnapshot = async (
  summary: SettlementSummary,
  approvedBy: string
): Promise<MonthlySettlementSnapshot> => {
  const payload = JSON.parse(JSON.stringify(summary));
  const [snapshot] = await db
    .insert(monthlySettlementSnapshots)
    .values({
      month: summary.month,
      assigneeLogin: summary.assigneeLogin,
      snapshot: payload,
      approvedBy,
      approvedAt: new Date()
    })
    .onConflictDoUpdate({
      target: [monthlySettlementSnapshots.month, monthlySettlementSnapshots.assigneeLogin],
      set: {
        snapshot: payload,
        approvedBy,
        approvedAt: new Date()
      }
    })
    .returning();
  return snapshot;
};
