CREATE TYPE "public"."monthly_payment_status" AS ENUM('unpaid', 'paid');--> statement-breakpoint
CREATE TABLE "monthly_payments" (
	"month" text NOT NULL,
	"assignee_login" text NOT NULL,
	"status" "monthly_payment_status" DEFAULT 'unpaid' NOT NULL,
	"scheduled_date" date,
	"paid_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "monthly_payments_month_assignee_login_pk" PRIMARY KEY("month","assignee_login"),
	CONSTRAINT "monthly_payments_month_chk" CHECK ("monthly_payments"."month" ~ '^\d{4}-(0[1-9]|1[0-2])$'),
	CONSTRAINT "monthly_payments_paid_chk" CHECK (
        ("monthly_payments"."status" = 'paid' AND "monthly_payments"."paid_on" IS NOT NULL)
        OR ("monthly_payments"."status" = 'unpaid' AND "monthly_payments"."paid_on" IS NULL)
      )
);