CREATE TABLE `github_issues` (
	`id` text PRIMARY KEY NOT NULL,
	`number` integer NOT NULL,
	`title` text NOT NULL,
	`state` text NOT NULL,
	`repo_owner` text NOT NULL,
	`repo_name` text NOT NULL,
	`author_login` text NOT NULL,
	`author_avatar_url` text,
	`url` text NOT NULL,
	`kind` text NOT NULL,
	`labels` text NOT NULL,
	`comments` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`synced_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `github_issues_kind_idx` ON `github_issues` (`kind`);--> statement-breakpoint
CREATE INDEX `github_issues_updated_idx` ON `github_issues` (`updated_at`);