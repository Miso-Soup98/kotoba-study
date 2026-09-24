import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  rebuild,
  mergeCache,
  combineEvents,
  eventBatch,
} from "../lib/study/model.ts";
import { eventSchema } from "../lib/study/validation.ts";
import { vocabulary, studyDay } from "../lib/study/content.ts";
import type { StudyEvent, Entry } from "../lib/study/types.ts";
const at = Date.UTC(2026, 8, 24, 12);
function event(
  kind: StudyEvent["kind"],
  value: unknown,
  seq: number,
  base?: string | null,
): StudyEvent {
  return {
    id: crypto.randomUUID(),
    kind,
    entity: "N4-001",
    value,
    at: at + seq * 1000,
    seq,
    ...(base !== undefined ? { base } : {}),
  };
}
test("complete original corpus and stable word identifiers", () => {
  const entries: Entry[] = JSON.parse(
    readFileSync("public/data/grammar.json", "utf8"),
  ).entries;
  assert.equal(entries.length, 622);
  assert.equal(
    entries.reduce((n, e) => n + e.examples.length, 0),
    1244,
  );
  assert.equal(new Set(entries.map((e) => e.id)).size, 622);
  const words = entries.flatMap(vocabulary);
  assert.equal(new Set(words.map((w) => w.id)).size, words.length);
  assert.ok(
    words.find((w) => w.text === "勉強する" && w.reading === "べんきょうする"),
  );
  assert.ok(words.some((w) => w.meaning.includes("pão")));
});
test("lost HTTP response can be retried without a duplicate review", () => {
  const enroll = event("enroll", true, 1);
  const review = event("review", 3, 2, null);
  const start = {
    events: [enroll],
    pending: [{ ...review, seq: undefined }],
    cursor: 1,
  };
  const once = mergeCache(start, [review], 2);
  const twice = mergeCache(once, [review], 2);
  assert.equal(twice.pending.length, 0);
  assert.equal(twice.events.length, 2);
  assert.equal(rebuild(twice.events).cards["N4-001"].card.reps, 1);
});
test("two offline devices reviewing one revision advance the schedule only once", () => {
  const enroll = event("enroll", true, 1),
    a = event("review", 3, 2, null),
    b = event("review", 4, 3, null);
  const state = rebuild([b, enroll, a]);
  assert.equal(state.cards["N4-001"].revision, a.id);
  assert.equal(state.cards["N4-001"].card.reps, 1);
  assert.equal(state.conflicts, 1);
  const next = event("review", 1, 4, a.id);
  assert.equal(rebuild([enroll, a, b, next]).cards["N4-001"].card.reps, 2);
  assert.deepEqual(
    rebuild([enroll, a, b, next]),
    rebuild([next, b, a, enroll]),
  );
});
test("concurrent notes retain both versions; explicit merged save resolves them", () => {
  const a = event("note", "甲", 1, null),
    b = event("note", "乙", 2, null);
  assert.deepEqual(rebuild([a, b]).notes["N4-001"].conflicts, [
    { id: a.id, text: "甲" },
  ]);
  const c = event("note", "甲＋乙", 3, b.id);
  c.resolves = [a.id];
  assert.deepEqual(rebuild([a, b, c]).notes["N4-001"], {
    text: "甲＋乙",
    revision: c.id,
    conflicts: [],
  });
});
test("successive offline note saves retain unseen conflicts", () => {
  const a = event("note", "甲", 1, null),
    b = event("note", "乙1", 2, null),
    c = event("note", "乙2", 3, b.id);
  assert.deepEqual(rebuild([a, b, c]).notes["N4-001"].conflicts, [
    { id: a.id, text: "甲" },
  ]);
});
test("long Chinese notes split below server byte limit without stranding the queue", () => {
  let queue = Array.from({ length: 30 }, (_, i) =>
    event("note", "字".repeat(12000), i, null),
  );
  let sent = 0;
  while (queue.length) {
    const batch = eventBatch(queue);
    assert.ok(batch.length > 0);
    assert.ok(
      new TextEncoder().encode(
        JSON.stringify({ accountId: "test", events: batch, cursor: 0 }),
      ).length < 300000,
    );
    sent += batch.length;
    queue = queue.slice(batch.length);
  }
  assert.equal(sent, 30);
});
test("bookmark deletion remains a tombstone and unenroll keeps past schedule", () => {
  const a = event("bookmark", true, 1),
    b = event("bookmark", false, 2),
    c = event("enroll", true, 3),
    r = event("review", 3, 4, null),
    d = event("enroll", false, 5);
  const state = rebuild([a, b, c, r, d]);
  assert.equal(state.bookmarks["N4-001"], false);
  assert.equal(state.cards["N4-001"].enrolled, false);
  assert.equal(state.cards["N4-001"].card.reps, 1);
});
test("pagination keeps acknowledged pending events until their canonical rows arrive", () => {
  const pending = event("bookmark", true, 20);
  const c = {
    events: [],
    pending: [{ ...pending, seq: undefined }],
    cursor: 0,
  };
  const first = mergeCache(c, [event("position", "N3-001", 2)], 2);
  assert.equal(first.pending.length, 1);
  const last = mergeCache(first, [pending], 20);
  assert.equal(last.pending.length, 0);
  assert.equal(combineEvents(last.events, last.pending).length, 2);
});
test("backup and API validation reject unknown identity fields and invalid ratings", () => {
  const e = event("review", 3, 1, null);
  const { seq, ...wire } = e;
  assert.ok(eventSchema.safeParse(wire).success);
  assert.equal(
    eventSchema.safeParse({ ...wire, userId: "someone-else" }).success,
    false,
  );
  assert.equal(eventSchema.safeParse({ ...wire, value: 7 }).success, false);
  assert.equal(
    eventSchema.safeParse({ ...wire, base: undefined }).success,
    false,
  );
});
test("learning day is identical across device time zones", () => {
  assert.equal(studyDay(Date.UTC(2026, 8, 24, 15, 1)), "2026-09-25");
});
