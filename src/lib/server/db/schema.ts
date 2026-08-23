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

export const emailNotificationType = pgEnum("email_notification_type", [
  "settlement_submitted",
  "settlement_approved",
  "settlement_paid",
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

export const monthlyPayments = pgTable(
  "monthly_payments",
  {
    month: text("month").notNull(),
    assigneeLogin: text("assignee_login").notNull(),
    status: monthlyPaymentStatus("status").notNull().default("unpaid"),
    scheduledDate: date("scheduled_date"),
    paidOn: date("paid_on"),
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("payment_notices_month_assignee_idx").on(
      table.month,
      table.assigneeLogin,
    ),
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
export type WorkerProfile = typeof workerProfiles.$inferSelect;
export type WorkerPayoutAccount = typeof workerPayoutAccounts.$inferSelect;
export type MonthlySettlementSnapshot =
  typeof monthlySettlementSnapshots.$inferSelect;
export type MonthlyWorkSubmission = typeof monthlyWorkSubmissions.$inferSelect;
export type MonthlyPayment = typeof monthlyPayments.$inferSelect;
export type PaymentNotice = typeof paymentNotices.$inferSelect;
export type GithubProjectStatusSync =
  typeof githubProjectStatusSyncs.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type UserNotificationContact =
  typeof userNotificationContacts.$inferSelect;
export type EmailNotificationEvent =
  typeof emailNotificationEvents.$inferSelect;
export type EmailDelivery = typeof emailDeliveries.$inferSelect;
