CREATE TABLE "topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"niche_id" uuid NOT NULL,
	"title" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"article_url" text,
	"signals" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"breakdown" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"score" real DEFAULT 0 NOT NULL,
	"accepted" boolean DEFAULT false NOT NULL,
	"rejection_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rejection_detail" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"used_at" timestamp with time zone,
	"dismissed_at" timestamp with time zone,
	"discovered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_niche_id_niches_id_fk" FOREIGN KEY ("niche_id") REFERENCES "public"."niches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "topics_niche_key_idx" ON "topics" USING btree ("niche_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "topics_org_idx" ON "topics" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "topics_rank_idx" ON "topics" USING btree ("niche_id","accepted","score");