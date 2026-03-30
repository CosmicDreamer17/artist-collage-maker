CREATE TABLE `images` (
	`url` text PRIMARY KEY NOT NULL,
	`artist` text NOT NULL,
	`source` text,
	`score` real DEFAULT 0,
	`first_seen` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `quality_signals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`url` text NOT NULL,
	`artist` text NOT NULL,
	`action` text NOT NULL,
	`timestamp` integer NOT NULL
);
