CREATE TABLE "payment_notices" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "payment_notices_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"month" text NOT NULL,
	"assignee_login" text NOT NULL,
	"document" jsonb NOT NULL,
	"worker_display_name" text NOT NULL,
	"recipient_encrypted_payload" text NOT NULL,
	"payer_encrypted_payload" text NOT NULL,
	"encryption_key_version" integer DEFAULT 1 NOT NULL,
	"scheduled_date" date NOT NULL,
	"approved_by" text NOT NULL,
	"approved_at" timestamp with time zone NOT NULL,
	"issued_on" date NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_notices_month_chk" CHECK ("payment_notices"."month" ~ '^\d{4}-(0[1-9]|1[0-2])$')
);
--> statement-breakpoint
CREATE INDEX "payment_notices_month_assignee_idx" ON "payment_notices" USING btree ("month","assignee_login");
