CREATE TABLE "worker_payout_accounts" (
	"login" text PRIMARY KEY NOT NULL,
	"encrypted_payload" text NOT NULL,
	"encryption_key_version" integer DEFAULT 1 NOT NULL,
	"updated_by" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "worker_payout_accounts" ADD CONSTRAINT "worker_payout_accounts_login_worker_profiles_login_fk" FOREIGN KEY ("login") REFERENCES "public"."worker_profiles"("login") ON DELETE cascade ON UPDATE no action;