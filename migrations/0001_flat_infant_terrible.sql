CREATE TABLE "monthly_work_submissions" (
	"month" text NOT NULL,
	"assignee_login" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"submitted_by" text NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "monthly_work_submissions_month_assignee_login_pk" PRIMARY KEY("month","assignee_login")
);
