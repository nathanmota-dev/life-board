ALTER TABLE `calendar_events` ADD `source` text DEFAULT 'local' NOT NULL;--> statement-breakpoint
ALTER TABLE `calendar_events` ADD `external_id` text;--> statement-breakpoint
ALTER TABLE `calendar_events` ADD `external_calendar_id` text;--> statement-breakpoint
ALTER TABLE `calendar_events` ADD `external_etag` text;--> statement-breakpoint
ALTER TABLE `calendar_events` ADD `external_updated_at` integer;--> statement-breakpoint
ALTER TABLE `calendar_events` ADD `external_url` text;--> statement-breakpoint
ALTER TABLE `calendar_events` ADD `recurring_event_id` text;--> statement-breakpoint
ALTER TABLE `calendar_events` ADD `sync_state` text;--> statement-breakpoint
CREATE UNIQUE INDEX `calendar_events_external_idx` ON `calendar_events` (`external_calendar_id`,`external_id`) WHERE `external_id` IS NOT NULL;--> statement-breakpoint
CREATE INDEX `calendar_events_sync_state_idx` ON `calendar_events` (`sync_state`) WHERE `sync_state` IS NOT NULL;
