CREATE TABLE `pages` (
	`id` text PRIMARY KEY NOT NULL,
	`parent_id` text,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`storage_path` text,
	`size_bytes` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`parent_id`) REFERENCES `pages`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `pages_kind_check` CHECK (`kind` IN ('folder', 'page') AND (`kind` = 'page') = (`storage_path` IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX `pages_parent_idx` ON `pages` (`parent_id`);
