DROP INDEX "assets_path_idx";--> statement-breakpoint
ALTER TABLE "claims" ADD COLUMN "slide_id" uuid;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "ig_creation_id" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "publish_deferrals" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "publish_lease_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_slide_id_slides_id_fk" FOREIGN KEY ("slide_id") REFERENCES "public"."slides"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "assets_org_path_idx" ON "assets" USING btree ("org_id","path");--> statement-breakpoint
CREATE INDEX "assets_org_kind_created_idx" ON "assets" USING btree ("org_id","kind","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "claims_slide_idx" ON "claims" USING btree ("slide_id");--> statement-breakpoint
CREATE INDEX "posts_org_updated_idx" ON "posts" USING btree ("org_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "posts_org_status_updated_idx" ON "posts" USING btree ("org_id","status","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "posts_ig_account_idx" ON "posts" USING btree ("ig_account_id");--> statement-breakpoint
CREATE INDEX "slides_asset_idx" ON "slides" USING btree ("asset_id");--> statement-breakpoint
-- Backfill claim → slide attribution.
--
-- Hand-written, not generated. Without it every claim written before this
-- migration keeps a null `slide_id`, and the evidence trail — the thing this
-- product exists to defend — would silently start over at "unattributed" for
-- all existing posts while looking perfectly healthy.
--
-- Safe to run twice: it only fills rows that are still null.
UPDATE "claims" c
SET "slide_id" = s."id"
FROM "slides" s
WHERE s."post_id" = c."post_id"
  AND s."index" = c."slide_index"
  AND c."slide_index" IS NOT NULL
  AND c."slide_id" IS NULL;--> statement-breakpoint
-- Retire the `approved` limbo state.
--
-- Also hand-written. `approvePost` has written `scheduled` for a while, but
-- rows predating that carry `approved` with no scheduled time, and the worker
-- carried a permanent rescue clause for them. That clause selected rows `claim`
-- would then refuse — it only ever transitioned from `scheduled` — so each one
-- was picked up every 30 seconds, refused, and logged "already being published"
-- forever, without publishing and without erroring.
--
-- Rewriting them once is what the clause was trying to say: a person signed
-- these off, so they are due now.
UPDATE "posts"
SET "status" = 'scheduled',
    "scheduled_at" = COALESCE("scheduled_at", "approved_at", now())
WHERE "status" = 'approved';