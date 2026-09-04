import { neonClient, postgresClient } from "$lib/server/db/client";
import { createSettlementSnapshotPayload } from "$lib/server/settlements/settlementSnapshot";
import type { SettlementSummary } from "$lib/server/settlements/settlementTypes";
import type { PreparedNotice } from "$lib/server/notices/noticeTypes";
import type {
  PreparedNotificationWrite,
  SqlTag,
} from "$lib/server/notifications/notificationWrite";

type ApprovalWriteInput = {
  summary: SettlementSummary;
  approvedBy: string;
  /** スナップショットと通知書で共有する承認日時。未指定なら生成する。 */
  approvedAt?: string;
  /** 読み取り時点の承認版。null は未承認を表す。 */
  expectedApprovedAt: string | null;
  scheduledDate?: string;
  /** 同一トランザクションで append する通知書。振込先未登録時などは undefined。 */
  notice?: PreparedNotice;
  notification?: PreparedNotificationWrite;
};

const approvalTargetId = (summary: SettlementSummary): string =>
  `${summary.month}:${summary.assigneeLogin}`;

const approvalDetails = (
  input: ApprovalWriteInput,
): Record<string, unknown> => ({
  month: input.summary.month,
  assigneeLogin: input.summary.assigneeLogin,
  taxExcludedYen: input.summary.taxExcludedYen,
  taxIncludedYen: input.summary.taxIncludedYen,
  ...(input.scheduledDate ? { scheduledDate: input.scheduledDate } : {}),
  ...(input.notice ? { noticeCreated: true } : {}),
});

const approvalWriteQuery = (
  sql: SqlTag<unknown>,
  input: ApprovalWriteInput,
  approvedAt: string,
): unknown => {
  const snapshotJson = JSON.stringify(
    createSettlementSnapshotPayload(input.summary),
  );
  const detailsJson = JSON.stringify(approvalDetails(input));
  const notice = input.notice;
  const noticeDocumentJson = notice ? JSON.stringify(notice.document) : "{}";
  const notification = input.notification;
  const deliveriesJson = JSON.stringify(notification?.deliveries ?? []);

  return sql`
    WITH transitioned_snapshot AS (
      INSERT INTO monthly_settlement_snapshots (
        month, assignee_login, snapshot, approved_by, approved_at
      ) VALUES (
        ${input.summary.month},
        ${input.summary.assigneeLogin},
        ${snapshotJson}::jsonb,
        ${input.approvedBy},
        ${approvedAt}::timestamptz
      )
      ON CONFLICT (month, assignee_login) DO UPDATE SET
        snapshot = EXCLUDED.snapshot,
        approved_by = EXCLUDED.approved_by,
        approved_at = EXCLUDED.approved_at
      WHERE ${input.expectedApprovedAt}::timestamptz IS NOT NULL
        AND date_trunc(
          'milliseconds', monthly_settlement_snapshots.approved_at
        ) =
          ${input.expectedApprovedAt}::timestamptz
      RETURNING 1
    ),
    updated_payment AS (
      INSERT INTO monthly_payments (
        month, assignee_login, scheduled_date, updated_at
      )
      SELECT
        ${input.summary.month},
        ${input.summary.assigneeLogin},
        ${input.scheduledDate ?? null}::date,
        ${approvedAt}::timestamptz
      FROM transitioned_snapshot
      WHERE ${Boolean(input.scheduledDate)}
      ON CONFLICT (month, assignee_login) DO UPDATE SET
        scheduled_date = EXCLUDED.scheduled_date,
        updated_at = EXCLUDED.updated_at
      RETURNING 1
    ),
    inserted_audit AS (
      INSERT INTO audit_logs (
        actor_login, action, target_type, target_id, details
      )
      SELECT
        ${input.approvedBy},
        ${"monthly_settlement_approved"},
        ${"monthly_settlement_snapshot"},
        ${approvalTargetId(input.summary)},
        ${detailsJson}::jsonb
      FROM transitioned_snapshot
      RETURNING 1
    ),
    inserted_notice AS (
      INSERT INTO payment_notices (
        month,
        assignee_login,
        document,
        worker_display_name,
        recipient_encrypted_payload,
        payer_encrypted_payload,
        encryption_key_version,
        scheduled_date,
        approved_by,
        approved_at,
        issued_on,
        created_by
      )
      SELECT
        ${notice?.month ?? input.summary.month},
        ${notice?.assigneeLogin ?? input.summary.assigneeLogin},
        ${noticeDocumentJson}::jsonb,
        ${notice?.workerDisplayName ?? ""},
        ${notice?.recipientEncryptedPayload ?? ""},
        ${notice?.payerEncryptedPayload ?? ""},
        ${notice?.encryptionKeyVersion ?? 1},
        ${notice?.scheduledDate ?? null}::date,
        ${notice?.approvedBy ?? input.approvedBy},
        ${approvedAt}::timestamptz,
        ${notice?.issuedOn ?? null}::date,
        ${notice?.createdBy ?? input.approvedBy}
      FROM transitioned_snapshot
      WHERE ${Boolean(notice)}
      RETURNING 1
    ),
    inserted_event AS (
      INSERT INTO email_notification_events (
        id, event_key, type, month, assignee_login, occurred_at, payload
      )
      SELECT
        ${notification?.eventId ?? null}::uuid,
        ${notification?.eventKey ?? ""},
        ${notification?.type ?? "settlement_approved"}::email_notification_type,
        ${notification?.month ?? input.summary.month},
        ${notification?.assigneeLogin ?? input.summary.assigneeLogin},
        ${notification?.occurredAt.toISOString() ?? approvedAt}::timestamptz,
        ${notification?.payloadJson ?? "{}"}::jsonb
      FROM transitioned_snapshot
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
    SELECT EXISTS(SELECT 1 FROM transitioned_snapshot) AS transitioned
  `;
};

const didTransition = (result: unknown): boolean =>
  Array.isArray(result) &&
  result.length > 0 &&
  (result[0] as { transitioned?: unknown }).transitioned === true;

export const recordSettlementApproval = async (
  input: ApprovalWriteInput,
): Promise<boolean> => {
  const approvedAt = input.approvedAt ?? new Date().toISOString();
  // 承認版の条件更新と全副作用を1 SQLにまとめ、競合した処理には通知させない。
  const result = postgresClient
    ? await approvalWriteQuery(
        postgresClient as unknown as SqlTag<unknown>,
        input,
        approvedAt,
      )
    : neonClient
      ? await approvalWriteQuery(
          neonClient as unknown as SqlTag<unknown>,
          input,
          approvedAt,
        )
      : null;
  if (!result) throw new Error("Database client is not configured.");
  return didTransition(result);
};
