CREATE TABLE `calendar_events` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`start_at` integer NOT NULL,
	`end_at` integer NOT NULL,
	`all_day` integer DEFAULT false NOT NULL,
	`location` text,
	`color` text DEFAULT '#3b82f6' NOT NULL,
	`linked_task_ids` text NOT NULL,
	`linked_thought_ids` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `calendar_events_start_idx` ON `calendar_events` (`start_at`);--> statement-breakpoint
CREATE TABLE `file_boards` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`kind` text DEFAULT 'other' NOT NULL,
	`cover_item_id` text,
	`color` text DEFAULT '#06b6d4' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE TABLE `file_items` (
	`id` text PRIMARY KEY NOT NULL,
	`board_id` text NOT NULL,
	`kind` text DEFAULT 'image' NOT NULL,
	`title` text,
	`notes` text,
	`mime` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`storage_path` text NOT NULL,
	`taken_at` integer,
	`amount_cents` integer,
	`currency` text,
	`tags` text NOT NULL,
	`linked_task_ids` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`board_id`) REFERENCES `file_boards`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `file_items_board_idx` ON `file_items` (`board_id`);--> statement-breakpoint
CREATE TABLE `github_prs` (
	`id` text PRIMARY KEY NOT NULL,
	`number` integer NOT NULL,
	`title` text NOT NULL,
	`state` text NOT NULL,
	`draft` integer DEFAULT false NOT NULL,
	`repo_owner` text NOT NULL,
	`repo_name` text NOT NULL,
	`author_login` text NOT NULL,
	`author_avatar_url` text,
	`url` text NOT NULL,
	`base_branch` text,
	`head_branch` text,
	`kind` text NOT NULL,
	`triggered_by_login` text,
	`additions` integer DEFAULT 0 NOT NULL,
	`deletions` integer DEFAULT 0 NOT NULL,
	`changed_files` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`synced_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `github_prs_kind_idx` ON `github_prs` (`kind`);--> statement-breakpoint
CREATE INDEX `github_prs_updated_idx` ON `github_prs` (`updated_at`);--> statement-breakpoint
CREATE TABLE `github_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`token_ciphertext` text NOT NULL,
	`token_iv` text NOT NULL,
	`token_tag` text NOT NULL,
	`login` text NOT NULL,
	`org_filter` text,
	`last_sync_at` integer,
	`last_sync_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `goal_milestones` (
	`id` text PRIMARY KEY NOT NULL,
	`goal_id` text NOT NULL,
	`title` text NOT NULL,
	`due_at` integer,
	`completed_at` integer,
	`order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`goal_id`) REFERENCES `goals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `goal_milestones_goal_idx` ON `goal_milestones` (`goal_id`);--> statement-breakpoint
CREATE TABLE `goals` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`why` text,
	`domain` text DEFAULT 'personal' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`start_at` integer,
	`target_at` integer,
	`completed_at` integer,
	`color` text DEFAULT '#a855f7' NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`linked_task_ids` text NOT NULL,
	`linked_thought_ids` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE TABLE `habit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`habit_id` text NOT NULL,
	`day` text NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`habit_id`) REFERENCES `habits`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `habit_logs_habit_day_unique` ON `habit_logs` (`habit_id`,`day`);--> statement-breakpoint
CREATE TABLE `habits` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`unit` text DEFAULT 'times' NOT NULL,
	`target` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE TABLE `mood_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`day` text NOT NULL,
	`score` integer NOT NULL,
	`note` text,
	`linked_task_ids` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mood_entries_day_unique` ON `mood_entries` (`day`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'inbox' NOT NULL,
	`priority` text DEFAULT 'none' NOT NULL,
	`due_at` integer,
	`completed_at` integer,
	`parent_task_id` text,
	`tags` text NOT NULL,
	`linked_thought_ids` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `tasks_status_idx` ON `tasks` (`status`);--> statement-breakpoint
CREATE INDEX `tasks_completed_idx` ON `tasks` (`completed_at`);--> statement-breakpoint
CREATE TABLE `thoughts` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text,
	`body` text DEFAULT '' NOT NULL,
	`tags` text NOT NULL,
	`pinned` integer DEFAULT false NOT NULL,
	`linked_task_ids` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `thoughts_created_idx` ON `thoughts` (`created_at`);