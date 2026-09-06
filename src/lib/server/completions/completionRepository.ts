import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "$lib/server/db/client";
import {
  issueCompletionReports,
  monthlySettlementSnapshots,
  supplementalPayments,
  type IssueCompletionReport,
  type SupplementalPayment,
} from "$lib/server/db/schema";
export { replaceActiveCompletionReport } from "$lib/server/completions/completionReportWriteRepository";
export { confirmCompletionEligibility } from "$lib/server/completions/completionEligibilityRepository";

export const listCompletionReports = async (): Promise<
  IssueCompletionReport[]
> => db.select().from(issueCompletionReports);

export const listCompletionReportsForAssignee = async (
  assigneeLogin: string,
): Promise<IssueCompletionReport[]> =>
  db
    .select()
    .from(issueCompletionReports)
    .where(eq(issueCompletionReports.assigneeLogin, assigneeLogin));

export const listCompletionReportsForMonth = async (
  month: string,
): Promise<IssueCompletionReport[]> =>
  db
    .select()
    .from(issueCompletionReports)
    .where(eq(issueCompletionReports.settlementMonth, month));

export const listActiveCompletionReports = async (): Promise<
  IssueCompletionReport[]
> =>
  db
    .select()
    .from(issueCompletionReports)
    .where(isNull(issueCompletionReports.invalidatedAt));

export const getActiveCompletionReport = async (input: {
  repository: string;
  issueNumber: number;
  assigneeLogin: string;
}): Promise<IssueCompletionReport | null> => {
  const [report] = await db
    .select()
    .from(issueCompletionReports)
    .where(
      and(
        eq(issueCompletionReports.repository, input.repository),
        eq(issueCompletionReports.issueNumber, input.issueNumber),
        eq(issueCompletionReports.assigneeLogin, input.assigneeLogin),
        isNull(issueCompletionReports.invalidatedAt),
      ),
    )
    .limit(1);
  return report ?? null;
};

export const invalidateActiveCompletionReport = async (input: {
  repository: string;
  issueNumber: number;
  assigneeLogin: string;
  invalidatedBy: string;
  reason: string;
  invalidatedAt?: Date;
  onlyReportedBefore?: Date;
}): Promise<number> => {
  const invalidatedAt = input.invalidatedAt ?? new Date();
  const reports = await db
    .update(issueCompletionReports)
    .set({
      invalidatedAt,
      invalidatedBy: input.invalidatedBy,
      invalidationReason: input.reason,
    })
    .where(
      and(
        eq(issueCompletionReports.repository, input.repository),
        eq(issueCompletionReports.issueNumber, input.issueNumber),
        eq(issueCompletionReports.assigneeLogin, input.assigneeLogin),
        isNull(issueCompletionReports.invalidatedAt),
        isNull(issueCompletionReports.eligibilityConfirmedAt),
        ...(input.onlyReportedBefore
          ? [
              // 完了報告以前のログ修正では、成果の帰属月を動かさないため。
              sql`${issueCompletionReports.reportedAt} < ${input.onlyReportedBefore}`,
            ]
          : []),
      ),
    )
    .returning();
  return reports.length;
};

export const listSupplementalPaymentsForMonth = async (
  month: string,
): Promise<SupplementalPayment[]> =>
  db
    .select()
    .from(supplementalPayments)
    .where(eq(supplementalPayments.month, month));

export const listSupplementalPaymentsForAssignee = async (
  assigneeLogin: string,
  months?: string[],
): Promise<SupplementalPayment[]> => {
  const conditions = [
    eq(supplementalPayments.assigneeLogin, assigneeLogin),
    ...(months?.length
      ? [inArray(supplementalPayments.month, [...new Set(months)])]
      : []),
  ];
  return db
    .select()
    .from(supplementalPayments)
    .where(and(...conditions));
};

export const getSupplementalPayment = async (
  id: string,
): Promise<SupplementalPayment | null> => {
  const [payment] = await db
    .select()
    .from(supplementalPayments)
    .where(eq(supplementalPayments.id, id))
    .limit(1);
  return payment ?? null;
};

export const hasApprovedSettlement = async (
  month: string,
  assigneeLogin: string,
): Promise<boolean> => {
  const [snapshot] = await db
    .select({ month: monthlySettlementSnapshots.month })
    .from(monthlySettlementSnapshots)
    .where(
      and(
        eq(monthlySettlementSnapshots.month, month),
        eq(monthlySettlementSnapshots.assigneeLogin, assigneeLogin),
      ),
    )
    .limit(1);
  return Boolean(snapshot);
};
