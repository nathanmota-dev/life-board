ALTER TABLE `tasks` ADD `focus_day` text;--> statement-breakpoint
CREATE INDEX `tasks_focus_day_idx` ON `tasks` (`focus_day`);