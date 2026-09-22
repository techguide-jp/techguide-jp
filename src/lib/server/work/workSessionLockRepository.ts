import { sql, type SQL } from "drizzle-orm";
import { executeSettlementQueries } from "$lib/server/settlements/settlementWriteGuard";

export type WorkSessionLock = "pending" | "submitted";

// 稼働日ではなく保存済み明細のログIDで判定し、V1の完了月精算とV2の月またぎに対応する。
const includedInSubmission = (sessionId: SQL, login: string): SQL => sql`
  EXISTS (
    SELECT 1 FROM (
      SELECT snapshot FROM monthly_work_submissions WHERE assignee_login = ${login}
      UNION ALL
      SELECT snapshot FROM monthly_settlement_snapshots WHERE assignee_login = ${login}
    ) saved
    CROSS JOIN LATERAL jsonb_array_elements(coalesce(saved.snapshot->'comparable'->'lines', saved.snapshot->'lines', '[]'::jsonb)) line
    CROSS JOIN LATERAL jsonb_array_elements(coalesce(line->'sessions', '[]'::jsonb)) session
    WHERE session->>'id' = ${sessionId}::text
  )
`;
const pendingRequest = (sessionId: SQL): SQL => sql`
  EXISTS (SELECT 1 FROM work_log_change_requests WHERE target_session_id = ${sessionId} AND status = 'pending')
`;

export const listWorkSessionLocks = async (
  login: string,
): Promise<Record<string, WorkSessionLock>> => {
  const [result] = await executeSettlementQueries([
    sql`
    SELECT id, CASE
      WHEN ${includedInSubmission(sql`work_sessions.id`, login)} THEN 'submitted'
      WHEN ${pendingRequest(sql`work_sessions.id`)} THEN 'pending'
    END AS reason
    FROM work_sessions WHERE assignee_login = ${login}
  `,
  ]);
  const rows = result as { id: string; reason: WorkSessionLock | null }[];
  return Object.fromEntries(
    rows
      .filter((row) => row.reason)
      .map((row) => [row.id, row.reason as WorkSessionLock]),
  );
};

export const createUnlockedSessionChangeRequest = async (input: {
  requestType: "edit" | "exclude";
  targetSessionId: string;
  assigneeLogin: string;
  repository: string;
  issueNumber: number;
  issueTitle: string;
  requestedStartedAt?: Date;
  requestedEndedAt?: Date;
  reason: string;
}): Promise<boolean> => {
  // 直接POST・二重送信でもロックを迂回できないよう、再判定と保存を同じtransactionにまとめる。
  const results = await executeSettlementQueries([
    sql`SET LOCAL lock_timeout = '5s'`,
    sql`LOCK TABLE work_sessions, work_log_change_requests, monthly_work_submissions, monthly_settlement_snapshots IN SHARE ROW EXCLUSIVE MODE`,
    sql`
      INSERT INTO work_log_change_requests (
        request_type, assignee_login, repository, issue_number, issue_title,
        target_session_id, requested_started_at, requested_ended_at, reason, requested_by
      )
      SELECT ${input.requestType}::work_log_change_request_type, ${input.assigneeLogin}, ${input.repository}, ${input.issueNumber}, ${input.issueTitle},
        id, ${input.requestedStartedAt?.toISOString() ?? null}::timestamptz,
        ${input.requestedEndedAt?.toISOString() ?? null}::timestamptz, ${input.reason}, ${input.assigneeLogin}
      FROM work_sessions WHERE id = ${input.targetSessionId}::uuid
        AND assignee_login = ${input.assigneeLogin} AND repository = ${input.repository} AND issue_number = ${input.issueNumber}
        AND ended_at IS NOT NULL
        AND NOT ${pendingRequest(sql`work_sessions.id`)}
        AND NOT ${includedInSubmission(sql`work_sessions.id`, input.assigneeLogin)}
      RETURNING id
    `,
  ]);
  const rows = results.at(-1);
  return Array.isArray(rows) && rows.length === 1;
};
