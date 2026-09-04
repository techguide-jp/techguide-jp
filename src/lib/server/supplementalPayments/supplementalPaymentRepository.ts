import { and, eq } from "drizzle-orm";
import { db, neonClient, postgresClient } from "$lib/server/db/client";
import {
  issueCompletionReports,
  supplementalPayments,
  type IssueCompletionReport,
  type SupplementalPayment,
} from "$lib/server/db/schema";
import type { PreparedNotice } from "$lib/server/notices/noticeTypes";
import {
  type PreparedNotificationWrite,
  type SqlTag,
} from "$lib/server/notifications/notificationWrite";

export type SupplementalPaymentWithReport = {
  payment: SupplementalPayment;
  report: IssueCompletionReport;
};

export const listSupplementalPaymentsWithReports = async (
  month?: string,
  assigneeLogin?: string,
): Promise<SupplementalPaymentWithReport[]> => {
  const conditions = [
    ...(month ? [eq(supplementalPayments.month, month)] : []),
    ...(assigneeLogin
      ? [eq(supplementalPayments.assigneeLogin, assigneeLogin)]
      : []),
  ];
  return db
    .select({ payment: supplementalPayments, report: issueCompletionReports })
    .from(supplementalPayments)
    .innerJoin(
      issueCompletionReports,
      eq(issueCompletionReports.id, supplementalPayments.completionReportId),
    )
    .where(conditions.length ? and(...conditions) : undefined);
};

export const getSupplementalPaymentWithReport = async (
  id: string,
): Promise<SupplementalPaymentWithReport | null> => {
  const [row] = await db
    .select({ payment: supplementalPayments, report: issueCompletionReports })
    .from(supplementalPayments)
    .innerJoin(
      issueCompletionReports,
      eq(issueCompletionReports.id, supplementalPayments.completionReportId),
    )
    .where(eq(supplementalPayments.id, id))
    .limit(1);
  return row ?? null;
};

const executeWrite = async (
  callback: (sql: SqlTag<unknown>) => unknown,
): Promise<unknown> => {
  if (postgresClient) {
    return callback(postgresClient as unknown as SqlTag<unknown>);
  }
  if (neonClient) {
    return callback(neonClient as unknown as SqlTag<unknown>);
  }
  throw new Error("Database client is not configured.");
};

const didTransition = (result: unknown): boolean =>
  Array.isArray(result) &&
  result.length > 0 &&
  (result[0] as { transitioned?: unknown }).transitioned === true;

export const scheduleSupplementalPayment = async (input: {
  id: string;
  scheduledDate: string;
  actorLogin: string;
  updatedAt: Date;
  expectedUpdatedAt: Date;
  notice: PreparedNotice;
  notification?: PreparedNotificationWrite;
}): Promise<boolean> => {
  const detailsJson = JSON.stringify({
    scheduledDate: input.scheduledDate,
    month: input.notice.month,
    assigneeLogin: input.notice.assigneeLogin,
  });
  const documentJson = JSON.stringify(input.notice.document);
  const result = await executeWrite((sql) => {
    const notification = input.notification;
    const deliveriesJson = JSON.stringify(notification?.deliveries ?? []);
    return sql`
      WITH transitioned_payment AS (
        UPDATE supplemental_payments
        SET
          scheduled_date = ${input.scheduledDate}::date,
          updated_at = ${input.updatedAt.toISOString()}::timestamptz
        WHERE id = ${input.id}::uuid
          AND status = 'unpaid'
          AND scheduled_date IS NULL
          AND date_trunc('milliseconds', updated_at) =
            ${input.expectedUpdatedAt.toISOString()}::timestamptz
        RETURNING *
      ),
      inserted_notice AS (
        INSERT INTO payment_notices (
          supplemental_payment_id, month, assignee_login, document,
          worker_display_name, recipient_encrypted_payload,
          payer_encrypted_payload, encryption_key_version, scheduled_date,
          approved_by, approved_at, issued_on, created_by
        )
        SELECT
          transitioned_payment.id, ${input.notice.month},
          ${input.notice.assigneeLogin}, ${documentJson}::jsonb,
          ${input.notice.workerDisplayName},
          ${input.notice.recipientEncryptedPayload},
          ${input.notice.payerEncryptedPayload},
          ${input.notice.encryptionKeyVersion}, ${input.scheduledDate}::date,
          ${input.actorLogin}, ${input.updatedAt.toISOString()}::timestamptz,
          ${input.notice.issuedOn}::date, ${input.actorLogin}
        FROM transitioned_payment
        ON CONFLICT (supplemental_payment_id)
          WHERE supplemental_payment_id IS NOT NULL
        DO NOTHING
        RETURNING 1
      ),
      inserted_audit AS (
        INSERT INTO audit_logs (
          actor_login, action, target_type, target_id, details
        )
        SELECT
          ${input.actorLogin}, ${"supplemental_payment_scheduled"},
          ${"supplemental_payment"}, transitioned_payment.id::text,
          ${detailsJson}::jsonb
        FROM transitioned_payment
        RETURNING 1
      ),
      inserted_event AS (
        INSERT INTO email_notification_events (
          id, event_key, type, month, assignee_login, occurred_at, payload
        )
        SELECT
          ${notification?.eventId ?? null}::uuid,
          ${notification?.eventKey ?? ""},
          ${notification?.type ?? "supplemental_payment_scheduled"}::email_notification_type,
          ${notification?.month ?? input.notice.month},
          ${notification?.assigneeLogin ?? input.notice.assigneeLogin},
          ${notification?.occurredAt.toISOString() ?? input.updatedAt.toISOString()}::timestamptz,
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
          delivery.id::uuid, inserted_event.id, delivery."recipientLogin",
          delivery."recipientEmail", delivery.status::email_delivery_status,
          delivery.subject, delivery."textBody", delivery."htmlBody",
          delivery."idempotencyKey", delivery."errorCode"
        FROM inserted_event
        CROSS JOIN jsonb_to_recordset(${deliveriesJson}::jsonb) AS delivery(
          id text, "recipientLogin" text, "recipientEmail" text, status text,
          subject text, "textBody" text, "htmlBody" text,
          "idempotencyKey" text, "errorCode" text
        )
        ON CONFLICT (event_id, recipient_login) DO NOTHING
        RETURNING id
      )
      SELECT EXISTS(SELECT 1 FROM transitioned_payment) AS transitioned
    `;
  });
  return didTransition(result);
};

export const markSupplementalPaymentPaid = async (input: {
  id: string;
  paidOn: string;
  actorLogin: string;
  updatedAt: Date;
  expectedUpdatedAt: Date;
  notification?: PreparedNotificationWrite;
}): Promise<boolean> => {
  const detailsJson = JSON.stringify({ paidOn: input.paidOn });
  const result = await executeWrite((sql) => {
    const notification = input.notification;
    const deliveriesJson = JSON.stringify(notification?.deliveries ?? []);
    return sql`
      WITH transitioned_payment AS (
        UPDATE supplemental_payments
        SET
          status = 'paid',
          paid_on = ${input.paidOn}::date,
          updated_at = ${input.updatedAt.toISOString()}::timestamptz
        WHERE id = ${input.id}::uuid
          AND status = 'unpaid'
          AND scheduled_date IS NOT NULL
          AND date_trunc('milliseconds', updated_at) =
            ${input.expectedUpdatedAt.toISOString()}::timestamptz
        RETURNING *
      ),
      inserted_audit AS (
        INSERT INTO audit_logs (
          actor_login, action, target_type, target_id, details
        )
        SELECT
          ${input.actorLogin}, ${"supplemental_payment_paid"},
          ${"supplemental_payment"}, transitioned_payment.id::text,
          ${detailsJson}::jsonb
        FROM transitioned_payment
        RETURNING 1
      ),
      inserted_event AS (
        INSERT INTO email_notification_events (
          id, event_key, type, month, assignee_login, occurred_at, payload
        )
        SELECT
          ${notification?.eventId ?? null}::uuid,
          ${notification?.eventKey ?? ""},
          ${notification?.type ?? "supplemental_payment_paid"}::email_notification_type,
          ${notification?.month ?? "0000-00"},
          ${notification?.assigneeLogin ?? ""},
          ${notification?.occurredAt.toISOString() ?? input.updatedAt.toISOString()}::timestamptz,
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
          delivery.id::uuid, inserted_event.id, delivery."recipientLogin",
          delivery."recipientEmail", delivery.status::email_delivery_status,
          delivery.subject, delivery."textBody", delivery."htmlBody",
          delivery."idempotencyKey", delivery."errorCode"
        FROM inserted_event
        CROSS JOIN jsonb_to_recordset(${deliveriesJson}::jsonb) AS delivery(
          id text, "recipientLogin" text, "recipientEmail" text, status text,
          subject text, "textBody" text, "htmlBody" text,
          "idempotencyKey" text, "errorCode" text
        )
        ON CONFLICT (event_id, recipient_login) DO NOTHING
        RETURNING id
      )
      SELECT EXISTS(SELECT 1 FROM transitioned_payment) AS transitioned
    `;
  });
  return didTransition(result);
};

export const revertSupplementalPayment = async (input: {
  id: string;
  actorLogin: string;
  updatedAt: Date;
  expectedUpdatedAt: Date;
}): Promise<boolean> => {
  const result = await executeWrite(
    (sql) => sql`
    WITH transitioned_payment AS (
      UPDATE supplemental_payments
      SET
        status = 'unpaid',
        paid_on = NULL,
        updated_at = ${input.updatedAt.toISOString()}::timestamptz
      WHERE id = ${input.id}::uuid
        AND status = 'paid'
        AND date_trunc('milliseconds', updated_at) =
          ${input.expectedUpdatedAt.toISOString()}::timestamptz
      RETURNING *
    ),
    inserted_audit AS (
      INSERT INTO audit_logs (
        actor_login, action, target_type, target_id, details
      )
      SELECT
        ${input.actorLogin}, ${"supplemental_payment_reverted"},
        ${"supplemental_payment"}, transitioned_payment.id::text,
        ${JSON.stringify({ status: "unpaid" })}::jsonb
      FROM transitioned_payment
      RETURNING 1
    )
    SELECT EXISTS(SELECT 1 FROM transitioned_payment) AS transitioned
  `,
  );
  return didTransition(result);
};
