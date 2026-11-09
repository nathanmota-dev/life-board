CREATE TABLE `project_status_changes` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`status` text NOT NULL,
	`pause_reason` text,
	`changed_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `project_status_changes_project_idx` ON `project_status_changes` (`project_id`);--> statement-breakpoint
ALTER TABLE `projects` ADD `status_changed_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `pause_reason` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `archived_at` integer;--> statement-breakpoint
CREATE INDEX `projects_status_idx` ON `projects` (`status`,`order`);--> statement-breakpoint
UPDATE `projects` SET `status_changed_at` = `updated_at`;
--> statement-breakpoint
INSERT INTO `project_status_changes` (`id`, `project_id`, `status`, `changed_at`) SELECT 'initial-' || `id`, `id`, `status`, `updated_at` FROM `projects`;
--> statement-breakpoint
UPDATE `projects` SET `order` = (
	SELECT COUNT(*) FROM `projects` AS `other`
	WHERE `other`.`status` = `projects`.`status` AND `other`.`deleted_at` IS NULL AND (
		`other`.`order` < `projects`.`order`
		OR (`other`.`order` = `projects`.`order` AND (`other`.`created_at` < `projects`.`created_at` OR (`other`.`created_at` = `projects`.`created_at` AND `other`.`id` < `projects`.`id`)))
	)
) WHERE `deleted_at` IS NULL;
