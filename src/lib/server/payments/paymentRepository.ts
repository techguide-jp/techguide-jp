import { and, eq, inArray } from "drizzle-orm";
import { db } from "$lib/server/db/client";
import { monthlyPayments, type MonthlyPayment } from "$lib/server/db/schema";

export const getPaymentRow = async (
  month: string,
  assigneeLogin: string,
): Promise<MonthlyPayment | null> => {
  const [row] = await db
    .select()
    .from(monthlyPayments)
    .where(
      and(
        eq(monthlyPayments.month, month),
        eq(monthlyPayments.assigneeLogin, assigneeLogin),
      ),
    )
    .limit(1);
  return row ?? null;
};

export const listPaymentRowsForMonth = async (
  month: string,
): Promise<MonthlyPayment[]> => {
  return db
    .select()
    .from(monthlyPayments)
    .where(eq(monthlyPayments.month, month));
};

export const listPaymentRowsForAssignee = async (
  assigneeLogin: string,
  months: string[],
): Promise<MonthlyPayment[]> => {
  const uniqueMonths = [...new Set(months.filter(Boolean))];
  if (uniqueMonths.length === 0) return [];

  return db
    .select()
    .from(monthlyPayments)
    .where(
      and(
        eq(monthlyPayments.assigneeLogin, assigneeLogin),
        inArray(monthlyPayments.month, uniqueMonths),
      ),
    );
};

/** 支払い済みとして登録する。既存の支払い予定日は保持する。 */
export const upsertPaymentPaid = async (input: {
  month: string;
  assigneeLogin: string;
  paidOn: string;
}): Promise<MonthlyPayment> => {
  const [row] = await db
    .insert(monthlyPayments)
    .values({
      month: input.month,
      assigneeLogin: input.assigneeLogin,
      status: "paid",
      paidOn: input.paidOn,
    })
    .onConflictDoUpdate({
      target: [monthlyPayments.month, monthlyPayments.assigneeLogin],
      set: {
        status: "paid",
        paidOn: input.paidOn,
        updatedAt: new Date(),
      },
    })
    .returning();
  return row;
};

/** 支払い済み登録を取り消し、未処理に戻す。支払い予定日は保持する。 */
export const upsertPaymentUnpaid = async (input: {
  month: string;
  assigneeLogin: string;
}): Promise<MonthlyPayment> => {
  const [row] = await db
    .insert(monthlyPayments)
    .values({
      month: input.month,
      assigneeLogin: input.assigneeLogin,
      status: "unpaid",
      paidOn: null,
    })
    .onConflictDoUpdate({
      target: [monthlyPayments.month, monthlyPayments.assigneeLogin],
      set: {
        status: "unpaid",
        paidOn: null,
        updatedAt: new Date(),
      },
    })
    .returning();
  return row;
};

/** 個別の支払い予定日を保存する。null を渡すとデフォルト（翌月14日）に戻す。 */
export const upsertPaymentScheduledDate = async (input: {
  month: string;
  assigneeLogin: string;
  scheduledDate: string | null;
}): Promise<MonthlyPayment> => {
  const [row] = await db
    .insert(monthlyPayments)
    .values({
      month: input.month,
      assigneeLogin: input.assigneeLogin,
      scheduledDate: input.scheduledDate,
    })
    .onConflictDoUpdate({
      target: [monthlyPayments.month, monthlyPayments.assigneeLogin],
      set: {
        scheduledDate: input.scheduledDate,
        updatedAt: new Date(),
      },
    })
    .returning();
  return row;
};
