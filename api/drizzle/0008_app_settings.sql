CREATE TABLE `app_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`uploads_base_dir` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
