import type { NotificationType } from "$lib/server/notifications/notificationTypes";

export type PreparedDeliveryWrite = {
  id: string;
  recipientLogin: string;
  recipientEmail: string | null;
  status: "pending" | "skipped";
  subject: string;
  textBody: string;
  htmlBody: string;
  idempotencyKey: string;
  errorCode: string | null;
};

export type PreparedNotificationWrite = {
  eventId: string;
  eventKey: string;
  type: NotificationType;
  month: string;
  assigneeLogin: string;
  occurredAt: Date;
  payloadJson: string;
  deliveries: PreparedDeliveryWrite[];
};

export type SqlTag<TResult> = (
  strings: TemplateStringsArray,
  ...parameters: readonly unknown[]
) => TResult;

export const notificationInsertQuery = <TResult>(
  sql: SqlTag<TResult>,
  notification: PreparedNotificationWrite,
): TResult => {
  const deliveriesJson = JSON.stringify(notification.deliveries);
  return sql`
    WITH inserted_event AS (
      INSERT INTO email_notification_events (
        id, event_key, type, month, assignee_login, occurred_at, payload
      )
      VALUES (
        ${notification.eventId}::uuid,
        ${notification.eventKey},
        ${notification.type}::email_notification_type,
        ${notification.month},
        ${notification.assigneeLogin},
        ${notification.occurredAt.toISOString()}::timestamptz,
        ${notification.payloadJson}::jsonb
      )
      ON CONFLICT (event_key) DO NOTHING
      RETURNING id
    )
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
  `;
};
