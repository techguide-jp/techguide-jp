CREATE TABLE "worker_profiles" (
	"login" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"specialty_note" text DEFAULT '' NOT NULL,
	"availability_note" text DEFAULT '' NOT NULL,
	"self_assignment_note" text DEFAULT '' NOT NULL,
	"admin_note" text DEFAULT '' NOT NULL,
	"admin_note_updated_by" text,
	"admin_note_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "worker_profiles_skills_array_chk" CHECK (jsonb_typeof("worker_profiles"."skills") = 'array')
);
--> statement-breakpoint
CREATE INDEX "worker_profiles_display_name_idx" ON "worker_profiles" USING btree ("display_name");