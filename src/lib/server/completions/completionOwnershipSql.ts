import { sql, type SQL } from "drizzle-orm";

type IssueRef = { repository: string; issueNumber: number };

/** 呼び出し元で精算入力ロックを取得し、別statementの最新状態から選択する。 */
export const selectedCompletionId = (issue: IssueRef): SQL => sql`(
  SELECT report.id FROM issue_completion_reports report
  WHERE report.repository = ${issue.repository}
    AND report.issue_number = ${issue.issueNumber}
    AND report.invalidated_at IS NULL
    AND (
      SELECT count(*) FROM issue_completion_reports confirmed
      WHERE confirmed.repository = report.repository
        AND confirmed.issue_number = report.issue_number
        AND confirmed.invalidated_at IS NULL
        AND confirmed.eligibility_confirmed_at IS NOT NULL
    ) <= 1
  ORDER BY (report.eligibility_confirmed_at IS NOT NULL) DESC,
    report.reported_at DESC, report.created_at DESC, report.id DESC
  LIMIT 1
)`;

/** 承認済み固定報酬は、月・名義・報告IDが違っても同じIssueへの再支払いを認めない。 */
export const fixedSettlementLines = (issue: IssueRef): SQL => sql`
  SELECT snapshot.month, snapshot.assignee_login, line
  FROM monthly_settlement_snapshots snapshot
  CROSS JOIN LATERAL jsonb_array_elements(
    COALESCE(snapshot.snapshot->'comparable'->'lines', snapshot.snapshot->'lines', '[]'::jsonb)
  ) AS line
  WHERE line->'issue'->>'repository' = ${issue.repository}
    AND line->'issue'->>'number' = ${String(issue.issueNumber)}
    AND COALESCE((line->>'fixedRewardYen')::numeric, 0) > 0
`;

export const hasSupplementalForIssue = (issue: IssueRef): SQL => sql`EXISTS (
  SELECT 1 FROM supplemental_payments payment
  JOIN issue_completion_reports report ON report.id = payment.completion_report_id
  WHERE report.repository = ${issue.repository} AND report.issue_number = ${issue.issueNumber}
)`;
