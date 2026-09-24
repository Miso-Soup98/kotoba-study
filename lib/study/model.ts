import { createEmptyCard, fsrs, type Card, type Grade } from "ts-fsrs";
import type { StudyEvent } from "./types";
export const ALGORITHM = "fsrs-5.4.2/default-0.9/no-fuzz";
export const scheduler = fsrs({ request_retention: 0.9, enable_fuzz: false });
export type CardState = {
  card: Card;
  revision: string | null;
  enrolled: boolean;
};
export type Model = {
  cards: Record<string, CardState>;
  bookmarks: Record<string, boolean>;
  notes: Record<
    string,
    {
      text: string;
      revision: string;
      conflicts: { id: string; text: string }[];
    }
  >;
  tasks: Record<string, boolean>;
  settings: Record<string, unknown>;
  position: string;
  reviews: StudyEvent[];
  conflicts: number;
};
export function rebuild(events: StudyEvent[]): Model {
  const result: Model = {
    cards: {},
    bookmarks: {},
    notes: {},
    tasks: {},
    settings: {},
    position: "N4-001",
    reviews: [],
    conflicts: 0,
  };
  // Confirmed events use the database sequence; pending events retain device insertion order.
  const ordered = events
    .map((e, i) => ({ e, i }))
    .sort(
      (a, b) =>
        (a.e.seq ?? Number.MAX_SAFE_INTEGER) -
          (b.e.seq ?? Number.MAX_SAFE_INTEGER) || a.i - b.i,
    );
  for (const { e } of ordered) {
    if (e.kind === "enroll") {
      const old = result.cards[e.entity];
      result.cards[e.entity] = {
        card: old?.card ?? createEmptyCard(new Date(e.at)),
        revision: old?.revision ?? null,
        enrolled: !!e.value,
      };
    }
    if (e.kind === "bookmark") result.bookmarks[e.entity] = !!e.value;
    if (e.kind === "position") result.position = String(e.value);
    if (e.kind === "setting") result.settings[e.entity] = e.value;
    if (e.kind === "task") result.tasks[e.entity] = !!e.value;
    if (e.kind === "note") {
      const old = result.notes[e.entity];
      const conflict = old && e.base !== old.revision && old.text !== e.value;
      result.notes[e.entity] = {
        text: String(e.value),
        revision: e.id,
        conflicts: [
          ...(old?.conflicts ?? []),
          ...(conflict ? [{ id: old.revision, text: old.text }] : []),
        ].filter((c) => !e.resolves?.includes(c.id)),
      };
    }
    if (e.kind === "review") {
      const state = result.cards[e.entity];
      if (!state || e.base !== state.revision) {
        result.conflicts++;
        continue;
      }
      const time = Math.max(e.at, state.card.last_review?.getTime() ?? 0);
      state.card = scheduler.next(
        state.card,
        new Date(time),
        e.value as Grade,
      ).card;
      state.revision = e.id;
      result.reviews.push(e);
    }
  }
  return result;
}
export function eventBatch(events: StudyEvent[]): StudyEvent[] {
  const batch: StudyEvent[] = [];
  let bytes = 2000;
  const encoder = new TextEncoder();
  for (const e of events) {
    const size = encoder.encode(JSON.stringify(e)).length + 1;
    if (batch.length >= 100 || bytes + size > 240000) break;
    batch.push(e);
    bytes += size;
  }
  return batch;
}
export function combineEvents(confirmed: StudyEvent[], pending: StudyEvent[]) {
  const ids = new Set(confirmed.map((e) => e.id));
  return [...confirmed]
    .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
    .concat(pending.filter((e) => !ids.has(e.id)));
}
export function mergeCache(
  current: import("./types").Cache,
  incoming: StudyEvent[],
  cursor: number,
): import("./types").Cache {
  const map = new Map(current.events.map((e) => [e.id, e]));
  incoming.forEach((e) => map.set(e.id, e));
  return {
    events: [...map.values()],
    pending: current.pending.filter((e) => !map.has(e.id)),
    cursor: Math.max(current.cursor, cursor),
  };
}
