import { createEmptyCard, fsrs, type Card, type Grade } from "ts-fsrs";
import type { Cache, StudyEvent } from "./types";
import type { Word } from "./types";
import type { TedLoop } from "../ted/types";
import { parsedLoop, tedWordSchema } from "../ted/validation.ts";
export const ALGORITHM = "fsrs-5.4.2/default-0.9/no-fuzz";
export const scheduler = fsrs({ request_retention: 0.9, enable_fuzz: false });
export type CardState = {
  card: Card;
  revision: string | null;
  enrolled: boolean;
};
export type Model = {
  tedLoops: Record<string, TedLoop | null>;
  tedWords: Record<string, Word>;
  tedProgress: Record<string, number>;
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
    tedLoops: {},
    tedWords: {},
    tedProgress: {},
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
    if (e.kind === "ted_progress")
      result.tedProgress[e.entity] = Number(e.value);
    if (e.kind === "ted_loop") {
      const parsed = parsedLoop(e.value);
      if (e.value === null) result.tedLoops[e.entity] = null;
      else if (parsed.success) result.tedLoops[e.entity] = parsed.data;
    }
    if (e.kind === "ted_word") {
      try {
        const word = tedWordSchema.parse(JSON.parse(String(e.value)));
        result.tedWords[e.entity] = word;
      } catch {}
    }
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
function sameJSONValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (
    a === null ||
    b === null ||
    typeof a !== "object" ||
    typeof b !== "object"
  )
    return false;
  if (Array.isArray(a) || Array.isArray(b))
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((value, i) => sameJSONValue(value, b[i]))
    );
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  const left = a as Record<string, unknown>,
    right = b as Record<string, unknown>;
  return keys.every(
    (key) =>
      Object.prototype.hasOwnProperty.call(right, key) &&
      sameJSONValue(left[key], right[key]),
  );
}
function sameEvent(a: StudyEvent, b: StudyEvent): boolean {
  return (
    a.id === b.id &&
    a.kind === b.kind &&
    a.entity === b.entity &&
    sameJSONValue(a.value, b.value) &&
    a.at === b.at &&
    a.seq === b.seq &&
    a.base === b.base &&
    (a.resolves === b.resolves ||
      (a.resolves !== undefined &&
        b.resolves !== undefined &&
        a.resolves.length === b.resolves.length &&
        a.resolves.every((id, i) => id === b.resolves![i])))
  );
}
export function sameCache(a: Cache, b: Cache): boolean {
  return (
    a === b ||
    (a.cursor === b.cursor &&
      a.events.length === b.events.length &&
      a.pending.length === b.pending.length &&
      a.events.every((event, i) => sameEvent(event, b.events[i])) &&
      a.pending.every((event, i) => sameEvent(event, b.pending[i])))
  );
}
export function mergeCache(
  current: Cache,
  incoming: StudyEvent[],
  cursor: number,
): Cache {
  const nextCursor = Math.max(current.cursor, cursor);
  if (!incoming.length && !current.pending.length)
    return nextCursor === current.cursor
      ? current
      : { ...current, cursor: nextCursor };

  const map = new Map(current.events.map((e) => [e.id, e]));
  let changed = map.size !== current.events.length;
  for (const e of incoming) {
    const old = map.get(e.id);
    if (!old || !sameEvent(old, e)) {
      map.set(e.id, e);
      changed = true;
    }
  }
  const pending = current.pending.some((e) => map.has(e.id))
    ? current.pending.filter((e) => !map.has(e.id))
    : current.pending;
  if (!changed && pending === current.pending && nextCursor === current.cursor)
    return current;
  return {
    events: changed ? [...map.values()] : current.events,
    pending,
    cursor: nextCursor,
  };
}
