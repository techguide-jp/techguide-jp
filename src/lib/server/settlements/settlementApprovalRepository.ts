import { neonClient, postgresClient } from "$lib/server/db/client";
import { createSettlementSnapshotPayload } from "$lib/server/settlements/settlementSnapshot";
import type { SettlementSummary } from "$lib/server/settlements/settlementTypes";
import type { PreparedNotice } from "$lib/server/notices/noticeTypes";

type ApprovalWriteInput = {
  summary: SettlementSummary;
  approvedBy: string;
  /** スナップショットと通知書で共有する承認日時。未指定なら生成する。 */
  approvedAt?: string;
  scheduledDate?: string;
  /** 同一トランザクションで append する通知書。振込先未登録時などは undefined。 */
  notice?: PreparedNotice;
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

export const recordSettlementApproval = async (
  input: ApprovalWriteInput,
): Promise<void> => {
  const approvedAt = input.approvedAt ?? new Date().toISOString();
  const snapshotJson = JSON.stringify(
    createSettlementSnapshotPayload(input.summary),
  );
  const detailsJson = JSON.stringify(approvalDetails(input));
  const targetId = approvalTargetId(input.summary);
  const notice = input.notice;
  const noticeDocumentJson = notice ? JSON.stringify(notice.document) : null;

  // Neon HTTP は interactive transaction 非対応なので、承認確定の書き込みをこの repository に集約する。
  if (postgresClient) {
    await postgresClient.begin(async (sql) => {
      await sql`
        INSERT INTO monthly_settlement_snapshots (
          month,
          assignee_login,
          snapshot,
          approved_by,
          approved_at
        )
        VALUES (
          ${input.summary.month},
          ${input.summary.assigneeLogin},
          ${snapshotJson}::jsonb,
          ${input.approvedBy},
          ${approvedAt}::timestamptz
        )
        ON CONFLICT (month, assignee_login)
        DO UPDATE SET
          snapshot = EXCLUDED.snapshot,
          approved_by = EXCLUDED.approved_by,
          approved_at = EXCLUDED.approved_at
      `;

      if (input.scheduledDate) {
        await sql`
          INSERT INTO monthly_payments (
            month,
            assignee_login,
            scheduled_date
          )
          VALUES (
            ${input.summary.month},
            ${input.summary.assigneeLogin},
            ${input.scheduledDate}
          )
          ON CONFLICT (month, assignee_login)
          DO UPDATE SET
            scheduled_date = EXCLUDED.scheduled_date,
            updated_at = now()
        `;
      }

      await sql`
        INSERT INTO audit_logs (
          actor_login,
          action,
          target_type,
          target_id,
          details
        )
        VALUES (
          ${input.approvedBy},
          ${"monthly_settlement_approved"},
          ${"monthly_settlement_snapshot"},
          ${targetId},
          ${detailsJson}::jsonb
        )
      `;

      if (notice) {
        await sql`
          INSERT INTO payment_notices (
            month,
            assignee_login,
            document,
            worker_display_name,
            recipient_encrypted_payload,
            encryption_key_version,
            scheduled_date,
            approved_by,
            approved_at,
            issued_on,
            created_by
          )
          VALUES (
            ${notice.month},
            ${notice.assigneeLogin},
            ${noticeDocumentJson}::jsonb,
            ${notice.workerDisplayName},
            ${notice.recipientEncryptedPayload},
            ${notice.encryptionKeyVersion},
            ${notice.scheduledDate}::date,
            ${notice.approvedBy},
            ${approvedAt}::timestamptz,
            ${notice.issuedOn}::date,
            ${notice.createdBy}
          )
        `;
      }
    });
    return;
  }

  if (!neonClient) {
    throw new Error("Database client is not configured.");
  }

  await neonClient.transaction((sql) => [
    sql`
      INSERT INTO monthly_settlement_snapshots (
        month,
        assignee_login,
        snapshot,
        approved_by,
        approved_at
      )
      VALUES (
        ${input.summary.month},
        ${input.summary.assigneeLogin},
        ${snapshotJson}::jsonb,
        ${input.approvedBy},
        ${approvedAt}::timestamptz
      )
      ON CONFLICT (month, assignee_login)
      DO UPDATE SET
        snapshot = EXCLUDED.snapshot,
        approved_by = EXCLUDED.approved_by,
        approved_at = EXCLUDED.approved_at
    `,
    ...(input.scheduledDate
      ? [
          sql`
            INSERT INTO monthly_payments (
              month,
              assignee_login,
              scheduled_date
            )
            VALUES (
              ${input.summary.month},
              ${input.summary.assigneeLogin},
              ${input.scheduledDate}
            )
            ON CONFLICT (month, assignee_login)
            DO UPDATE SET
              scheduled_date = EXCLUDED.scheduled_date,
              updated_at = now()
          `,
        ]
      : []),
    sql`
      INSERT INTO audit_logs (
        actor_login,
        action,
        target_type,
        target_id,
        details
      )
      VALUES (
        ${input.approvedBy},
        ${"monthly_settlement_approved"},
        ${"monthly_settlement_snapshot"},
        ${targetId},
        ${detailsJson}::jsonb
      )
    `,
    ...(notice
      ? [
          sql`
            INSERT INTO payment_notices (
              month,
              assignee_login,
              document,
              worker_display_name,
              recipient_encrypted_payload,
              encryption_key_version,
              scheduled_date,
              approved_by,
              approved_at,
              issued_on,
              created_by
            )
            VALUES (
              ${notice.month},
              ${notice.assigneeLogin},
              ${noticeDocumentJson}::jsonb,
              ${notice.workerDisplayName},
              ${notice.recipientEncryptedPayload},
              ${notice.encryptionKeyVersion},
              ${notice.scheduledDate}::date,
              ${notice.approvedBy},
              ${approvedAt}::timestamptz,
              ${notice.issuedOn}::date,
              ${notice.createdBy}
            )
          `,
        ]
      : []),
  ]);
};
