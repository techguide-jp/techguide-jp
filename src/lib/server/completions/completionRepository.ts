import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, neonClient, postgresClient } from "$lib/server/db/client";
import {
  issueCompletionReports,
  monthlySettlementSnapshots,
  supplementalPayments,
  type IssueCompletionReport,
  type SupplementalPayment,
} from "$lib/server/db/schema";
import type { CompletionReportWriteInput } from "$lib/server/completions/completionTypes";
import type { SqlTag } from "$lib/server/notifications/notificationWrite";

const executeSql = async (
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

export const replaceActiveCompletionReport = async (
  input: CompletionReportWriteInput,
): Promise<IssueCompletionReport> => {
  const now = new Date();
  const details = JSON.stringify({
    repository: input.repository,
    issueNumber: input.issueNumber,
    assigneeLogin: input.assigneeLogin,
    settlementMonth: input.settlementMonth,
    source: input.source,
    fixedRewardYen: input.fixedRewardYen,
  });

  const replacementQueries = <TResult>(sql: SqlTag<TResult>): TResult[] => [
    sql`
    WITH invalidated AS (
      UPDATE issue_completion_reports
      SET
        invalidated_at = ${now.toISOString()}::timestamptz,
        invalidated_by = ${input.createdBy},
        invalidation_reason = ${"新しい完了報告が提出されました。"}
      WHERE repository = ${input.repository}
        AND issue_number = ${input.issueNumber}
        AND assignee_login = ${input.assigneeLogin}
        AND invalidated_at IS NULL
        AND eligibility_confirmed_at IS NULL
      RETURNING id
    ),
    invalidated_audit AS (
      INSERT INTO audit_logs (
        actor_login, action, target_type, target_id, details
      )
      SELECT
        ${input.createdBy}, ${"issue_completion_invalidated"},
        ${"issue_completion_report"}, invalidated.id::text,
        ${JSON.stringify({ reason: "completion_replaced" })}::jsonb
      FROM invalidated
      RETURNING 1
    )
    SELECT count(*) FROM invalidated_audit
    `,
    sql`
    WITH
    inserted AS (
      INSERT INTO issue_completion_reports (
        id, project_item_id, repository, issue_number, issue_title, issue_url,
        assignee_login, settlement_month, reported_at, reward_mode,
        fixed_reward_yen, source, evidence_url, evidence_note,
        created_by, created_at
      ) VALUES (
        ${input.id}::uuid, ${input.projectItemId}, ${input.repository},
        ${input.issueNumber}, ${input.issueTitle}, ${input.issueUrl},
        ${input.assigneeLogin}, ${input.settlementMonth},
        ${input.reportedAt.toISOString()}::timestamptz, ${input.rewardMode},
        ${input.fixedRewardYen}, ${input.source}::completion_report_source,
        ${input.evidenceUrl ?? null}, ${input.evidenceNote ?? null},
        ${input.createdBy}, ${now.toISOString()}::timestamptz
      )
      RETURNING id
    )
    INSERT INTO audit_logs (
      actor_login, action, target_type, target_id, details
    )
    SELECT
      ${input.createdBy}, ${"issue_completion_reported"},
      ${"issue_completion_report"}, inserted.id::text, ${details}::jsonb
    FROM inserted
    `,
  ];
  if (postgresClient) {
    await postgresClient.begin(async (sql) => {
      for (const query of replacementQueries(
        sql as unknown as SqlTag<ReturnType<typeof sql>>,
      )) {
        await query;
      }
    });
  } else if (neonClient) {
    await neonClient.transaction((sql) => replacementQueries(sql));
  } else {
    throw new Error("Database client is not configured.");
  }

  const [report] = await db
    .select()
    .from(issueCompletionReports)
    .where(eq(issueCompletionReports.id, input.id))
    .limit(1);
  if (!report) throw new Error("完了報告の保存に失敗しました。");
  return report;
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

export const confirmCompletionEligibility = async (input: {
  report: IssueCompletionReport;
  confirmedAt: Date;
}): Promise<"base" | "supplemental" | "unchanged"> => {
  // 承認とマージ確認が競合した場合も、承認スナップショットに固定報酬行が無ければ
  // 次回の照合で追加支払いを補完する。報告ID入りの通常支払い行があれば二重計上しない。
  const taxYen = Math.round(input.report.fixedRewardYen * 0.1);
  const taxIncludedYen = input.report.fixedRewardYen + taxYen;
  const details = JSON.stringify({
    settlementMonth: input.report.settlementMonth,
    assigneeLogin: input.report.assigneeLogin,
    repository: input.report.repository,
    issueNumber: input.report.issueNumber,
  });

  const result = await executeSql(
    (sql) => sql`
    WITH confirmed AS (
      UPDATE issue_completion_reports
      SET eligibility_confirmed_at = ${input.confirmedAt.toISOString()}::timestamptz
      WHERE id = ${input.report.id}::uuid
        AND invalidated_at IS NULL
        AND eligibility_confirmed_at IS NULL
      RETURNING *
    ),
    eligible AS (
      SELECT * FROM confirmed
      UNION ALL
      SELECT report.*
      FROM issue_completion_reports AS report
      WHERE report.id = ${input.report.id}::uuid
        AND report.invalidated_at IS NULL
        AND report.eligibility_confirmed_at IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM confirmed)
    ),
    supplemental AS (
      INSERT INTO supplemental_payments (
        completion_report_id, month, assignee_login,
        tax_excluded_yen, tax_yen, tax_included_yen
      )
      SELECT
        eligible.id, eligible.settlement_month, eligible.assignee_login,
        eligible.fixed_reward_yen, ${taxYen}, ${taxIncludedYen}
      FROM eligible
      WHERE EXISTS (
        SELECT 1 FROM monthly_settlement_snapshots snapshot
        WHERE snapshot.month = eligible.settlement_month
          AND snapshot.assignee_login = eligible.assignee_login
          AND NOT EXISTS (
            SELECT 1
            FROM jsonb_array_elements(
              COALESCE(
                snapshot.snapshot->'comparable'->'lines',
                snapshot.snapshot->'lines',
                '[]'::jsonb
              )
            ) AS line
            WHERE line->>'completionReportId' = eligible.id::text
              AND COALESCE((line->>'fixedRewardYen')::integer, 0) > 0
          )
      )
      ON CONFLICT (completion_report_id) DO NOTHING
      RETURNING id
    ),
    supplemental_audit AS (
      INSERT INTO audit_logs (
        actor_login, action, target_type, target_id, details
      )
      SELECT
        ${"system"}, ${"supplemental_payment_created"},
        ${"supplemental_payment"}, supplemental.id::text,
        ${details}::jsonb
      FROM supplemental
      RETURNING 1
    ),
    inserted_audit AS (
      INSERT INTO audit_logs (
        actor_login, action, target_type, target_id, details
      )
      SELECT
        ${"system"}, ${"issue_completion_eligible"},
        ${"issue_completion_report"}, confirmed.id::text, ${details}::jsonb
      FROM confirmed
      RETURNING 1
    )
    SELECT
      EXISTS(SELECT 1 FROM confirmed) AS transitioned,
      EXISTS(SELECT 1 FROM supplemental) AS supplemental
  `,
  );
  const row =
    Array.isArray(result) && result.length > 0
      ? (result[0] as { transitioned?: unknown; supplemental?: unknown })
      : null;
  if (row?.supplemental === true) return "supplemental";
  return row?.transitioned === true ? "base" : "unchanged";
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
