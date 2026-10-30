CREATE TABLE `api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`prefix` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`last_used_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_keys_token_hash_unique` ON `api_keys` (`token_hash`);--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`ts` text NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`target` text,
	`details` text
);
--> statement-breakpoint
CREATE INDEX `audit_ts_idx` ON `audit_log` (`ts`);--> statement-breakpoint
CREATE TABLE `cache_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text,
	`title` text NOT NULL,
	`source` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `devices` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`room_id` text,
	`token_hash` text NOT NULL,
	`last_seen_at` text,
	`ui_version` text,
	`revoked` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `devices_token_hash_unique` ON `devices` (`token_hash`);--> statement-breakpoint
CREATE TABLE `logs` (
	`id` text PRIMARY KEY NOT NULL,
	`ts` text NOT NULL,
	`level` text NOT NULL,
	`component` text NOT NULL,
	`message` text NOT NULL,
	`room_id` text,
	`request_id` text,
	`data` text
);
--> statement-breakpoint
CREATE INDEX `logs_ts_idx` ON `logs` (`ts`);--> statement-breakpoint
CREATE TABLE `mcp_request_history` (
	`id` text PRIMARY KEY NOT NULL,
	`group_key` text NOT NULL,
	`raw_text` text NOT NULL,
	`normalized_text` text NOT NULL,
	`room_id` text,
	`device_id` text,
	`calls` text NOT NULL,
	`occurrences` integer NOT NULL,
	`total_duration_ms` real NOT NULL,
	`first_seen_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`cache_entry_id` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mcp_request_history_group_key_unique` ON `mcp_request_history` (`group_key`);--> statement-breakpoint
CREATE INDEX `history_last_seen_idx` ON `mcp_request_history` (`last_seen_at`);--> statement-breakpoint
CREATE TABLE `mcp_servers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`transport` text NOT NULL,
	`command` text,
	`args` text NOT NULL,
	`url` text,
	`env_secret_id` text,
	`headers_secret_id` text,
	`env_names` text NOT NULL,
	`header_names` text NOT NULL,
	`enabled` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `mcp_tools` (
	`id` text PRIMARY KEY NOT NULL,
	`server_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`input_schema` text NOT NULL,
	`schema_hash` text NOT NULL,
	`read_only` integer NOT NULL,
	`alias_name` text,
	`custom_description` text,
	`enabled` integer NOT NULL,
	`policy` text NOT NULL,
	`cache_enabled` integer NOT NULL,
	`cache_ttl_seconds` integer,
	FOREIGN KEY (`server_id`) REFERENCES `mcp_servers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `mcp_tools_server_idx` ON `mcp_tools` (`server_id`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`request_id` text,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `messages_conversation_idx` ON `messages` (`conversation_id`);--> statement-breakpoint
CREATE TABLE `model_roles` (
	`role` text PRIMARY KEY NOT NULL,
	`model` text,
	`params` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ollama_endpoints` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`enabled` integer NOT NULL,
	`priority` integer NOT NULL,
	`connect_timeout_ms` integer NOT NULL,
	`headers_secret_id` text,
	`header_names` text NOT NULL,
	`last_status` text NOT NULL,
	`last_latency_ms` real,
	`last_checked_at` text,
	`version` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `pairing_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`device_name` text,
	`device_id` text,
	`device_token_cipher` text,
	`status` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `persona_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`persona_id` text NOT NULL,
	`version` integer NOT NULL,
	`snapshot` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`persona_id`) REFERENCES `personas`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `personas` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`system_prompt` text NOT NULL,
	`language` text NOT NULL,
	`response_length` text NOT NULL,
	`address` text NOT NULL,
	`is_default` integer NOT NULL,
	`version` integer NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `request_cache_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`cache_key` text NOT NULL,
	`normalized_text` text NOT NULL,
	`sample_text` text NOT NULL,
	`room_id` text,
	`global` integer NOT NULL,
	`kind` text NOT NULL,
	`calls` text NOT NULL,
	`response` text NOT NULL,
	`aliases` text NOT NULL,
	`alias_keys` text NOT NULL,
	`status` text NOT NULL,
	`hits` integer NOT NULL,
	`failures` integer NOT NULL,
	`occurrences` integer NOT NULL,
	`ttl_seconds` integer,
	`last_result` text,
	`last_result_at` text,
	`llm_duration_ms` real,
	`embedding` text,
	`created_at` text NOT NULL,
	`last_hit_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `request_cache_entries_cache_key_unique` ON `request_cache_entries` (`cache_key`);--> statement-breakpoint
CREATE INDEX `cache_room_idx` ON `request_cache_entries` (`room_id`);--> statement-breakpoint
CREATE TABLE `requests` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text,
	`room_id` text,
	`device_id` text,
	`text` text NOT NULL,
	`status` text NOT NULL,
	`model` text,
	`persona_name` text,
	`prompt` text,
	`reasoning` text,
	`answer` text,
	`error` text,
	`cache_outcome` text NOT NULL,
	`cache_entry_id` text,
	`cache_match_type` text,
	`cache_duration_ms` real,
	`ttft_ms` real,
	`tokens_per_second` real,
	`output_tokens` integer,
	`duration_ms` real,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `requests_created_idx` ON `requests` (`created_at`);--> statement-breakpoint
CREATE TABLE `rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`icon` text NOT NULL,
	`config` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rooms_slug_unique` ON `rooms` (`slug`);--> statement-breakpoint
CREATE TABLE `secrets` (
	`id` text PRIMARY KEY NOT NULL,
	`ciphertext` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions_auth` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_auth_token_hash_unique` ON `sessions_auth` (`token_hash`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tool_calls` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text,
	`room_id` text,
	`server_id` text,
	`server_name` text NOT NULL,
	`tool_name` text NOT NULL,
	`arguments` text,
	`result` text,
	`is_error` integer NOT NULL,
	`duration_ms` real NOT NULL,
	`source` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `tool_calls_request_idx` ON `tool_calls` (`request_id`);--> statement-breakpoint
CREATE INDEX `tool_calls_created_idx` ON `tool_calls` (`created_at`);--> statement-breakpoint
CREATE TABLE `tool_policy_overrides` (
	`tool_id` text NOT NULL,
	`room_id` text NOT NULL,
	`policy` text NOT NULL,
	PRIMARY KEY(`tool_id`, `room_id`),
	FOREIGN KEY (`tool_id`) REFERENCES `mcp_tools`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `trace_steps` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`kind` text NOT NULL,
	`label` text NOT NULL,
	`status` text NOT NULL,
	`detail` text,
	`started_at` text NOT NULL,
	`duration_ms` real,
	FOREIGN KEY (`request_id`) REFERENCES `requests`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `trace_steps_request_idx` ON `trace_steps` (`request_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE TABLE `voice_providers` (
	`id` text PRIMARY KEY NOT NULL,
	`slot` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`active` integer NOT NULL,
	`config` text NOT NULL,
	`updated_at` text NOT NULL
);
