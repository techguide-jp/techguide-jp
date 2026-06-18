import {
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const changeRequestType = pgEnum("work_log_change_request_type", [
  "add",
  "edit",
  "exclude"
]);

export const changeRequestStatus = pgEnum("work_log_change_request_status", [
  "pending",
  "approved",
  "rejected"
]);

export const githubProjectStatusSyncStatus = pgEnum("github_project_status_sync_status", [
  "pending",
  "resolved"
]);

export const authSessions = pgTable(
  "auth_sessions",
  {
    id: text("id").primaryKey(),
    githubLogin: text("github_login").notNull(),
    githubName: text("github_name"),
    githubAvatarUrl: text("github_avatar_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull()
  },
  (table) => [index("auth_sessions_github_login_idx").on(table.githubLogin)]
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    excludedAt: timestamp("excluded_at", { withTimezone: true }),
    excludeReason: text("exclude_reason")
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
      sql`${table.endedAt} IS NULL OR ${table.endedAt} > ${table.startedAt}`
    )
  ]
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
    targetSessionId: uuid("target_session_id").references(() => workSessions.id),
    requestedStartedAt: timestamp("requested_started_at", { withTimezone: true }),
    requestedEndedAt: timestamp("requested_ended_at", { withTimezone: true }),
    reason: text("reason").notNull(),
    requestedBy: text("requested_by").notNull(),
    reviewedBy: text("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNote: text("review_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index("work_log_change_requests_status_idx").on(table.status),
    index("work_log_change_requests_assignee_idx").on(table.assigneeLogin),
    index("work_log_change_requests_issue_idx").on(table.repository, table.issueNumber),
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
      `
    )
  ]
);

export const monthlySettlementSnapshots = pgTable(
  "monthly_settlement_snapshots",
  {
    month: text("month").notNull(),
    assigneeLogin: text("assignee_login").notNull(),
    snapshot: jsonb("snapshot").notNull(),
    approvedBy: text("approved_by").notNull(),
    approvedAt: timestamp("approved_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    primaryKey({ columns: [table.month, table.assigneeLogin] }),
    check("monthly_settlement_snapshots_month_chk", sql`${table.month} ~ '^\\d{4}-(0[1-9]|1[0-2])$'`)
  ]
);

export const monthlyWorkSubmissions = pgTable(
  "monthly_work_submissions",
  {
    month: text("month").notNull(),
    assigneeLogin: text("assignee_login").notNull(),
    snapshot: jsonb("snapshot").notNull(),
    submittedBy: text("submitted_by").notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    primaryKey({ columns: [table.month, table.assigneeLogin] }),
    check("monthly_work_submissions_month_chk", sql`${table.month} ~ '^\\d{4}-(0[1-9]|1[0-2])$'`)
  ]
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
    status: githubProjectStatusSyncStatus("status").notNull().default("pending"),
    errorMessage: text("error_message"),
    attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index("github_project_status_syncs_status_idx").on(table.status),
    index("github_project_status_syncs_assignee_idx").on(table.assigneeLogin),
    uniqueIndex("github_project_status_syncs_pending_unique_idx")
      .on(table.projectItemId, table.targetStatus)
      .where(sql`${table.status} = 'pending'`)
  ]
);

export type WorkSession = typeof workSessions.$inferSelect;
export type WorkLogChangeRequest = typeof workLogChangeRequests.$inferSelect;
export type MonthlySettlementSnapshot = typeof monthlySettlementSnapshots.$inferSelect;
export type MonthlyWorkSubmission = typeof monthlyWorkSubmissions.$inferSelect;
export type GithubProjectStatusSync = typeof githubProjectStatusSyncs.$inferSelect;
