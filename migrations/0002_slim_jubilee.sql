CREATE TYPE "public"."github_project_status_sync_status" AS ENUM('pending', 'resolved');--> statement-breakpoint
CREATE TABLE "github_project_status_syncs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_item_id" text NOT NULL,
	"repository" text NOT NULL,
	"issue_number" integer NOT NULL,
	"issue_title" text NOT NULL,
	"assignee_login" text NOT NULL,
	"target_status" text NOT NULL,
	"status" "github_project_status_sync_status" DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "github_project_status_syncs_status_idx" ON "github_project_status_syncs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "github_project_status_syncs_assignee_idx" ON "github_project_status_syncs" USING btree ("assignee_login");--> statement-breakpoint
CREATE UNIQUE INDEX "github_project_status_syncs_pending_unique_idx" ON "github_project_status_syncs" USING btree ("project_item_id","target_status") WHERE "github_project_status_syncs"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "work_log_change_requests_issue_idx" ON "work_log_change_requests" USING btree ("repository","issue_number");--> statement-breakpoint
CREATE INDEX "work_log_change_requests_created_at_idx" ON "work_log_change_requests" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "work_sessions_issue_idx" ON "work_sessions" USING btree ("repository","issue_number");--> statement-breakpoint
CREATE INDEX "work_sessions_started_at_idx" ON "work_sessions" USING btree ("started_at");--> statement-breakpoint
ALTER TABLE "monthly_settlement_snapshots" ADD CONSTRAINT "monthly_settlement_snapshots_month_chk" CHECK ("monthly_settlement_snapshots"."month" ~ '^\d{4}-(0[1-9]|1[0-2])$');--> statement-breakpoint
ALTER TABLE "monthly_work_submissions" ADD CONSTRAINT "monthly_work_submissions_month_chk" CHECK ("monthly_work_submissions"."month" ~ '^\d{4}-(0[1-9]|1[0-2])$');--> statement-breakpoint
ALTER TABLE "work_log_change_requests" ADD CONSTRAINT "work_log_change_requests_shape_chk" CHECK (
        (
          "work_log_change_requests"."request_type" = 'add'
          AND "work_log_change_requests"."target_session_id" IS NULL
          AND "work_log_change_requests"."requested_started_at" IS NOT NULL
          AND "work_log_change_requests"."requested_ended_at" IS NOT NULL
          AND "work_log_change_requests"."requested_ended_at" > "work_log_change_requests"."requested_started_at"
        )
        OR (
          "work_log_change_requests"."request_type" = 'edit'
          AND "work_log_change_requests"."target_session_id" IS NOT NULL
          AND "work_log_change_requests"."requested_started_at" IS NOT NULL
          AND "work_log_change_requests"."requested_ended_at" IS NOT NULL
          AND "work_log_change_requests"."requested_ended_at" > "work_log_change_requests"."requested_started_at"
        )
        OR (
          "work_log_change_requests"."request_type" = 'exclude'
          AND "work_log_change_requests"."target_session_id" IS NOT NULL
          AND "work_log_change_requests"."requested_started_at" IS NULL
          AND "work_log_change_requests"."requested_ended_at" IS NULL
        )
      );--> statement-breakpoint
ALTER TABLE "work_sessions" ADD CONSTRAINT "work_sessions_ended_after_started_chk" CHECK ("work_sessions"."ended_at" IS NULL OR "work_sessions"."ended_at" > "work_sessions"."started_at");