CREATE TABLE `study_events` (
	`sequence` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`event_id` text NOT NULL,
	`payload` text NOT NULL,
	`received_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `event_owner_id` ON `study_events` (`user_id`,`event_id`);--> statement-breakpoint
CREATE INDEX `event_owner_sequence` ON `study_events` (`user_id`,`sequence`);