ALTER TABLE `habit_logs` ADD `target` integer;--> statement-breakpoint
ALTER TABLE `habits` ADD `step` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `habits` ADD `emoji` text DEFAULT '🌱' NOT NULL;
--> statement-breakpoint
UPDATE `habit_logs` SET `target` = (SELECT `target` FROM `habits` WHERE `habits`.`id` = `habit_logs`.`habit_id`);
