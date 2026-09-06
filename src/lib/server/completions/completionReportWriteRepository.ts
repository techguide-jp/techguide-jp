import { eq, sql } from "drizzle-orm";
import { db } from "$lib/server/db/client";
import {
  issueCompletionReports,
  type IssueCompletionReport,
} from "$lib/server/db/schema";
import type { CompletionReportWriteInput } from "$lib/server/completions/completionTypes";
import {
  fixedSettlementLines,
  hasSupplementalForIssue,
} from "$lib/server/completions/completionOwnershipSql";
import { executeGuardedSettlementWrite } from "$lib/server/settlements/settlementWriteGuard";

export const replaceActiveCompletionReport = async (
  input: CompletionReportWriteInput,
): Promise<IssueCompletionReport> => {
  const now = new Date();
  // 現在担当者が変わっても、確認済み・精算済みの成果を別報告で上書きしない。
  const allowed = sql`
    NOT EXISTS (
      SELECT 1 FROM issue_completion_reports report
      WHERE report.repository = ${input.repository}
        AND report.issue_number = ${input.issueNumber}
        AND report.invalidated_at IS NULL
        AND (report.eligibility_confirmed_at IS NOT NULL
          OR ${input.source === "admin_backfill"}
          OR (report.reported_at, report.created_at, report.id) >
            (${input.reportedAt.toISOString()}::timestamptz, ${now.toISOString()}::timestamptz, ${input.id}::uuid))
    )
    AND NOT EXISTS (${fixedSettlementLines(input)})
    AND NOT ${hasSupplementalForIssue(input)}
  `;
  const result = await executeGuardedSettlementWrite([
    sql`
      WITH invalidated AS (
        UPDATE issue_completion_reports
        SET invalidated_at = ${now.toISOString()}::timestamptz,
          invalidated_by = ${input.createdBy},
          invalidation_reason = ${"新しい完了報告が提出されました。"}
        WHERE repository = ${input.repository} AND issue_number = ${input.issueNumber}
          AND invalidated_at IS NULL AND eligibility_confirmed_at IS NULL
          AND (${allowed})
        RETURNING id
      )
      INSERT INTO audit_logs (actor_login, action, target_type, target_id, details)
      SELECT ${input.createdBy}, 'issue_completion_invalidated', 'issue_completion_report', id::text,
        ${JSON.stringify({ reason: "completion_replaced", replacementReportId: input.id })}::jsonb
      FROM invalidated
    `,
    sql`
      WITH inserted AS (
        INSERT INTO issue_completion_reports (
          id, project_item_id, repository, issue_number, issue_title, issue_url,
          assignee_login, settlement_month, reported_at, reward_mode, fixed_reward_yen,
          source, evidence_url, evidence_note, created_by, created_at
        )
        SELECT ${input.id}::uuid, ${input.projectItemId}, ${input.repository}, ${input.issueNumber},
          ${input.issueTitle}, ${input.issueUrl}, ${input.assigneeLogin}, ${input.settlementMonth},
          ${input.reportedAt.toISOString()}::timestamptz, ${input.rewardMode}, ${input.fixedRewardYen},
          ${input.source}::completion_report_source, ${input.evidenceUrl ?? null},
          ${input.evidenceNote ?? null}, ${input.createdBy}, ${now.toISOString()}::timestamptz
        WHERE (${allowed})
        RETURNING id
      ), audited AS (
        INSERT INTO audit_logs (actor_login, action, target_type, target_id, details)
        SELECT ${input.createdBy}, 'issue_completion_reported', 'issue_completion_report', id::text,
          ${JSON.stringify({
            repository: input.repository,
            issueNumber: input.issueNumber,
            assigneeLogin: input.assigneeLogin,
            settlementMonth: input.settlementMonth,
            source: input.source,
            fixedRewardYen: input.fixedRewardYen,
          })}::jsonb
        FROM inserted RETURNING 1
      ) SELECT id FROM inserted
    `,
  ]);
  if (!Array.isArray(result) || result.length !== 1) {
    throw new Error(
      "Issueに確認済み・精算済みまたは新しい完了報告があります。再読み込みして確認してください。",
    );
  }
  const [report] = await db
    .select()
    .from(issueCompletionReports)
    .where(eq(issueCompletionReports.id, input.id))
    .limit(1);
  if (!report) throw new Error("完了報告の保存に失敗しました。");
  return report;
};
