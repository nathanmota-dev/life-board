CREATE TABLE `google_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text,
	`client_id_ciphertext` text NOT NULL,
	`client_id_iv` text NOT NULL,
	`client_id_tag` text NOT NULL,
	`client_secret_ciphertext` text NOT NULL,
	`client_secret_iv` text NOT NULL,
	`client_secret_tag` text NOT NULL,
	`refresh_token_ciphertext` text,
	`refresh_token_iv` text,
	`refresh_token_tag` text,
	`calendar_id` text DEFAULT 'primary' NOT NULL,
	`last_sync_at` integer,
	`last_sync_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
