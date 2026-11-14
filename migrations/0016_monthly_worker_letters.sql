ALTER TYPE "public"."email_notification_type" ADD VALUE 'monthly_letter_missing';--> statement-breakpoint
CREATE TABLE "monthly_worker_letters" (
	"send_month" text PRIMARY KEY NOT NULL,
	"body" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "monthly_worker_letters_send_month_chk" CHECK ("monthly_worker_letters"."send_month" ~ '^\d{4}-(0[1-9]|1[0-2])$'),
	CONSTRAINT "monthly_worker_letters_body_length_chk" CHECK (char_length("monthly_worker_letters"."body") <= 4000)
);
