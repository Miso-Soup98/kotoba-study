import {
  sqliteTable,
  integer,
  text,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";

export const studyEvents = sqliteTable(
  "study_events",
  {
    sequence: integer("sequence").primaryKey({ autoIncrement: true }),
    userId: text("user_id").notNull(),
    eventId: text("event_id").notNull(),
    payload: text("payload").notNull(),
    receivedAt: integer("received_at").notNull(),
  },
  (t) => [
    uniqueIndex("event_owner_id").on(t.userId, t.eventId),
    index("event_owner_sequence").on(t.userId, t.sequence),
  ],
);
