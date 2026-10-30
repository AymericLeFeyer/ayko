CREATE TABLE `memories` (
	`id` text PRIMARY KEY NOT NULL,
	`content` text NOT NULL,
	`room_id` text,
	`source` text NOT NULL,
	`pinned` integer NOT NULL,
	`alias_key` text,
	`embedding` text,
	`use_count` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`last_used_at` text,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `memories_alias_idx` ON `memories` (`alias_key`);--> statement-breakpoint
ALTER TABLE `mcp_tools` ADD `context_source` integer;