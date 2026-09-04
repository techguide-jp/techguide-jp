CREATE TYPE "public"."completion_report_source" AS ENUM('worker', 'admin_backfill');--> statement-breakpoint
CREATE TYPE "public"."supplemental_payment_status" AS ENUM('unpaid', 'paid');--> statement-breakpoint
ALTER TYPE "public"."email_notification_type" ADD VALUE 'monthly_submission_reminder';--> statement-breakpoint
ALTER TYPE "public"."email_notification_type" ADD VALUE 'supplemental_payment_scheduled';--> statement-breakpoint
ALTER TYPE "public"."email_notification_type" ADD VALUE 'supplemental_payment_paid';--> statement-breakpoint
CREATE TABLE "issue_completion_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_item_id" text NOT NULL,
	"repository" text NOT NULL,
	"issue_number" integer NOT NULL,
	"issue_title" text NOT NULL,
	"issue_url" text NOT NULL,
	"assignee_login" text NOT NULL,
	"settlement_month" text NOT NULL,
	"reported_at" timestamp with time zone NOT NULL,
	"reward_mode" text NOT NULL,
	"fixed_reward_yen" integer NOT NULL,
	"source" "completion_report_source" DEFAULT 'worker' NOT NULL,
	"evidence_url" text,
	"evidence_note" text,
	"invalidated_at" timestamp with time zone,
	"invalidated_by" text,
	"invalidation_reason" text,
	"eligibility_confirmed_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "issue_completion_reports_month_chk" CHECK ("issue_completion_reports"."settlement_month" ~ '^\d{4}-(0[1-9]|1[0-2])$'),
	CONSTRAINT "issue_completion_reports_fixed_reward_chk" CHECK ("issue_completion_reports"."fixed_reward_yen" >= 0),
	CONSTRAINT "issue_completion_reports_reward_mode_chk" CHECK ("issue_completion_reports"."reward_mode" IN ('固定', 'ハイブリッド')),
	CONSTRAINT "issue_completion_reports_reported_month_chk" CHECK (to_char("issue_completion_reports"."reported_at" AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM') = "issue_completion_reports"."settlement_month"),
	CONSTRAINT "issue_completion_reports_reported_before_created_chk" CHECK ("issue_completion_reports"."reported_at" <= "issue_completion_reports"."created_at"),
	CONSTRAINT "issue_completion_reports_backfill_evidence_chk" CHECK ("issue_completion_reports"."source" = 'worker' OR ("issue_completion_reports"."settlement_month" >= '2026-08' AND "issue_completion_reports"."evidence_url" IS NOT NULL AND "issue_completion_reports"."evidence_note" IS NOT NULL)),
	CONSTRAINT "issue_completion_reports_invalidation_chk" CHECK (
        ("issue_completion_reports"."invalidated_at" IS NULL AND "issue_completion_reports"."invalidated_by" IS NULL AND "issue_completion_reports"."invalidation_reason" IS NULL)
        OR ("issue_completion_reports"."invalidated_at" IS NOT NULL AND "issue_completion_reports"."invalidated_by" IS NOT NULL AND "issue_completion_reports"."invalidation_reason" IS NOT NULL)
      ),
	CONSTRAINT "issue_completion_reports_eligibility_chk" CHECK ("issue_completion_reports"."eligibility_confirmed_at" IS NULL OR "issue_completion_reports"."invalidated_at" IS NULL)
);
--> statement-breakpoint
CREATE TABLE "supplemental_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"completion_report_id" uuid NOT NULL,
	"month" text NOT NULL,
	"assignee_login" text NOT NULL,
	"tax_excluded_yen" integer NOT NULL,
	"tax_yen" integer NOT NULL,
	"tax_included_yen" integer NOT NULL,
	"scheduled_date" date,
	"status" "supplemental_payment_status" DEFAULT 'unpaid' NOT NULL,
	"paid_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supplemental_payments_month_chk" CHECK ("supplemental_payments"."month" ~ '^\d{4}-(0[1-9]|1[0-2])$'),
	CONSTRAINT "supplemental_payments_amount_chk" CHECK ("supplemental_payments"."tax_excluded_yen" >= 0 AND "supplemental_payments"."tax_yen" >= 0 AND "supplemental_payments"."tax_included_yen" = "supplemental_payments"."tax_excluded_yen" + "supplemental_payments"."tax_yen"),
	CONSTRAINT "supplemental_payments_paid_chk" CHECK (
        ("supplemental_payments"."status" = 'paid' AND "supplemental_payments"."paid_on" IS NOT NULL AND "supplemental_payments"."scheduled_date" IS NOT NULL)
        OR ("supplemental_payments"."status" = 'unpaid' AND "supplemental_payments"."paid_on" IS NULL)
      )
);
--> statement-breakpoint
ALTER TABLE "payment_notices" ADD COLUMN "supplemental_payment_id" uuid;--> statement-breakpoint
ALTER TABLE "supplemental_payments" ADD CONSTRAINT "supplemental_payments_completion_report_id_issue_completion_reports_id_fk" FOREIGN KEY ("completion_report_id") REFERENCES "public"."issue_completion_reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "issue_completion_reports_month_assignee_idx" ON "issue_completion_reports" USING btree ("settlement_month","assignee_login");--> statement-breakpoint
CREATE INDEX "issue_completion_reports_issue_idx" ON "issue_completion_reports" USING btree ("repository","issue_number");--> statement-breakpoint
CREATE UNIQUE INDEX "issue_completion_reports_active_unique_idx" ON "issue_completion_reports" USING btree ("repository","issue_number","assignee_login") WHERE "issue_completion_reports"."invalidated_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "supplemental_payments_completion_report_unique_idx" ON "supplemental_payments" USING btree ("completion_report_id");--> statement-breakpoint
CREATE INDEX "supplemental_payments_month_assignee_idx" ON "supplemental_payments" USING btree ("month","assignee_login");--> statement-breakpoint
ALTER TABLE "payment_notices" ADD CONSTRAINT "payment_notices_supplemental_payment_id_supplemental_payments_id_fk" FOREIGN KEY ("supplemental_payment_id") REFERENCES "public"."supplemental_payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_notices_supplemental_payment_unique_idx" ON "payment_notices" USING btree ("supplemental_payment_id") WHERE "payment_notices"."supplemental_payment_id" IS NOT NULL;