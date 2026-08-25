ALTER TABLE "assets" ADD COLUMN "kind" text DEFAULT 'render' NOT NULL;--> statement-breakpoint
ALTER TABLE "niches" ADD COLUMN "accent_color" text;