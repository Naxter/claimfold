ALTER TABLE "niches" ADD COLUMN "watermark" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "slides" ADD COLUMN "template_id" text;--> statement-breakpoint
ALTER TABLE "slides" ADD COLUMN "edited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "slides" ADD COLUMN "edited_by" text;--> statement-breakpoint
ALTER TABLE "slides" ADD CONSTRAINT "slides_edited_by_user_id_fk" FOREIGN KEY ("edited_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;