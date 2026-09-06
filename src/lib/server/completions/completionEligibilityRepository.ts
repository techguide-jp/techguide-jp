import { sql } from "drizzle-orm";
import type { IssueCompletionReport } from "$lib/server/db/schema";
import {
  selectedCompletionId,
  fixedSettlementLines,
} from "$lib/server/completions/completionOwnershipSql";
import { executeGuardedSettlementWrite } from "$lib/server/settlements/settlementWriteGuard";

export const confirmCompletionEligibility = async (input: {
  report: IssueCompletionReport;
  confirmedAt: Date;
}): Promise<"base" | "supplemental" | "unchanged"> => {
  const { report } = input;
  // ロック待機中の再報告・月次承認も読み直し、Issue単位で対象を一つに限定する。
  const result = await executeGuardedSettlementWrite(sql`
    WITH candidate AS (
      SELECT report.* FROM issue_completion_reports report
      WHERE report.id = ${report.id}::uuid AND report.id = ${selectedCompletionId(report)}
        AND NOT EXISTS (
          SELECT 1 FROM (${fixedSettlementLines(report)}) settled
          WHERE (
            settled.line->>'completionReportId' = report.id::text
            OR (settled.line->>'completionReportId' IS NULL
              AND settled.month = report.settlement_month AND settled.assignee_login = report.assignee_login)
          ) IS NOT TRUE
        )
        AND NOT EXISTS (
          SELECT 1 FROM supplemental_payments payment
          JOIN issue_completion_reports prior ON prior.id = payment.completion_report_id
          WHERE prior.repository = report.repository AND prior.issue_number = report.issue_number
            AND prior.id <> report.id
        )
    ), invalidated AS (
      UPDATE issue_completion_reports old
      SET invalidated_at = ${input.confirmedAt.toISOString()}::timestamptz,
        invalidated_by = 'system', invalidation_reason = '同じIssueの新しい完了報告を優先しました。'
      FROM candidate
      WHERE old.repository = candidate.repository AND old.issue_number = candidate.issue_number
        AND old.id <> candidate.id AND old.invalidated_at IS NULL
        AND old.eligibility_confirmed_at IS NULL
      RETURNING old.id
    ), invalidated_audit AS (
      INSERT INTO audit_logs (actor_login, action, target_type, target_id, details)
      SELECT 'system', 'issue_completion_invalidated', 'issue_completion_report', id::text,
        ${JSON.stringify({ reason: "completion_superseded", selectedReportId: report.id })}::jsonb
      FROM invalidated RETURNING 1
    ), confirmed AS (
      UPDATE issue_completion_reports target
      SET eligibility_confirmed_at = ${input.confirmedAt.toISOString()}::timestamptz
      FROM candidate
      WHERE target.id = candidate.id AND target.eligibility_confirmed_at IS NULL
      RETURNING target.*
    ), eligible AS (
      SELECT * FROM confirmed
      UNION ALL
      SELECT * FROM candidate WHERE eligibility_confirmed_at IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM confirmed)
    ), supplemental AS (
      INSERT INTO supplemental_payments (
        completion_report_id, month, assignee_login, tax_excluded_yen, tax_yen, tax_included_yen
      )
      SELECT eligible.id, eligible.settlement_month, eligible.assignee_login,
        eligible.fixed_reward_yen, round(eligible.fixed_reward_yen * 0.1)::integer,
        eligible.fixed_reward_yen + round(eligible.fixed_reward_yen * 0.1)::integer
      FROM eligible
      WHERE EXISTS (
        SELECT 1 FROM monthly_settlement_snapshots snapshot
        WHERE snapshot.month = eligible.settlement_month AND snapshot.assignee_login = eligible.assignee_login
      ) AND NOT EXISTS (${fixedSettlementLines(report)})
      ON CONFLICT (completion_report_id) DO NOTHING RETURNING id
    ), supplemental_audit AS (
      INSERT INTO audit_logs (actor_login, action, target_type, target_id, details)
      SELECT 'system', 'supplemental_payment_created', 'supplemental_payment', id::text,
        ${JSON.stringify({
          settlementMonth: report.settlementMonth,
          assigneeLogin: report.assigneeLogin,
          repository: report.repository,
          issueNumber: report.issueNumber,
        })}::jsonb
      FROM supplemental RETURNING 1
    ), confirmed_audit AS (
      INSERT INTO audit_logs (actor_login, action, target_type, target_id, details)
      SELECT 'system', 'issue_completion_eligible', 'issue_completion_report', id::text,
        jsonb_build_object('settlementMonth', settlement_month, 'assigneeLogin', assignee_login,
          'repository', repository, 'issueNumber', issue_number)
      FROM confirmed RETURNING 1
    )
    SELECT EXISTS(SELECT 1 FROM confirmed) AS transitioned,
      EXISTS(SELECT 1 FROM supplemental) AS supplemental
  `);
  const row = Array.isArray(result)
    ? (result[0] as
        | { transitioned?: unknown; supplemental?: unknown }
        | undefined)
    : undefined;
  if (row?.supplemental === true) return "supplemental";
  return row?.transitioned === true ? "base" : "unchanged";
};
