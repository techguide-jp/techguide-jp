CREATE TYPE "public"."email_delivery_status" AS ENUM('pending', 'sending', 'accepted', 'skipped', 'failed', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."email_notification_type" AS ENUM('settlement_submitted', 'settlement_approved', 'settlement_paid');--> statement-breakpoint
CREATE TABLE "email_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"recipient_login" text NOT NULL,
	"recipient_email" text,
	"status" "email_delivery_status" DEFAULT 'pending' NOT NULL,
	"subject" text NOT NULL,
	"text_body" text NOT NULL,
	"html_body" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"resend_email_id" text,
	"accepted_at" timestamp with time zone,
	"error_code" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_deliveries_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "email_notification_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_key" text NOT NULL,
	"type" "email_notification_type" NOT NULL,
	"month" text NOT NULL,
	"assignee_login" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_notification_events_month_chk" CHECK ("email_notification_events"."month" ~ '^\d{4}-(0[1-9]|1[0-2])$')
);
--> statement-breakpoint
CREATE TABLE "user_notification_contacts" (
	"github_login" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"source" text DEFAULT 'github' NOT NULL,
	"synced_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_deliveries" ADD CONSTRAINT "email_deliveries_event_id_email_notification_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."email_notification_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "email_deliveries_event_recipient_unique_idx" ON "email_deliveries" USING btree ("event_id","recipient_login");--> statement-breakpoint
CREATE INDEX "email_deliveries_status_idx" ON "email_deliveries" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "email_notification_events_event_key_unique_idx" ON "email_notification_events" USING btree ("event_key");--> statement-breakpoint
CREATE INDEX "email_notification_events_month_idx" ON "email_notification_events" USING btree ("month");