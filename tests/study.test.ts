import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  rebuild,
  mergeCache,
  combineEvents,
  eventBatch,
  sameCache,
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
  assert.equal(twice, once);
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

test("repeated learning-day calculations reuse the formatter across midnight", (t) => {
  const constructor = t.mock.method(Intl, "DateTimeFormat", () => {
    throw Error("Unexpected repeated formatter allocation");
  });
  assert.equal(studyDay(Date.UTC(2026, 8, 24, 14, 59, 59)), "2026-09-24");
  assert.equal(studyDay(new Date("2026-09-24T15:00:00Z")), "2026-09-25");
  assert.equal(studyDay(Date.UTC(2026, 11, 31, 15)), "2027-01-01");
  assert.equal(constructor.mock.callCount(), 0);
});

test("idle sync and equivalent canonical rows preserve the complete cache reference", () => {
  const note = {
    ...event("note", "笔记", 2, null),
    resolves: [crypto.randomUUID()],
  };
  const current = { events: [note], pending: [], cursor: 2 };
  assert.equal(mergeCache(current, [], 2), current);
  assert.equal(mergeCache(current, [], 1), current);
  assert.equal(mergeCache(current, [structuredClone(note)], 2), current);
  const advanced = mergeCache(current, [], 3);
  assert.notEqual(advanced, current);
  assert.equal(advanced.cursor, 3);
  assert.equal(advanced.events, current.events);
  assert.equal(advanced.pending, current.pending);
});

test("canonical event changes replace local rows even when id and cursor match", () => {
  const note = {
    ...event("note", "本机笔记", 2, null),
    resolves: [crypto.randomUUID()],
  };
  const current = { events: [note], pending: [], cursor: 2 };
  const changes: Partial<StudyEvent>[] = [
    { value: "云端笔记" },
    { kind: "position" },
    { entity: "N4-002" },
    { at: note.at + 1 },
    { seq: 3 },
    { base: crypto.randomUUID() },
    { resolves: [crypto.randomUUID()] },
    { resolves: undefined },
  ];
  for (const change of changes) {
    const canonical = { ...note, ...change };
    const merged = mergeCache(current, [canonical], 2);
    assert.notEqual(merged, current);
    assert.equal(merged.events[0], canonical);
    assert.equal(merged.cursor, 2);
    assert.equal(current.events[0], note);
  }
});

test("an empty response still removes pending rows already confirmed locally", () => {
  const canonical = event("bookmark", true, 2);
  const unsent = { ...event("position", "N3-001", 3), seq: undefined };
  const current = {
    events: [canonical],
    pending: [{ ...canonical, seq: undefined }, unsent],
    cursor: 2,
  };
  const merged = mergeCache(current, [], 2);
  assert.notEqual(merged, current);
  assert.equal(merged.events, current.events);
  assert.deepEqual(merged.pending, [unsent]);
  assert.equal(current.pending.length, 2);
  assert.equal(mergeCache(merged, [], 2), merged);
});

test("equivalent IndexedDB clones retain state but canonical or pending changes do not", () => {
  const first = event("enroll", true, 1),
    second = event("note", "笔记", 2, null),
    pending = { ...event("bookmark", true, 3), seq: undefined };
  const current = { events: [first, second], pending: [pending], cursor: 2 };
  assert.equal(sameCache(current, structuredClone(current)), true);
  assert.equal(sameCache(current, { ...current, cursor: 3 }), false);
  assert.equal(
    sameCache(current, { ...current, events: [second, first] }),
    false,
  );
  assert.equal(sameCache(current, { ...current, events: [first] }), false);
  assert.equal(
    sameCache(current, {
      ...current,
      events: [first, { ...second, seq: 3 }],
    }),
    false,
  );
  assert.equal(
    sameCache(current, {
      ...current,
      events: [first, { ...second, value: "云端修改" }],
    }),
    false,
  );
  assert.equal(sameCache(current, { ...current, pending: [] }), false);
  assert.equal(
    sameCache(current, {
      ...current,
      pending: [{ ...pending, value: false }],
    }),
    false,
  );
  assert.equal(
    sameCache(current, {
      ...current,
      pending: [{ ...pending, id: crypto.randomUUID() }],
    }),
    false,
  );
});

test("structured-cloned TED loops and vocabulary preserve cache identity until nested values change", () => {
  const loopValue = {
    articleId: "ted-new-001",
    label: "重点",
    color: 2,
    start: 3,
    end: 10,
    paragraphId: "p1",
  };
  const wordValue = {
    id: "tedword:ted-new-001:example",
    text: "勉強",
    reading: "べんきょう",
    meaning: "学习",
    source: "ted-new-001",
    original: "勉強",
    example: {
      japanese: "日本語を勉強します。",
      japanese_annotated: "日本語（にほんご）を勉強（べんきょう）します。",
      japanese_reading: "にほんごをべんきょうします。",
      chinese: "我学习日语。",
    },
  };
  const loop = {
    ...event("ted_loop", loopValue, 1),
    entity: "tedloop:example",
  };
  const word = { ...event("ted_word", wordValue, 2), entity: wordValue.id };
  const current = {
    events: [loop, word],
    pending: [structuredClone(word)],
    cursor: 2,
  };
  assert.equal(sameCache(current, structuredClone(current)), true);
  const confirmed = { ...current, pending: [] };
  assert.equal(
    mergeCache(confirmed, structuredClone(confirmed.events), 2),
    confirmed,
  );
  const changedLoop = structuredClone(current);
  (changedLoop.events[0].value as typeof loopValue).end = 11;
  assert.equal(sameCache(current, changedLoop), false);
  const changedWord = structuredClone(current);
  (changedWord.events[1].value as typeof wordValue).example.chinese =
    "我正在学习日语。";
  assert.equal(sameCache(current, changedWord), false);
  assert.notEqual(mergeCache(confirmed, changedWord.events, 2), confirmed);
  const changedPending = structuredClone(current);
  (changedPending.pending[0].value as typeof wordValue).example.japanese =
    "毎日勉強します。";
  assert.equal(sameCache(current, changedPending), false);
});

test("JSON event values compare nested arrays, null and object keys without serialization", () => {
  const value = { nested: [null, true, 2, "例", { enabled: false }] };
  const record = event("setting", value, 1);
  const current = { events: [record], pending: [], cursor: 1 };
  assert.equal(sameCache(current, structuredClone(current)), true);
  for (const different of [
    { nested: [null, true, 2, "例", { enabled: true }] },
    { nested: [null, true, 2, "例"] },
    { nested: [null, true, "2", "例", { enabled: false }] },
    { nested: { 0: null, 1: true, 2: 2, 3: "例", 4: { enabled: false } } },
    { other: value.nested },
    null,
  ]) {
    assert.equal(
      sameCache(current, {
        ...current,
        events: [{ ...record, value: different }],
      }),
      false,
    );
  }
});
