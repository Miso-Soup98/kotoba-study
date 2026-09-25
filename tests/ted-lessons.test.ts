import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  matchLessons,
  lessonWord,
  type LessonPattern,
} from "../lib/ted/lessons.ts";
import { lookupWord } from "../lib/ted/lookup.ts";
import type { TedArticle } from "../lib/ted/types.ts";
const patterns: LessonPattern[] = JSON.parse(
  readFileSync(
    new URL("../public/data/ted-patterns.json", import.meta.url),
    "utf8",
  ),
);
test("authored constructions match exact boundaries and prefer longer alternatives", () => {
  assert.equal(patterns.length, 36);
  const text =
    "本を読むようにしています。日本についての本だけでなく、歴史も読みます。";
  const hits = matchLessons(text, patterns, "grammar");
  assert.ok(hits.some((h) => h.surface === "ようにして"));
  assert.ok(hits.some((h) => h.surface === "についての"));
  assert.ok(
    hits.every(
      (h, i) =>
        h.surface === text.slice(h.start, h.end) &&
        (!i || hits[i - 1].end <= h.start),
    ),
  );
  assert.equal(matchLessons("xyz", patterns).length, 0);
  assert.equal(
    matchLessons("xyz", [{ ...patterns[0], patterns: ["(?:)"] }]).length,
    0,
  );
});
test("expression cards retain the article context and a stable independent identity", () => {
  const paragraph = {
    id: "p1",
    page: 1,
    japanese: "日本について調べます。",
    chinese: "调查日本的情况。",
  };
  const match = matchLessons(paragraph.japanese, patterns)[0];
  const word = lessonWord("ted-new-001", paragraph, match);
  assert.match(word.id, /^tedword:ted-new-001:lesson:/);
  assert.equal(word.example?.japanese, paragraph.japanese);
  assert.ok(word.usage?.includes(match.lesson.connection));
});
test("reviewed context corrections take priority over stale dictionary candidates", () => {
  const gloss = {
    term: "摂る",
    reading: "とる",
    meaning: "摄取；进食",
    usage: "食事を摂る",
    examples: [],
    page: 1,
  };
  const article = {
    glossary: [gloss],
    dictionary: { old: { ...gloss, meaning: "驾驶" } },
    corrections: [{ kind: "glossary", term: "摂る" }],
  } as unknown as TedArticle;
  const found = lookupWord(article, {
    surface: "摂り",
    lemma: "摂る",
    reading: "とり",
    pos: "動詞",
    dictionaryId: "old",
  });
  assert.equal(found.gloss?.meaning, "摄取；进食");
  assert.match(found.source, /已订正/);
});
