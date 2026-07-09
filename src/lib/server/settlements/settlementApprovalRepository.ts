import { neonClient, postgresClient } from "$lib/server/db/client";
import { createSettlementSnapshotPayload } from "$lib/server/settlements/settlementSnapshot";
import type { SettlementSummary } from "$lib/server/settlements/settlementTypes";

type ApprovalWriteInput = {
  summary: SettlementSummary;
  approvedBy: string;
  scheduledDate?: string;
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
});

export const recordSettlementApproval = async (
  input: ApprovalWriteInput,
): Promise<void> => {
  const approvedAt = new Date();
  const snapshotJson = JSON.stringify(
    createSettlementSnapshotPayload(input.summary),
  );
  const detailsJson = JSON.stringify(approvalDetails(input));
  const targetId = approvalTargetId(input.summary);

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
          ${approvedAt}
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
        ${approvedAt}
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
  ]);
};
