CREATE TABLE "monthly_feedback" (
	"month" text NOT NULL,
	"assignee_login" text NOT NULL,
	"operator_comment" text DEFAULT '' NOT NULL,
	"private_reflection" text DEFAULT '' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "monthly_feedback_month_assignee_login_pk" PRIMARY KEY("month","assignee_login"),
	CONSTRAINT "monthly_feedback_month_chk" CHECK ("monthly_feedback"."month" ~ '^\d{4}-(0[1-9]|1[0-2])$'),
	CONSTRAINT "monthly_feedback_length_chk" CHECK (char_length("monthly_feedback"."operator_comment") <= 2000 AND char_length("monthly_feedback"."private_reflection") <= 2000)
);
--> statement-breakpoint
ALTER TABLE "worker_profiles" ADD COLUMN "partner_interest" text;--> statement-breakpoint
ALTER TABLE "worker_profiles" ADD COLUMN "partner_conditions" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "worker_profiles" ADD COLUMN "preferences_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "worker_profiles" ADD COLUMN "preferences_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "worker_profiles" ADD CONSTRAINT "worker_profiles_partner_interest_chk" CHECK ("worker_profiles"."partner_interest" IS NULL OR "worker_profiles"."partner_interest" IN ('interested', 'conditional', 'not_interested'));--> statement-breakpoint
ALTER TABLE "worker_profiles" ADD CONSTRAINT "worker_profiles_partner_conditions_chk" CHECK (char_length("worker_profiles"."partner_conditions") <= 2000 AND ("worker_profiles"."partner_interest" IN ('interested', 'conditional') OR "worker_profiles"."partner_conditions" = ''));