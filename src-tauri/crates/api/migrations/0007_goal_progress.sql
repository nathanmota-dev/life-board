CREATE TABLE `goal_progress_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`goal_id` text NOT NULL,
	`day` text NOT NULL,
	`progress` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`goal_id`) REFERENCES `goals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `goal_progress_snapshots_goal_day_unique` ON `goal_progress_snapshots` (`goal_id`,`day`);--> statement-breakpoint
ALTER TABLE `goals` ADD `progress_mode` text DEFAULT 'auto' NOT NULL;--> statement-breakpoint
ALTER TABLE `goals` ADD `linked_habit_ids` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
-- Existing goals keep the progress typed by hand; only new goals start in auto mode.
UPDATE `goals` SET `progress_mode` = 'manual';