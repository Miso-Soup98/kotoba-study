CREATE TABLE `ted_articles` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`collection` text NOT NULL,
	`number` integer NOT NULL,
	`pages` integer NOT NULL,
	`paragraph_count` integer NOT NULL,
	`duration` integer NOT NULL,
	`content_key` text NOT NULL,
	`audio_key` text,
	`pdf_key` text,
	`warnings` text DEFAULT '[]' NOT NULL
);
