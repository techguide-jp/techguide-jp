import type { MonthlyFeedbackInput } from "$lib/monthlyFeedback";
import {
  executeFeedbackWrite,
  feedbackInsert,
  feedbackWriteAllowed,
} from "$lib/server/settlements/monthlyFeedbackRepository";
import { sql, type SQL } from "drizzle-orm";
import type { SettlementSummary } from "$lib/server/settlements/settlementTypes";
import { createSettlementSnapshotPayload } from "$lib/server/settlements/settlementSnapshot";
import type { PreparedNotificationWrite } from "$lib/server/notifications/notificationWrite";
import {
  executeGuardedSettlementWrite,
  settlementSourceMatches,
} from "$lib/server/settlements/settlementWriteGuard";

/** 旧申請を差し替える前の保存証跡も取り込む。既に固定した単価は上書きしない。 */
const frozenRateCtes = (): SQL => sql`
  retained AS (
    SELECT month, assignee_login, snapshot, submitted_at AS frozen_at, submitted_by AS frozen_by, 1 AS priority
    FROM monthly_work_submissions
    UNION ALL
    SELECT month, assignee_login, snapshot, approved_at, approved_by, 0
    FROM monthly_settlement_snapshots
  ),
  candidates AS (
    SELECT *, 'legacy_snapshot' AS source FROM retained
    UNION ALL
    SELECT month, assignee_login, snapshot, submitted_at, submitted_by, 2, 'submission'
    FROM submitted
  ),
  frozen_rates AS (
    INSERT INTO issue_hourly_rates (
      repository, issue_number, assignee_login, hourly_rate_yen, first_month, frozen_at, frozen_by, source
    )
    SELECT DISTINCT ON (line->'issue'->>'repository', line->'issue'->>'number', candidates.assignee_login)
      line->'issue'->>'repository', (line->'issue'->>'number')::integer,
      candidates.assignee_login,
      coalesce(line->>'hourlyRateYenSnapshot', line->'issue'->>'hourlyRateYen')::integer,
      candidates.month, candidates.frozen_at, candidates.frozen_by, candidates.source
    FROM candidates
    CROSS JOIN LATERAL jsonb_array_elements(coalesce(candidates.snapshot->'comparable'->'lines', candidates.snapshot->'lines', '[]'::jsonb)) AS line
    WHERE EXISTS (SELECT 1 FROM submitted)
    ORDER BY line->'issue'->>'repository', line->'issue'->>'number', candidates.assignee_login,
      candidates.frozen_at, candidates.month, candidates.priority, candidates.source
    ON CONFLICT (repository, issue_number, assignee_login) DO NOTHING
    RETURNING *
  ),
  rate_audit AS (
    INSERT INTO audit_logs (actor_login, action, target_type, target_id, details)
    SELECT frozen_by, 'issue_hourly_rate_frozen', 'issue_hourly_rate',
      repository || '#' || issue_number || '#' || assignee_login, to_jsonb(frozen_rates)
    FROM frozen_rates RETURNING 1
  )
`;

export const recordWorkSubmission = async (input: {
  summary: SettlementSummary;
  submittedBy: string;
  submittedAt: Date;
  expectedSourceToken?: string;
  notification?: PreparedNotificationWrite;
  feedback?: MonthlyFeedbackInput;
  legacy?: boolean;
}): Promise<boolean> => {
  const payload = JSON.stringify(
    createSettlementSnapshotPayload(input.summary),
  );
  const notification = input.notification;
  const query = sql`
    WITH submitted AS (
      INSERT INTO monthly_work_submissions (month, assignee_login, snapshot, submitted_by, submitted_at)
      SELECT ${input.summary.month}, ${input.summary.assigneeLogin}, ${payload}::jsonb,
        ${input.submittedBy}, ${input.submittedAt.toISOString()}::timestamptz
      WHERE ${settlementSourceMatches(input.expectedSourceToken)}
        AND ${input.feedback ? feedbackWriteAllowed(input.summary.month, input.summary.assigneeLogin, input.feedback.version) : sql`true`}
      ON CONFLICT (month, assignee_login) DO UPDATE SET snapshot = EXCLUDED.snapshot,
        submitted_by = EXCLUDED.submitted_by, submitted_at = EXCLUDED.submitted_at
      RETURNING *
    ),
    ${input.legacy ? sql`` : sql`${frozenRateCtes()},`}
    ${input.feedback ? sql`feedback_saved AS (${feedbackInsert(input.summary.month, input.summary.assigneeLogin, input.feedback, sql`EXISTS (SELECT 1 FROM submitted)`)}),` : sql``}
    submission_audit AS (
      INSERT INTO audit_logs (actor_login, action, target_type, target_id, details)
      SELECT submitted_by, 'monthly_work_submitted', 'monthly_work_submission', month || ':' || assignee_login,
        jsonb_build_object('month', month, 'assigneeLogin', assignee_login,
          'taxExcludedYen', ${input.summary.taxExcludedYen}::integer,
          'taxIncludedYen', ${input.summary.taxIncludedYen}::integer)
      FROM submitted WHERE ${!input.legacy} RETURNING 1
    ),
    inserted_event AS (
      INSERT INTO email_notification_events (id, event_key, type, month, assignee_login, occurred_at, payload)
      SELECT ${notification?.eventId ?? null}::uuid, ${notification?.eventKey ?? ""},
        ${notification?.type ?? "settlement_submitted"}::email_notification_type,
        ${notification?.month ?? input.summary.month}, ${notification?.assigneeLogin ?? input.summary.assigneeLogin},
        ${notification?.occurredAt.toISOString() ?? input.submittedAt.toISOString()}::timestamptz,
        ${notification?.payloadJson ?? "{}"}::jsonb
      FROM submitted WHERE ${Boolean(notification)}
      ON CONFLICT (event_key) DO NOTHING RETURNING id
    ),
    inserted_deliveries AS (
      INSERT INTO email_deliveries (id, event_id, recipient_login, recipient_email, status, subject, text_body, html_body, idempotency_key, error_code)
      SELECT delivery.id::uuid, inserted_event.id, delivery."recipientLogin", delivery."recipientEmail",
        delivery.status::email_delivery_status, delivery.subject, delivery."textBody", delivery."htmlBody",
        delivery."idempotencyKey", delivery."errorCode"
      FROM inserted_event
      CROSS JOIN jsonb_to_recordset(${JSON.stringify(notification?.deliveries ?? [])}::jsonb) AS delivery(
        id text, "recipientLogin" text, "recipientEmail" text, status text, subject text,
        "textBody" text, "htmlBody" text, "idempotencyKey" text, "errorCode" text)
      ON CONFLICT (event_id, recipient_login) DO NOTHING RETURNING id
    )
    SELECT EXISTS(SELECT 1 FROM submitted) AS transitioned
  `;
  const result = input.legacy
    ? await executeFeedbackWrite(query)
    : await executeGuardedSettlementWrite(query, Boolean(input.feedback));
  return (
    Array.isArray(result) &&
    (result[0] as { transitioned?: unknown })?.transitioned === true
  );
};
