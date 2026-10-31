CREATE TABLE `cameras` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_id` text NOT NULL,
	`name` text NOT NULL,
	`aliases` text NOT NULL,
	`fullscreen_by_default` integer NOT NULL,
	`enabled` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cameras_entity_id_unique` ON `cameras` (`entity_id`);