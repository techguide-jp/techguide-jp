CREATE TABLE "monthly_worker_letter_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"required_subject" text NOT NULL,
	"standard_subject" text NOT NULL,
	"default_body" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "monthly_worker_letter_settings_singleton_chk" CHECK ("monthly_worker_letter_settings"."id" = 1)
);
--> statement-breakpoint
INSERT INTO "monthly_worker_letter_settings" ("required_subject", "standard_subject", "default_body") VALUES (
	'【TechGuide】{対象月}分のお手紙と月次確定申請のご案内',
	'【TechGuide】{対象月}分のお手紙とアンケート',
	'{対象月}も、TechGuideの業務にお力添えいただき、ありがとうございました。今後の稼働や取り組みたい仕事について、現在のご希望をお聞かせいただけると幸いです。'
);
