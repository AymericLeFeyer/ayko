CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`device_name` text NOT NULL,
	`room_name` text,
	`traces` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `reports_created_idx` ON `reports` (`created_at`);