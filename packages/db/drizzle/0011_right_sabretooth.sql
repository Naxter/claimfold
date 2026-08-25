CREATE INDEX "assets_kind_created_idx" ON "assets" USING btree ("kind","created_at");--> statement-breakpoint
CREATE INDEX "jobs_org_kind_created_idx" ON "jobs" USING btree ("org_id","kind","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "jobs_status_finished_idx" ON "jobs" USING btree ("status","finished_at");--> statement-breakpoint
CREATE INDEX "niches_org_account_idx" ON "niches" USING btree ("org_id","ig_account_id");--> statement-breakpoint
CREATE INDEX "posts_org_status_created_idx" ON "posts" USING btree ("org_id","status","created_at" DESC NULLS LAST);