import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { practiceSchema, parsedPractice } from "../lib/training/validation.ts";
import {
  adaptivePlan,
  latestAnswers,
  selectQuestions,
  trainingSummary,
} from "../lib/training/planner.ts";
import { rebuild, mergeCache, combineEvents } from "../lib/study/model.ts";
import { eventSchema } from "../lib/study/validation.ts";
import { tasks } from "../lib/study/content.ts";
import type {
  PracticeAttempt,
  PracticeRecord,
  Category,
  Question,
} from "../lib/training/types.ts";
import type { StudyEvent, Cache } from "../lib/study/types.ts";

// Run with the app as cwd. When installing under app/tests, replace
// "../" in imports with "../"; assets already use the app cwd.
const at = Date.UTC(2026, 8, 25, 12);
const categories: Category[] = [
  "grammar",
  "vocabulary",
  "reading",
  "listening",
];
const modes: PracticeAttempt["mode"][] = ["practice", "timed", "mistakes"];
function attempt(overrides: Partial<PracticeAttempt> = {}): PracticeAttempt {
  return {
    questionId: "n2-grammar-001",
    choice: 1,
    correct: true,
    category: "grammar",
    elapsedSeconds: 24,
    mode: "practice",
    ...overrides,
  };
}
function practiceEvent(value: PracticeAttempt, seq: number): StudyEvent {
  return {
    id: crypto.randomUUID(),
    kind: "practice",
    entity: `practice:${value.questionId}`,
    value: JSON.stringify(value),
    at: at + seq * 1000,
    seq,
  };
}
function record(overrides: Partial<PracticeRecord> = {}): PracticeRecord {
  return { ...attempt(), id: crypto.randomUUID(), at, ...overrides };
}
function weakRecords(category: Category): PracticeRecord[] {
  return [false, false, true].map((correct, index) =>
    record({
      questionId: `n2-${category}-${index + 1}`,
      category,
      correct,
      at: at + index,
    }),
  );
}
function readJSON(path: string) {
  return JSON.parse(readFileSync(resolve(path), "utf8"));
}
const questions: Question[] = readJSON("public/data/n2-questions.json");

test("practice accepts all supported categories and modes, including time/choice boundaries", () => {
  for (const category of categories)
    for (const mode of modes)
      for (const elapsedSeconds of [0, 3600])
        for (const choice of [0, 3]) {
          const value = attempt({ category, mode, elapsedSeconds, choice });
          assert.deepEqual(practiceSchema.parse(value), value);
          assert.equal(parsedPractice(JSON.stringify(value)).success, true);
        }
});

test("practice rejects malformed IDs, values, choices, times, categories and unknown fields", () => {
  const invalid = [
    { questionId: "grammar-001" },
    { questionId: "n2-" },
    { questionId: `n2-${"a".repeat(71)}` },
    { questionId: "n2-../secret" },
    { choice: -1 },
    { choice: 4 },
    { choice: 1.5 },
    { choice: "1" },
    { correct: "true" },
    { correct: 1 },
    { category: "speaking" },
    { mode: "exam" },
    { elapsedSeconds: -1 },
    { elapsedSeconds: 3601 },
    { elapsedSeconds: 0.5 },
    { elapsedSeconds: Infinity },
    { elapsedSeconds: NaN },
    { elapsedSeconds: "24" },
    { arbitrary: true },
  ];
  for (const patch of invalid)
    assert.equal(
      practiceSchema.safeParse({ ...attempt(), ...patch }).success,
      false,
      `unexpectedly accepted ${JSON.stringify(patch)}`,
    );
  for (const key of Object.keys(attempt())) {
    const missing = { ...attempt() } as Record<string, unknown>;
    delete missing[key];
    assert.equal(
      practiceSchema.safeParse(missing).success,
      false,
      `missing ${key}`,
    );
  }
});

test("practice JSON parser fails closed without throwing on corrupt cached input", () => {
  for (const raw of [
    undefined,
    null,
    "",
    "{broken",
    "null",
    "[]",
    "42",
    "true",
    {},
  ])
    assert.equal(parsedPractice(raw).success, false);
});

test("sync event validation binds the practice entity to its payload question", () => {
  const event = practiceEvent(attempt(), 1);
  const { seq: _seq, ...outgoing } = event;
  assert.equal(eventSchema.safeParse(outgoing).success, true);
  for (const entity of ["practice:n2-grammar-002", "N3-001", "n2-grammar-001"])
    assert.equal(eventSchema.safeParse({ ...outgoing, entity }).success, false);
  for (const value of [
    true,
    null,
    1,
    "{}",
    "not json",
    JSON.stringify({ ...attempt(), choice: 4 }),
  ])
    assert.equal(eventSchema.safeParse({ ...outgoing, value }).success, false);
  assert.equal(
    eventSchema.safeParse({ ...outgoing, unexpected: "ignored?" }).success,
    false,
  );
});

test("event replay restores attempts, answer status, timing and mode in server sequence", () => {
  const first = practiceEvent(
    attempt({ correct: false, choice: 0, elapsedSeconds: 51 }),
    1,
  );
  const second = practiceEvent(
    attempt({ mode: "mistakes", elapsedSeconds: 18 }),
    2,
  );
  const third = practiceEvent(
    attempt({
      questionId: "n2-listening-001",
      category: "listening",
      mode: "timed",
    }),
    3,
  );
  const replay = rebuild([third, second, first]);
  assert.deepEqual(
    replay.practice,
    [first, second, third].map((event) => ({
      ...JSON.parse(String(event.value)),
      id: event.id,
      at: event.at,
    })),
  );
  assert.equal(replay.practice.length, 3);
  assert.deepEqual(replay.cards, {});
  assert.equal(replay.reviews.length, 0);
});

test("malformed practice payloads do not prevent valid history from being replayed", () => {
  const valid = practiceEvent(attempt(), 2);
  const corrupt = { ...practiceEvent(attempt(), 1), value: "{broken" };
  const outOfBounds = {
    ...practiceEvent(attempt(), 3),
    value: JSON.stringify(attempt({ choice: 4 })),
  };
  const replay = rebuild([corrupt, valid, outOfBounds]);
  assert.equal(replay.practice.length, 1);
  assert.equal(replay.practice[0].id, valid.id);
});

test("retrying an acknowledged practice event keeps one attempt and drains only its pending copy", () => {
  const first = practiceEvent(attempt({ correct: false }), 1);
  const second = practiceEvent(attempt({ mode: "mistakes" }), 2);
  const pendingFirst = { ...first, seq: undefined };
  const pendingSecond = { ...second, seq: undefined };
  const cache: Cache = {
    events: [],
    pending: [pendingFirst, pendingSecond],
    cursor: 0,
  };
  const acknowledged = mergeCache(cache, [first], 1);
  const retried = mergeCache(acknowledged, [first], 1);
  assert.equal(retried.pending.length, 1);
  assert.equal(retried.pending[0].id, second.id);
  const replay = rebuild(combineEvents(retried.events, retried.pending));
  assert.deepEqual(
    replay.practice.map((item) => item.id),
    [first.id, second.id],
  );
});

test("a later correct answer clears only that question from mistakes and retains all attempts", () => {
  const wrong = practiceEvent(attempt({ correct: false, choice: 0 }), 1);
  const other = practiceEvent(
    attempt({ questionId: "n2-grammar-002", correct: false }),
    2,
  );
  const corrected = practiceEvent(
    attempt({ correct: true, mode: "mistakes" }),
    3,
  );
  const history = rebuild([corrected, wrong, other]).practice;
  const before = structuredClone(history);
  assert.equal(history.length, 3);
  assert.equal(latestAnswers(history).get("n2-grammar-001")?.id, corrected.id);
  assert.deepEqual(
    trainingSummary(history).mistakes.map((item) => item.questionId),
    ["n2-grammar-002"],
  );
  assert.deepEqual(
    selectQuestions(questions, history, "all", true).map((item) => item.id),
    ["n2-grammar-002"],
  );
  assert.deepEqual(history, before);
});

test("a new wrong answer returns a previously corrected question to the mistake list", () => {
  const history = [
    record({ correct: false }),
    record({ correct: true, at: at + 1 }),
    record({ correct: false, at: at + 2, mode: "timed" }),
  ];
  const summary = trainingSummary(history);
  assert.equal(summary.mistakes.length, 1);
  assert.equal(summary.mistakes[0].id, history[2].id);
  assert.equal(
    summary.categories.find((item) => item.category === "grammar")?.total,
    3,
  );
  assert.equal(
    summary.categories.find((item) => item.category === "grammar")?.correct,
    1,
  );
});

test("question selection puts mistakes before unseen and solved items, and respects categories", () => {
  const fixture = [
    questions[0],
    questions[1],
    questions[2],
    questions.find((q) => q.category === "listening")!,
  ];
  const history = [
    record({ questionId: fixture[0].id }),
    record({ questionId: fixture[2].id, correct: false }),
  ];
  assert.deepEqual(
    selectQuestions(fixture, history, "grammar", false).map((item) => item.id),
    [fixture[2].id, fixture[1].id, fixture[0].id],
  );
  assert.equal(selectQuestions(fixture, history, "listening", true).length, 0);
  assert.equal(
    selectQuestions(fixture, history, "listening", false)[0].id,
    fixture[3].id,
  );
});

test("one or two errors do not prematurely label a category as weak", () => {
  for (const count of [0, 1, 2]) {
    const history = weakRecords("reading").slice(0, count);
    assert.equal(trainingSummary(history).weakest, undefined);
    assert.deepEqual(
      adaptivePlan(history, 0, at).tasks.map((item) => item.minutes),
      tasks.map((item) => item.minutes),
    );
  }
});

test("adaptive accuracy uses recent sixty attempts while unresolved old mistakes remain available", () => {
  const old = Array.from({ length: 4 }, (_, index) =>
    record({
      questionId: `n2-reading-old-${index}`,
      category: "reading",
      correct: false,
      at: at - 100 + index,
    }),
  );
  const recent = Array.from({ length: 60 }, (_, index) =>
    record({
      questionId: `n2-grammar-recent-${index}`,
      category: "grammar",
      correct: true,
      at: at + index,
    }),
  );
  const summary = trainingSummary([...old, ...recent]);
  assert.equal(
    summary.categories.find((item) => item.category === "reading")?.total,
    0,
  );
  assert.equal(
    summary.categories.find((item) => item.category === "grammar")?.total,
    60,
  );
  assert.equal(summary.mistakes.length, 4);
  assert.deepEqual(
    adaptivePlan([...old, ...recent], 0, at).tasks.map((item) => item.minutes),
    tasks.map((item) => item.minutes),
  );
});

test("adaptive plans retain five nonnegative tasks totaling 120 minutes across workload, skill and exam phases", () => {
  const histories = [[], ...categories.map(weakRecords)];
  const dates = [
    at,
    Date.UTC(2027, 2, 1),
    Date.UTC(2027, 5, 15),
    Date.UTC(2027, 7, 1),
  ];
  for (const history of histories)
    for (const dueCount of [0, 29, 30, 500])
      for (const now of dates) {
        const result = adaptivePlan(history, dueCount, now);
        assert.equal(result.tasks.length, 5);
        assert.deepEqual(
          result.tasks.map((item) => item.id),
          tasks.map((item) => item.id),
        );
        assert.equal(
          result.tasks.reduce((sum, item) => sum + item.minutes, 0),
          120,
        );
        assert.ok(
          result.tasks.every(
            (item) => Number.isInteger(item.minutes) && item.minutes >= 0,
          ),
        );
        assert.ok(Number.isInteger(result.days) && result.days >= 0);
      }
});

test("review backlog and weak listening each receive time without losing the two-hour budget", () => {
  const minutes = (items: typeof tasks, id: string) =>
    items.find((item) => item.id === id)!.minutes;
  const plan = adaptivePlan(weakRecords("listening"), 30, at);
  assert.ok(minutes(plan.tasks, "review") > minutes(tasks, "review"));
  assert.ok(minutes(plan.tasks, "listening") > minutes(tasks, "listening"));
  assert.equal(
    plan.tasks.reduce((sum, item) => sum + item.minutes, 0),
    120,
  );
  assert.ok(
    plan.tasks
      .find((item) => item.id === "listening")!
      .description.includes("听力"),
  );
});

test("80 percent accuracy keeps the base allocation, but weaker reading gets more practice", () => {
  const good = Array.from({ length: 5 }, (_, index) =>
    record({ category: "reading", correct: index < 4 }),
  );
  const weak = weakRecords("reading");
  assert.deepEqual(
    adaptivePlan(good, 0, at).tasks.map((item) => item.minutes),
    tasks.map((item) => item.minutes),
  );
  assert.ok(
    adaptivePlan(weak, 0, at).tasks.find((item) => item.id === "reading")!
      .minutes > tasks.find((item) => item.id === "reading")!.minutes,
  );
});

test("building adaptive plans does not mutate task defaults or learning history", () => {
  const baseline = structuredClone(tasks);
  const pristinePlan = structuredClone(adaptivePlan([], 0, at).tasks);
  const history = weakRecords("vocabulary");
  const historyCopy = structuredClone(history);
  const changed = adaptivePlan(history, 90, at);
  changed.tasks[0].minutes = 999;
  changed.tasks[0].description = "caller mutation";
  assert.deepEqual(tasks, baseline);
  assert.deepEqual(history, historyCopy);
  assert.deepEqual(adaptivePlan([], 0, at).tasks, pristinePlan);
});

test("exam planning changes phase at the intended boundaries and clamps elapsed targets to zero", () => {
  const target = Date.UTC(2027, 6, 1);
  const day = 86400000;
  assert.equal(
    adaptivePlan([], 0, target - 181 * day).phase,
    "N3 补缺与 N2 基础",
  );
  assert.equal(
    adaptivePlan([], 0, target - 180 * day).phase,
    "N2 专项与错题巩固",
  );
  assert.equal(
    adaptivePlan([], 0, target - 61 * day).phase,
    "N2 专项与错题巩固",
  );
  assert.equal(
    adaptivePlan([], 0, target - 60 * day).phase,
    "限时练习与薄弱项回顾",
  );
  assert.equal(adaptivePlan([], 0, target).days, 0);
  assert.equal(adaptivePlan([], 0, target + 10 * day).days, 0);
});

test("original training bank contains 36 complete four-choice questions across the promised skills", () => {
  assert.equal(questions.length, 36);
  assert.equal(new Set(questions.map((item) => item.id)).size, 36);
  assert.deepEqual(
    Object.fromEntries(
      categories.map((category) => [
        category,
        questions.filter((item) => item.category === category).length,
      ]),
    ),
    { grammar: 18, vocabulary: 6, reading: 8, listening: 4 },
  );
  for (const question of questions) {
    assert.match(question.id, /^n2-[a-z0-9-]+$/);
    assert.equal(question.options.length, 4, question.id);
    assert.equal(new Set(question.options).size, 4, question.id);
    assert.ok(
      question.options.every((option) => option.trim()),
      question.id,
    );
    assert.ok(
      Number.isInteger(question.answerIndex) &&
        question.answerIndex >= 0 &&
        question.answerIndex < 4,
      question.id,
    );
    assert.ok(
      question.title &&
        question.prompt &&
        question.explanation &&
        question.skill,
      question.id,
    );
    assert.ok(["N3", "N2"].includes(question.level), question.id);
    if (question.category === "reading")
      assert.ok(
        question.passage &&
          [...question.passage].length >= 150 &&
          [...question.passage].length <= 300,
        question.id,
      );
    if (question.category === "listening")
      assert.ok(
        question.transcript &&
          [...question.transcript].length >= 100 &&
          [...question.transcript].length <= 180,
        question.id,
      );
  }
});

test("every linked grammar lesson in the question bank exists in the original corpus", () => {
  const corpus = readJSON("public/data/grammar.json") as {
    entries: { id: string }[];
  };
  const ids = new Set(corpus.entries.map((item) => item.id));
  for (const question of questions) {
    assert.ok(Array.isArray(question.grammarIds), question.id);
    assert.equal(
      new Set(question.grammarIds).size,
      question.grammarIds.length,
      question.id,
    );
    for (const grammarId of question.grammarIds)
      assert.ok(ids.has(grammarId), `${question.id}: ${grammarId}`);
  }
});

test("all four listening questions have one packaged audio clip matching the final transcript and ID", () => {
  const manifest = readJSON("public/audio/training/manifest.json") as {
    voices: { id: string }[];
    clips: {
      entryId: string;
      exampleIndex: number;
      text: string;
      voice: string;
      src: string;
      srt: string;
      durationSeconds: number;
    }[];
  };
  const listening = questions.filter((item) => item.category === "listening");
  assert.equal(manifest.clips.length, listening.length);
  assert.equal(
    new Set(manifest.clips.map((clip) => clip.entryId)).size,
    listening.length,
  );
  assert.deepEqual(
    new Set(manifest.clips.map((clip) => clip.entryId)),
    new Set(listening.map((item) => item.id)),
  );
  for (const question of listening) {
    const clip = manifest.clips.find((item) => item.entryId === question.id)!;
    assert.equal(
      clip.text,
      question.transcript,
      `${question.id}: stale narration`,
    );
    assert.equal(clip.exampleIndex, 0);
    assert.ok(manifest.voices.some((voice) => voice.id === clip.voice));
    assert.equal(clip.src, `/audio/training/${question.id}.mp3`);
    assert.equal(clip.srt, `/audio/training/${question.id}.srt`);
    assert.ok(
      Number.isFinite(clip.durationSeconds) && clip.durationSeconds > 0,
    );
    assert.ok(statSync(resolve("public", clip.src.slice(1))).size > 0);
    assert.match(
      readFileSync(resolve("public", clip.srt.slice(1)), "utf8"),
      /\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}/,
    );
  }
});
