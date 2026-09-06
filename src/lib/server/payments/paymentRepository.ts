import { and, eq, inArray } from "drizzle-orm";
import { db, neonClient, postgresClient } from "$lib/server/db/client";
import { monthlyPayments, type MonthlyPayment } from "$lib/server/db/schema";
import {
  type PreparedNotificationWrite,
  type SqlTag,
} from "$lib/server/notifications/notificationWrite";

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

type PaymentTransitionOptions = {
  updatedAt?: Date;
  expectedUpdatedAt: Date | null;
  notification?: PreparedNotificationWrite;
};

const paymentTransitionQuery = <TResult>(
  sql: SqlTag<TResult>,
  input: {
    month: string;
    assigneeLogin: string;
    paidOn: string;
    paymentComment: string | null;
  },
  options: PaymentTransitionOptions & { updatedAt: Date },
): TResult => {
  const notification = options.notification;
  const deliveriesJson = JSON.stringify(notification?.deliveries ?? []);
  const expectedUpdatedAt = options.expectedUpdatedAt?.toISOString() ?? null;

  return sql`
    WITH transitioned_payment AS (
      INSERT INTO monthly_payments (
        month, assignee_login, status, paid_on, payment_comment, updated_at
      ) VALUES (
        ${input.month}, ${input.assigneeLogin}, ${"paid"},
        ${input.paidOn}::date, ${input.paymentComment},
        ${options.updatedAt.toISOString()}::timestamptz
      )
      ON CONFLICT (month, assignee_login) DO UPDATE SET
        status = EXCLUDED.status,
        paid_on = EXCLUDED.paid_on,
        payment_comment = EXCLUDED.payment_comment,
        updated_at = EXCLUDED.updated_at
      WHERE monthly_payments.status = 'unpaid'
        AND ${expectedUpdatedAt}::timestamptz IS NOT NULL
        AND date_trunc('milliseconds', monthly_payments.updated_at) =
          ${expectedUpdatedAt}::timestamptz
      RETURNING 1
    ),
    inserted_event AS (
      INSERT INTO email_notification_events (
        id, event_key, type, month, assignee_login, occurred_at, payload
      )
      SELECT
        ${notification?.eventId ?? null}::uuid,
        ${notification?.eventKey ?? ""},
        ${notification?.type ?? "settlement_paid"}::email_notification_type,
        ${notification?.month ?? input.month},
        ${notification?.assigneeLogin ?? input.assigneeLogin},
        ${notification?.occurredAt.toISOString() ?? options.updatedAt.toISOString()}::timestamptz,
        ${notification?.payloadJson ?? "{}"}::jsonb
      FROM transitioned_payment
      WHERE ${Boolean(notification)}
      ON CONFLICT (event_key) DO NOTHING
      RETURNING id
    ),
    inserted_deliveries AS (
      INSERT INTO email_deliveries (
        id, event_id, recipient_login, recipient_email, status,
        subject, text_body, html_body, idempotency_key, error_code
      )
      SELECT
        delivery.id::uuid,
        inserted_event.id,
        delivery."recipientLogin",
        delivery."recipientEmail",
        delivery.status::email_delivery_status,
        delivery.subject,
        delivery."textBody",
        delivery."htmlBody",
        delivery."idempotencyKey",
        delivery."errorCode"
      FROM inserted_event
      CROSS JOIN jsonb_to_recordset(${deliveriesJson}::jsonb) AS delivery(
        id text,
        "recipientLogin" text,
        "recipientEmail" text,
        status text,
        subject text,
        "textBody" text,
        "htmlBody" text,
        "idempotencyKey" text,
        "errorCode" text
      )
      ON CONFLICT (event_id, recipient_login) DO NOTHING
      RETURNING id
    )
    SELECT EXISTS(SELECT 1 FROM transitioned_payment) AS transitioned
  `;
};

const didTransition = (result: unknown): boolean =>
  Array.isArray(result) &&
  result.length > 0 &&
  (result[0] as { transitioned?: unknown }).transitioned === true;

/** 現在の未処理版だけを支払い済みにし、既存の支払い予定日は保持する。 */
export const upsertPaymentPaid = async (
  input: {
    month: string;
    assigneeLogin: string;
    paidOn: string;
    paymentComment: string | null;
  },
  options: PaymentTransitionOptions,
): Promise<MonthlyPayment | null> => {
  const updatedAt = options?.updatedAt ?? new Date();
  const resolvedOptions = { ...options, updatedAt };
  const result = postgresClient
    ? await paymentTransitionQuery(
        postgresClient as unknown as SqlTag<unknown>,
        input,
        resolvedOptions,
      )
    : neonClient
      ? await paymentTransitionQuery(
          neonClient as unknown as SqlTag<unknown>,
          input,
          resolvedOptions,
        )
      : null;
  if (!result) throw new Error("Database client is not configured.");
  if (!didTransition(result)) return null;
  return getPaymentRow(input.month, input.assigneeLogin);
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
      paymentComment: null,
    })
    .onConflictDoUpdate({
      target: [monthlyPayments.month, monthlyPayments.assigneeLogin],
      set: {
        status: "unpaid",
        paidOn: null,
        paymentComment: null,
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
