import test from "node:test";
import assert from "node:assert/strict";
import {
  byteRange,
  tedLoopSchema,
  tedWordSchema,
} from "../lib/ted/validation.ts";
import { makeTedWord } from "../lib/ted/word.ts";
import { eventSchema } from "../lib/study/validation.ts";
import { rebuild } from "../lib/study/model.ts";
import { lookupWord } from "../lib/ted/lookup.ts";
import type { StudyEvent } from "../lib/study/types.ts";
import type { TedArticle } from "../lib/ted/types.ts";
test("unknown inflections retain their surface reading and cannot overwrite a reliable headword card", async () => {
  const paragraph = {
    id: "p1",
    page: 1,
    japanese: "原則であり",
    chinese: "作为原则",
  };
  const article = {
    id: "ted-new-001",
    glossary: [],
    dictionary: {
      known: {
        term: "ある",
        reading: "ある",
        meaning: "有；存在",
        usage: "",
        examples: [],
        page: 1,
      },
    },
  } as unknown as TedArticle;
  const unknown = await makeTedWord(article, paragraph, {
    surface: "あり",
    lemma: "ある",
    reading: "あり",
    pos: "動詞",
  });
  const known = await makeTedWord(article, paragraph, {
    surface: "ある",
    lemma: "ある",
    reading: "ある",
    pos: "動詞",
    dictionaryId: "known",
  });
  assert.equal(unknown.text, "あり");
  assert.equal(unknown.reading, "あり");
  assert.notEqual(unknown.id, known.id);
  assert.equal(
    (
      await makeTedWord(article, paragraph, {
        surface: "あり",
        lemma: "ある",
        reading: "あり",
        pos: "動詞",
      })
    ).id,
    unknown.id,
  );
});
test("oversize vocabulary is rejected before it can poison the sync queue", () => {
  const word = {
    id: "tedword:ted-new-001:long",
    text: "例",
    reading: "れい",
    meaning: "义".repeat(3000),
    source: "ted-new-001",
    original: "例",
    example: {
      japanese: "文".repeat(2500),
      japanese_annotated: "文".repeat(2500),
      japanese_reading: "文".repeat(2500),
      chinese: "译".repeat(2500),
    },
  };
  assert.ok(JSON.stringify(word).length > 12000);
  assert.equal(tedWordSchema.safeParse(word).success, false);
});
const loop = {
  articleId: "ted-new-001",
  label: "听辨转折",
  start: 10.2,
  end: 15.8,
  color: 2,
  paragraphId: "p1",
};
const event = (
  kind: StudyEvent["kind"],
  entity: string,
  value: unknown,
  seq: number,
): StudyEvent => ({
  id: crypto.randomUUID(),
  kind,
  entity,
  value,
  at: Date.now(),
  seq,
});
test("media byte ranges cover Safari probes, seeking, suffixes and invalid ranges", () => {
  assert.deepEqual(byteRange("bytes=0-1", 100), { offset: 0, length: 2 });
  assert.deepEqual(byteRange("bytes=40-", 100), { offset: 40, length: 60 });
  assert.deepEqual(byteRange("bytes=-10", 100), { offset: 90, length: 10 });
  assert.deepEqual(byteRange("bytes=80-999", 100), { offset: 80, length: 20 });
  for (const value of [
    "bytes=100-",
    "bytes=4-2",
    "bytes=-0",
    "bytes=0-1,9-10",
    "bytes=-",
    "garbage",
  ])
    assert.equal(byteRange(value, 100), "invalid");
});
test("loop edits and removals preserve other regions across sync rebuild", () => {
  const a = "tedloop:" + crypto.randomUUID(),
    b = "tedloop:" + crypto.randomUUID();
  const events = [
    event("ted_loop", a, JSON.stringify(loop), 1),
    event(
      "ted_loop",
      b,
      JSON.stringify({ ...loop, color: 4, start: 25, end: 30 }),
      2,
    ),
    event("ted_loop", a, JSON.stringify({ ...loop, label: "更新区域" }), 3),
    event("ted_loop", b, null, 4),
  ];
  assert.ok(events.every(({ seq, ...e }) => eventSchema.safeParse(e).success));
  const model = rebuild(events);
  assert.equal(model.tedLoops[a]?.label, "更新区域");
  assert.equal(model.tedLoops[b], null);
});
test("loop validation rejects nonfinite, reversed, too-short, unknown article and extra fields", () => {
  assert.equal(tedLoopSchema.safeParse(loop).success, true);
  for (const patch of [
    { end: 9 },
    { end: 10.3 },
    { start: NaN },
    { articleId: "../../secret" },
    { color: 6 },
    { owner: "spoof" },
  ])
    assert.equal(tedLoopSchema.safeParse({ ...loop, ...patch }).success, false);
});
test("TED vocabulary, bookmarks and playback positions survive the existing backup/event format", () => {
  const word = {
    id: "tedword:ted-new-001:方法",
    text: "方法",
    reading: "ほうほう",
    meaning: "方法",
    source: "ted-new-001",
    original: "方法",
  };
  const events = [
    event("ted_word", word.id, JSON.stringify(word), 1),
    event("bookmark", word.id, true, 2),
    event("ted_progress", "ted-new-001", 32.4, 3),
  ];
  const parsed = events.map((e) =>
    eventSchema.parse((({ seq, ...rest }) => rest)(e)),
  );
  const model = rebuild(parsed);
  assert.deepEqual(model.tedWords[word.id], word);
  assert.equal(model.tedProgress["ted-new-001"], 32.4);
  assert.equal(model.bookmarks[word.id], true);
  assert.equal(
    eventSchema.safeParse({ ...parsed[0], entity: "another-word" }).success,
    false,
  );
});
test("word lookup respects the reading-aware preprocessing decision rather than a conflicting surface match", () => {
  const gloss = {
    term: "開く",
    reading: "あく",
    meaning: "打开",
    usage: "",
    examples: [],
    page: 1,
  };
  const chosen = {
    ...gloss,
    reading: "ひらく",
    meaning: "召开",
    source: "中文维基词典",
  };
  const article = {
    glossary: [gloss],
    dictionary: { right: chosen },
  } as unknown as TedArticle;
  assert.equal(
    lookupWord(article, {
      surface: "開く",
      lemma: "開く",
      reading: "ひらく",
      pos: "動詞",
      dictionaryId: "right",
    }).gloss?.meaning,
    "召开",
  );
  assert.equal(
    lookupWord(article, {
      surface: "開く",
      lemma: "開く",
      reading: "ひらく",
      pos: "動詞",
    }).gloss,
    undefined,
  );
});
