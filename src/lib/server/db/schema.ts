import {
  bigint,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { PaymentNoticeDocument } from "$lib/server/notices/noticeTypes";

export const changeRequestType = pgEnum("work_log_change_request_type", [
  "add",
  "edit",
  "exclude",
]);

export const changeRequestStatus = pgEnum("work_log_change_request_status", [
  "pending",
  "approved",
  "rejected",
]);

export const githubProjectStatusSyncStatus = pgEnum(
  "github_project_status_sync_status",
  ["pending", "resolved"],
);

export const monthlyPaymentStatus = pgEnum("monthly_payment_status", [
  "unpaid",
  "paid",
]);

export const completionReportSource = pgEnum("completion_report_source", [
  "worker",
  "admin_backfill",
  "admin_confirmation",
]);

export const supplementalPaymentStatus = pgEnum("supplemental_payment_status", [
  "unpaid",
  "paid",
]);

export const emailNotificationType = pgEnum("email_notification_type", [
  "settlement_submitted",
  "settlement_approved",
  "settlement_paid",
  "monthly_submission_reminder",
  "supplemental_payment_scheduled",
  "supplemental_payment_paid",
]);

export const emailDeliveryStatus = pgEnum("email_delivery_status", [
  "pending",
  "sending",
  "accepted",
  "skipped",
  "failed",
  "unknown",
]);

export const workerProfiles = pgTable(
  "worker_profiles",
  {
    login: text("login").primaryKey(),
    displayName: text("display_name").notNull(),
    slackMemberId: text("slack_member_id").notNull().default(""),
    skills: jsonb("skills")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    specialtyNote: text("specialty_note").notNull().default(""),
    availabilityNote: text("availability_note").notNull().default(""),
    selfAssignmentNote: text("self_assignment_note").notNull().default(""),
    partnerInterest: text("partner_interest").$type<
      "interested" | "conditional" | "not_interested"
    >(),
    partnerConditions: text("partner_conditions").notNull().default(""),
    preferencesVersion: integer("preferences_version").notNull().default(0),
    preferencesUpdatedAt: timestamp("preferences_updated_at", {
      withTimezone: true,
    }),
    adminNote: text("admin_note").notNull().default(""),
    adminNoteUpdatedBy: text("admin_note_updated_by"),
    adminNoteUpdatedAt: timestamp("admin_note_updated_at", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("worker_profiles_display_name_idx").on(table.displayName),
    check(
      "worker_profiles_partner_interest_chk",
      sql`${table.partnerInterest} IS NULL OR ${table.partnerInterest} IN ('interested', 'conditional', 'not_interested')`,
    ),
    check(
      "worker_profiles_partner_conditions_chk",
      sql`char_length(${table.partnerConditions}) <= 2000 AND (${table.partnerInterest} IN ('interested', 'conditional') OR ${table.partnerConditions} = '')`,
    ),
    check(
      "worker_profiles_skills_array_chk",
      sql`jsonb_typeof(${table.skills}) = 'array'`,
    ),
  ],
);

export const userNotificationContacts = pgTable("user_notification_contacts", {
  githubLogin: text("github_login").primaryKey(),
  email: text("email").notNull(),
  source: text("source").notNull().default("github"),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const workerPayoutAccounts = pgTable("worker_payout_accounts", {
  login: text("login")
    .primaryKey()
    .references(() => workerProfiles.login, { onDelete: "cascade" }),
  encryptedPayload: text("encrypted_payload").notNull(),
  encryptionKeyVersion: integer("encryption_key_version").notNull().default(1),
  updatedBy: text("updated_by").notNull(),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const authSessions = pgTable(
  "auth_sessions",
  {
    id: text("id").primaryKey(),
    githubLogin: text("github_login").notNull(),
    githubName: text("github_name"),
    githubAvatarUrl: text("github_avatar_url"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("auth_sessions_github_login_idx").on(table.githubLogin)],
);

export const workSessions = pgTable(
  "work_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assigneeLogin: text("assignee_login").notNull(),
    repository: text("repository").notNull(),
    issueNumber: integer("issue_number").notNull(),
    issueTitle: text("issue_title").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    excludedAt: timestamp("excluded_at", { withTimezone: true }),
    excludeReason: text("exclude_reason"),
  },
  (table) => [
    index("work_sessions_assignee_idx").on(table.assigneeLogin),
    index("work_sessions_issue_idx").on(table.repository, table.issueNumber),
    index("work_sessions_started_at_idx").on(table.startedAt),
    uniqueIndex("work_sessions_assignee_issue_open_unique_idx")
      .on(table.assigneeLogin, table.repository, table.issueNumber)
      .where(sql`${table.endedAt} IS NULL AND ${table.excludedAt} IS NULL`),
    check(
      "work_sessions_ended_after_started_chk",
      sql`${table.endedAt} IS NULL OR ${table.endedAt} > ${table.startedAt}`,
    ),
  ],
);

export const workLogChangeRequests = pgTable(
  "work_log_change_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestType: changeRequestType("request_type").notNull(),
    status: changeRequestStatus("status").notNull().default("pending"),
    assigneeLogin: text("assignee_login").notNull(),
    repository: text("repository").notNull(),
    issueNumber: integer("issue_number").notNull(),
    issueTitle: text("issue_title").notNull(),
    targetSessionId: uuid("target_session_id").references(
      () => workSessions.id,
    ),
    requestedStartedAt: timestamp("requested_started_at", {
      withTimezone: true,
    }),
    requestedEndedAt: timestamp("requested_ended_at", { withTimezone: true }),
    reason: text("reason").notNull(),
    requestedBy: text("requested_by").notNull(),
    reviewedBy: text("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNote: text("review_note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("work_log_change_requests_status_idx").on(table.status),
    index("work_log_change_requests_assignee_idx").on(table.assigneeLogin),
    index("work_log_change_requests_issue_idx").on(
      table.repository,
      table.issueNumber,
    ),
    index("work_log_change_requests_created_at_idx").on(table.createdAt),
    check(
      "work_log_change_requests_shape_chk",
      sql`
        (
          ${table.requestType} = 'add'
          AND ${table.targetSessionId} IS NULL
          AND ${table.requestedStartedAt} IS NOT NULL
          AND ${table.requestedEndedAt} IS NOT NULL
          AND ${table.requestedEndedAt} > ${table.requestedStartedAt}
        )
        OR (
          ${table.requestType} = 'edit'
          AND ${table.targetSessionId} IS NOT NULL
          AND ${table.requestedStartedAt} IS NOT NULL
          AND ${table.requestedEndedAt} IS NOT NULL
          AND ${table.requestedEndedAt} > ${table.requestedStartedAt}
        )
        OR (
          ${table.requestType} = 'exclude'
          AND ${table.targetSessionId} IS NOT NULL
          AND ${table.requestedStartedAt} IS NULL
          AND ${table.requestedEndedAt} IS NULL
        )
      `,
    ),
  ],
);

export const issueCompletionReports = pgTable(
  "issue_completion_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectItemId: text("project_item_id").notNull(),
    repository: text("repository").notNull(),
    issueNumber: integer("issue_number").notNull(),
    issueTitle: text("issue_title").notNull(),
    issueUrl: text("issue_url").notNull(),
    assigneeLogin: text("assignee_login").notNull(),
    settlementMonth: text("settlement_month").notNull(),
    reportedAt: timestamp("reported_at", { withTimezone: true }).notNull(),
    rewardMode: text("reward_mode").$type<"固定" | "ハイブリッド">().notNull(),
    fixedRewardYen: integer("fixed_reward_yen").notNull(),
    source: completionReportSource("source").notNull().default("worker"),
    evidenceUrl: text("evidence_url"),
    evidenceNote: text("evidence_note"),
    invalidatedAt: timestamp("invalidated_at", { withTimezone: true }),
    invalidatedBy: text("invalidated_by"),
    invalidationReason: text("invalidation_reason"),
    eligibilityConfirmedAt: timestamp("eligibility_confirmed_at", {
      withTimezone: true,
    }),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("issue_completion_reports_month_assignee_idx").on(
      table.settlementMonth,
      table.assigneeLogin,
    ),
    index("issue_completion_reports_issue_idx").on(
      table.repository,
      table.issueNumber,
    ),
    uniqueIndex("issue_completion_reports_active_unique_idx")
      .on(table.repository, table.issueNumber, table.assigneeLogin)
      .where(sql`${table.invalidatedAt} IS NULL`),
    check(
      "issue_completion_reports_month_chk",
      sql`${table.settlementMonth} ~ '^\\d{4}-(0[1-9]|1[0-2])$'`,
    ),
    check(
      "issue_completion_reports_fixed_reward_chk",
      sql`${table.fixedRewardYen} >= 0`,
    ),
    check(
      "issue_completion_reports_reward_mode_chk",
      sql`${table.rewardMode} IN ('固定', 'ハイブリッド')`,
    ),
    check(
      "issue_completion_reports_reported_month_chk",
      // 管理者の完了確認は、登録した日時とは別に精算月を指定する。
      sql`${table.source}::text = 'admin_confirmation' OR to_char(${table.reportedAt} AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM') = ${table.settlementMonth}`,
    ),
    check(
      "issue_completion_reports_reported_before_created_chk",
      sql`${table.reportedAt} <= ${table.createdAt}`,
    ),
    check(
      "issue_completion_reports_backfill_evidence_chk",
      sql`${table.source} = 'worker' OR ((${table.source}::text = 'admin_confirmation' OR ${table.settlementMonth} >= '2026-08') AND ${table.evidenceUrl} IS NOT NULL AND ${table.evidenceNote} IS NOT NULL)`,
    ),
    check(
      "issue_completion_reports_invalidation_chk",
      sql`
        (${table.invalidatedAt} IS NULL AND ${table.invalidatedBy} IS NULL AND ${table.invalidationReason} IS NULL)
        OR (${table.invalidatedAt} IS NOT NULL AND ${table.invalidatedBy} IS NOT NULL AND ${table.invalidationReason} IS NOT NULL)
      `,
    ),
    check(
      "issue_completion_reports_eligibility_chk",
      sql`${table.eligibilityConfirmedAt} IS NULL OR ${table.invalidatedAt} IS NULL`,
    ),
  ],
);

export const monthlySettlementSnapshots = pgTable(
  "monthly_settlement_snapshots",
  {
    month: text("month").notNull(),
    assigneeLogin: text("assignee_login").notNull(),
    snapshot: jsonb("snapshot").notNull(),
    approvedBy: text("approved_by").notNull(),
    approvedAt: timestamp("approved_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.month, table.assigneeLogin] }),
    check(
      "monthly_settlement_snapshots_month_chk",
      sql`${table.month} ~ '^\\d{4}-(0[1-9]|1[0-2])$'`,
    ),
  ],
);

export const monthlyWorkSubmissions = pgTable(
  "monthly_work_submissions",
  {
    month: text("month").notNull(),
    assigneeLogin: text("assignee_login").notNull(),
    snapshot: jsonb("snapshot").notNull(),
    submittedBy: text("submitted_by").notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.month, table.assigneeLogin] }),
    check(
      "monthly_work_submissions_month_chk",
      sql`${table.month} ~ '^\\d{4}-(0[1-9]|1[0-2])$'`,
    ),
  ],
);

// 本人用の本文を、管理者も読む精算スナップショットや通知へ混入させないため独立保存する。
export const monthlyFeedback = pgTable(
  "monthly_feedback",
  {
    month: text("month").notNull(),
    assigneeLogin: text("assignee_login").notNull(),
    operatorComment: text("operator_comment").notNull().default(""),
    privateReflection: text("private_reflection").notNull().default(""),
    version: integer("version").notNull().default(1),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.month, table.assigneeLogin] }),
    check(
      "monthly_feedback_month_chk",
      sql`${table.month} ~ '^\\d{4}-(0[1-9]|1[0-2])$'`,
    ),
    check(
      "monthly_feedback_length_chk",
      sql`char_length(${table.operatorComment}) <= 2000 AND char_length(${table.privateReflection}) <= 2000`,
    ),
  ],
);

// 月次申請の差し替え・明細除外では、最初に合意した単価を失わないため独立保存する。
export const issueHourlyRates = pgTable(
  "issue_hourly_rates",
  {
    repository: text("repository").notNull(),
    issueNumber: integer("issue_number").notNull(),
    assigneeLogin: text("assignee_login").notNull(),
    hourlyRateYen: integer("hourly_rate_yen"),
    firstMonth: text("first_month").notNull(),
    frozenAt: timestamp("frozen_at", { withTimezone: true }).notNull(),
    frozenBy: text("frozen_by").notNull(),
    source: text("source").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.repository, table.issueNumber, table.assigneeLogin],
    }),
    check("issue_hourly_rates_number_chk", sql`${table.issueNumber} > 0`),
    check(
      "issue_hourly_rates_amount_chk",
      sql`${table.hourlyRateYen} IS NULL OR ${table.hourlyRateYen} >= 0`,
    ),
    check(
      "issue_hourly_rates_month_chk",
      sql`${table.firstMonth} ~ '^\\d{4}-(0[1-9]|1[0-2])$'`,
    ),
    check(
      "issue_hourly_rates_source_chk",
      sql`${table.source} IN ('submission', 'legacy_snapshot')`,
    ),
  ],
);

export const monthlyPayments = pgTable(
  "monthly_payments",
  {
    month: text("month").notNull(),
    assigneeLogin: text("assignee_login").notNull(),
    status: monthlyPaymentStatus("status").notNull().default("unpaid"),
    scheduledDate: date("scheduled_date"),
    paidOn: date("paid_on"),
    paymentComment: text("payment_comment"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.month, table.assigneeLogin] }),
    check(
      "monthly_payments_month_chk",
      sql`${table.month} ~ '^\\d{4}-(0[1-9]|1[0-2])$'`,
    ),
    check(
      "monthly_payments_paid_chk",
      sql`
        (${table.status} = 'paid' AND ${table.paidOn} IS NOT NULL)
        OR (${table.status} = 'unpaid' AND ${table.paidOn} IS NULL)
      `,
    ),
  ],
);

export const supplementalPayments = pgTable(
  "supplemental_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    completionReportId: uuid("completion_report_id")
      .notNull()
      .references(() => issueCompletionReports.id),
    month: text("month").notNull(),
    assigneeLogin: text("assignee_login").notNull(),
    taxExcludedYen: integer("tax_excluded_yen").notNull(),
    taxYen: integer("tax_yen").notNull(),
    taxIncludedYen: integer("tax_included_yen").notNull(),
    scheduledDate: date("scheduled_date"),
    status: supplementalPaymentStatus("status").notNull().default("unpaid"),
    paidOn: date("paid_on"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("supplemental_payments_completion_report_unique_idx").on(
      table.completionReportId,
    ),
    index("supplemental_payments_month_assignee_idx").on(
      table.month,
      table.assigneeLogin,
    ),
    check(
      "supplemental_payments_month_chk",
      sql`${table.month} ~ '^\\d{4}-(0[1-9]|1[0-2])$'`,
    ),
    check(
      "supplemental_payments_amount_chk",
      sql`${table.taxExcludedYen} >= 0 AND ${table.taxYen} >= 0 AND ${table.taxIncludedYen} = ${table.taxExcludedYen} + ${table.taxYen}`,
    ),
    check(
      "supplemental_payments_paid_chk",
      sql`
        (${table.status} = 'paid' AND ${table.paidOn} IS NOT NULL AND ${table.scheduledDate} IS NOT NULL)
        OR (${table.status} = 'unpaid' AND ${table.paidOn} IS NULL)
      `,
    ),
  ],
);

export const paymentNotices = pgTable(
  "payment_notices",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    month: text("month").notNull(),
    assigneeLogin: text("assignee_login").notNull(),
    document: jsonb("document").$type<PaymentNoticeDocument>().notNull(),
    workerDisplayName: text("worker_display_name").notNull(),
    recipientEncryptedPayload: text("recipient_encrypted_payload").notNull(),
    payerEncryptedPayload: text("payer_encrypted_payload").notNull(),
    encryptionKeyVersion: integer("encryption_key_version")
      .notNull()
      .default(1),
    scheduledDate: date("scheduled_date").notNull(),
    approvedBy: text("approved_by").notNull(),
    approvedAt: timestamp("approved_at", { withTimezone: true }).notNull(),
    issuedOn: date("issued_on").notNull(),
    createdBy: text("created_by").notNull(),
    supplementalPaymentId: uuid("supplemental_payment_id").references(
      () => supplementalPayments.id,
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("payment_notices_month_assignee_idx").on(
      table.month,
      table.assigneeLogin,
    ),
    uniqueIndex("payment_notices_supplemental_payment_unique_idx")
      .on(table.supplementalPaymentId)
      .where(sql`${table.supplementalPaymentId} IS NOT NULL`),
    check(
      "payment_notices_month_chk",
      sql`${table.month} ~ '^\\d{4}-(0[1-9]|1[0-2])$'`,
    ),
  ],
);

export const githubProjectStatusSyncs = pgTable(
  "github_project_status_syncs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectItemId: text("project_item_id").notNull(),
    repository: text("repository").notNull(),
    issueNumber: integer("issue_number").notNull(),
    issueTitle: text("issue_title").notNull(),
    assigneeLogin: text("assignee_login").notNull(),
    targetStatus: text("target_status").notNull(),
    status: githubProjectStatusSyncStatus("status")
      .notNull()
      .default("pending"),
    errorMessage: text("error_message"),
    attemptedAt: timestamp("attempted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("github_project_status_syncs_status_idx").on(table.status),
    index("github_project_status_syncs_assignee_idx").on(table.assigneeLogin),
    uniqueIndex("github_project_status_syncs_pending_unique_idx")
      .on(table.projectItemId, table.targetStatus)
      .where(sql`${table.status} = 'pending'`),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorLogin: text("actor_login").notNull(),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    details: jsonb("details")
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("audit_logs_actor_idx").on(table.actorLogin),
    index("audit_logs_action_idx").on(table.action),
    index("audit_logs_created_at_idx").on(table.createdAt),
  ],
);

export const emailNotificationEvents = pgTable(
  "email_notification_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventKey: text("event_key").notNull(),
    type: emailNotificationType("type").notNull(),
    month: text("month").notNull(),
    assigneeLogin: text("assignee_login").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("email_notification_events_event_key_unique_idx").on(
      table.eventKey,
    ),
    index("email_notification_events_month_idx").on(table.month),
    check(
      "email_notification_events_month_chk",
      sql`${table.month} ~ '^\\d{4}-(0[1-9]|1[0-2])$'`,
    ),
  ],
);

export const emailDeliveries = pgTable(
  "email_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => emailNotificationEvents.id, { onDelete: "cascade" }),
    recipientLogin: text("recipient_login").notNull(),
    recipientEmail: text("recipient_email"),
    status: emailDeliveryStatus("status").notNull().default("pending"),
    subject: text("subject").notNull(),
    textBody: text("text_body").notNull(),
    htmlBody: text("html_body").notNull(),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    resendEmailId: text("resend_email_id"),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    errorCode: text("error_code"),
    attemptCount: integer("attempt_count").notNull().default(0),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("email_deliveries_event_recipient_unique_idx").on(
      table.eventId,
      table.recipientLogin,
    ),
    index("email_deliveries_status_idx").on(table.status),
  ],
);

export type WorkSession = typeof workSessions.$inferSelect;
export type WorkLogChangeRequest = typeof workLogChangeRequests.$inferSelect;
export type IssueCompletionReport = typeof issueCompletionReports.$inferSelect;
export type WorkerProfile = typeof workerProfiles.$inferSelect;
export type WorkerPayoutAccount = typeof workerPayoutAccounts.$inferSelect;
export type MonthlySettlementSnapshot =
  typeof monthlySettlementSnapshots.$inferSelect;
export type MonthlyWorkSubmission = typeof monthlyWorkSubmissions.$inferSelect;
export type MonthlyPayment = typeof monthlyPayments.$inferSelect;
export type SupplementalPayment = typeof supplementalPayments.$inferSelect;
export type PaymentNotice = typeof paymentNotices.$inferSelect;
export type GithubProjectStatusSync =
  typeof githubProjectStatusSyncs.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type UserNotificationContact =
  typeof userNotificationContacts.$inferSelect;
export type EmailNotificationEvent =
  typeof emailNotificationEvents.$inferSelect;
export type EmailDelivery = typeof emailDeliveries.$inferSelect;
