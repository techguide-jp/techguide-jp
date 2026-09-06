CREATE TABLE "issue_hourly_rates" (
	"repository" text NOT NULL,
	"issue_number" integer NOT NULL,
	"assignee_login" text NOT NULL,
	"hourly_rate_yen" integer,
	"first_month" text NOT NULL,
	"frozen_at" timestamp with time zone NOT NULL,
	"frozen_by" text NOT NULL,
	"source" text NOT NULL,
	CONSTRAINT "issue_hourly_rates_repository_issue_number_assignee_login_pk" PRIMARY KEY("repository","issue_number","assignee_login"),
	CONSTRAINT "issue_hourly_rates_number_chk" CHECK ("issue_hourly_rates"."issue_number" > 0),
	CONSTRAINT "issue_hourly_rates_amount_chk" CHECK ("issue_hourly_rates"."hourly_rate_yen" IS NULL OR "issue_hourly_rates"."hourly_rate_yen" >= 0),
	CONSTRAINT "issue_hourly_rates_month_chk" CHECK ("issue_hourly_rates"."first_month" ~ '^\d{4}-(0[1-9]|1[0-2])$'),
	CONSTRAINT "issue_hourly_rates_source_chk" CHECK ("issue_hourly_rates"."source" IN ('submission', 'legacy_snapshot'))
);
