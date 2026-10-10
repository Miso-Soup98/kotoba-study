import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rebuild, combineEvents, mergeCache } from "../lib/study/model.ts";
import { eventSchema } from "../lib/study/validation.ts";
import { matchesVocabulary, parseVocabularyWord, vocabularyChanges, VOCABULARY_VERSION, vocabularyWordSchema, type VocabularyWord, type VocabularyCatalog } from "../lib/vocabulary/schema.ts";
import type { StudyEvent } from "../lib/study/types.ts";
import { correctedVocabularySnapshot } from "../lib/vocabulary/corrections.ts";
import corrections from "../lib/vocabulary/saved-word-corrections.json" with { type: "json" };
const word: VocabularyWord = { id: "lex:openjlpt:123456abcd", text: "会う", reading: "あう", meaning: "见面", source: "lex:openjlpt:123456abcd",
  original: "OpenJLPT N5", level: "N5", version: VOCABULARY_VERSION, meaningZh: "见面", meaningEn: ["to meet"], chineseSenses: ["见面"],
  chineseStatus: "dictionary-candidate", learningStatus: "ready", contentNote: "", pos: ["v5u", "vi"],
  sentences: [{ japanese: "友達に会う。", english: "Meet a friend.", sourceUrl: "https://tatoeba.org/sentences/show/1",
    japaneseAuthor: "test-ja", englishAuthor: "test-en", japaneseAuthorUrl: "https://tatoeba.org/en/user/profile/test-ja",
    englishAuthorUrl: "https://tatoeba.org/en/user/profile/test-en", englishSourceUrl: "https://tatoeba.org/sentences/show/2",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0/fr/" }],
  sourceUrls: ["https://github.com/evanclan/OpenJLPT"] };
const at = Date.UTC(2026, 9, 10);
const event = (kind: StudyEvent["kind"], value: unknown, seq?: number): StudyEvent => ({ kind, value, entity: word.id, id: crypto.randomUUID(), at, ...(seq ? { seq } : {}) });
test("saved vocabulary survives offline sync and replay without loading the catalog", () => {
  const first = event("vocabulary_word", JSON.stringify(word), 1), enroll = event("enroll", true, 2);
  const review = { ...event("review", 3), base: null };
  for (const { seq, ...row } of [first, enroll, review]) assert.equal(eventSchema.safeParse(row).success, true);
  const cache = mergeCache({ events: [], pending: [first, enroll, review], cursor: 0 }, [first, enroll], 2);
  const model = rebuild(combineEvents(cache.events, cache.pending));
  assert.deepEqual(model.vocabularyWords[word.id], word);
  assert.equal(model.cards[word.id].card.reps, 1);
  assert.equal(model.cards[word.id].enrolled, true);
  const updated = event("vocabulary_word", JSON.stringify({ ...word, meaning: "新版" }), 3);
  assert.equal(rebuild([first, updated]).vocabularyWords[word.id].meaning, "见面");
});
test("skip and enrollment have one consistent latest state, retaining FSRS history", () => {
  const entries = [event("vocabulary_word", JSON.stringify(word), 1), event("enroll", true, 2), { ...event("review", 3, 3), base: null }];
  const skipped = rebuild([...entries, event("vocabulary_known", true, 4)]);
  assert.equal(skipped.cards[word.id].enrolled, false);
  const resumed = rebuild([...entries, event("vocabulary_known", true, 4), event("enroll", true, 5)]);
  assert.equal(resumed.vocabularyKnown[word.id], false);
  assert.equal(resumed.cards[word.id].card.reps, 1);
});
test("word actions materialise only selected words and do not manufacture reviews", () => {
  const fresh = rebuild([]);
  assert.deepEqual(vocabularyChanges(word, "enroll", fresh).map(e => e.kind), ["vocabulary_word", "enroll"]);
  const saved = rebuild([event("vocabulary_word", JSON.stringify(word)), event("enroll", true)]);
  assert.deepEqual(vocabularyChanges(word, "known", saved).map(e => e.kind), ["vocabulary_known", "enroll"]);
  assert.deepEqual(vocabularyChanges(word, "bookmark", saved).map(e => e.kind), ["bookmark"]);
  assert.throws(() => vocabularyChanges({ ...word, learningStatus: "needs-review" }, "enroll", fresh));
});
test("malformed snapshots cannot inject unsafe links or mismatched entities", () => {
  for (const patch of [{ source: "N5-001" }, { id: "../../secret" }, { sourceUrls: ["javascript:alert(1)"] },
    { chineseStatus: "missing" }, { sentences: [{ japanese: "句", english: "sentence", sourceUrl: "http://bad.test" }] },
    { meaning: "x".repeat(13000) }, { unexpected: true }]) assert.equal(vocabularyWordSchema.safeParse({ ...word, ...patch }).success, false);
  const wrong = { ...event("vocabulary_word", JSON.stringify(word)), entity: "lex:openjlpt:abcdef0000" };
  assert.equal(eventSchema.safeParse(wrong).success, false);
  assert.deepEqual(rebuild([wrong]).vocabularyWords, {});
  assert.equal(parseVocabularyWord("{bad").success, false);
});
test("search accepts kana variants and Chinese meanings", () => {
  const item = { ...word, shard: "N5-001.json" };
  assert.ok(matchesVocabulary(item, "アウ"));
  assert.ok(matchesVocabulary(item, "见面"));
  assert.ok(matchesVocabulary(item, "MEET"));
  assert.equal(matchesVocabulary(item, "无关"), false);
});
test("published catalog is complete, unique, bounded and snapshot-valid across all five levels", () => {
  const root = `public/data/vocabulary/${VOCABULARY_VERSION}/`;
  const catalog: VocabularyCatalog = JSON.parse(readFileSync(root + "index.json", "utf8"));
  assert.equal(catalog.version, VOCABULARY_VERSION);
  assert.deepEqual(catalog.counts, { N5: 674, N4: 630, N3: 1659, N2: 1778, N1: 3070 });
  assert.equal(catalog.words.length, 7811);
  assert.equal(new Set(catalog.words.map(w => w.id)).size, 7811);
  let seen = 0;
  for (const shard of new Set(catalog.words.map(w => w.shard))) {
    assert.match(shard, /^N[1-5]-\d{3}\.json$/);
    const content = readFileSync(root + shard, "utf8"), rows = JSON.parse(content);
    assert.ok(Buffer.byteLength(content) < 600000);
    assert.ok(rows.length > 0 && rows.length <= 100);
    for (const row of rows) {
      const parsed = vocabularyWordSchema.safeParse(row);
      assert.equal(parsed.success, true, `${row.id} ${parsed.success ? "" : parsed.error.message}`);
      const index = catalog.words.find(w => w.id === row.id);
      assert.equal(index?.shard, shard);
      assert.equal(index?.meaning, row.meaning);
      assert.equal(index?.learningStatus, row.learningStatus);
      seen++;
    }
  }
  assert.equal(seen, 7811);
});

test("dictionary cross-references and edit notices never become Chinese definitions", () => {
  const root = `public/data/vocabulary/${VOCABULARY_VERSION}/`;
  const catalog: VocabularyCatalog = JSON.parse(readFileSync(root + "index.json", "utf8"));
  const words = new Map<string, VocabularyWord>();
  for (const shard of new Set(catalog.words.map(w => w.shard))) {
    for (const row of JSON.parse(readFileSync(root + shard, "utf8"))) {
      words.set(row.id, row);
      for (const meaning of [row.meaningZh, ...row.chineseSenses]) {
        assert.ok(!/^【[^】]+】$/.test(meaning.trim()) && !/Template:|=+\s*日[语語]\s*=+|以下(?:詞條尚未創建|词条尚未创建)/i.test(meaning), row.id);
      }
    }
  }
  assert.match(words.get("lex:openjlpt:bf69a1d9f2")!.meaningZh, /拜访/);
  assert.match(words.get("lex:openjlpt:da1a2f9721")!.meaningZh, /谎言/);
  const resolved = words.get("lex:openjlpt:5750d76e14")!;
  assert.equal(resolved.text, "どうか");
  assert.equal(resolved.learningStatus, "ready");
  assert.ok(resolved.meaningZh.length > 0);
  assert.ok(!resolved.meaningEn.includes("copper coin"));
  assert.deepEqual(resolved.chineseSenses, [resolved.meaningZh]);
  assert.doesNotThrow(() => vocabularyChanges(resolved, "enroll", rebuild([])));
});

test("reviewed definitions repair saved snapshots without rewriting events or resetting FSRS", () => {
  const previous: VocabularyWord[] = JSON.parse(readFileSync("public/data/vocabulary/v06-20261010-r1/N5-001.json", "utf8"));
  const original = previous.find(w => w.id === "lex:openjlpt:60dd63379e")!;
  assert.match(original.meaningZh, /我/);
  const snapshot = JSON.stringify(original);
  const events: StudyEvent[] = [
    { ...event("vocabulary_word", snapshot, 1), entity: original.id },
    { ...event("enroll", true, 2), entity: original.id },
    { ...event("review", 3, 3), entity: original.id, base: null },
  ];
  const model = rebuild(events);
  assert.match(model.vocabularyWords[original.id].meaningZh, /那边/);
  assert.equal(model.vocabularyWords[original.id].version, VOCABULARY_VERSION);
  assert.equal(model.cards[original.id].card.reps, 1);
  assert.equal(model.cards[original.id].revision, events[2].id);
  assert.equal(model.cards[original.id].enrolled, true);
  assert.equal(events[0].value, snapshot);
  const changedIdentity = { ...original, reading: "ほか" };
  assert.deepEqual(correctedVocabularySnapshot(changedIdentity), changedIdentity);
  const newer = { ...original, version: "v99-future", meaningZh: "将来经核对的释义" };
  assert.deepEqual(correctedVocabularySnapshot(newer), newer);
});

test("every saved correction exactly reproduces its current published word", () => {
  const newRoot = `public/data/vocabulary/${VOCABULARY_VERSION}/`;
  const catalog: VocabularyCatalog = JSON.parse(readFileSync(newRoot + "index.json", "utf8"));
  const ids = new Set(Object.keys(corrections.words));
  let checked = 0;
  for (const shard of new Set(catalog.words.map(w => w.shard))) {
    const current: VocabularyWord[] = JSON.parse(readFileSync(newRoot + shard, "utf8"));
    for (const version of corrections.sourceVersions) {
      const previous: VocabularyWord[] = JSON.parse(readFileSync(`public/data/vocabulary/${version}/` + shard, "utf8"));
      for (const before of previous) if (ids.has(before.id)) {
        const rows = corrections.words[before.id as keyof typeof corrections.words];
        if (rows.some(row => row.sourceVersion === version)) {
          assert.deepEqual(correctedVocabularySnapshot(before), current.find(w => w.id === before.id));
          checked++;
        }
      }
    }
  }
  assert.equal(checked, Object.values(corrections.words).reduce((n, rows) => n + rows.length, 0));
  assert.ok(checked > 250);
});

test("all 263 quarantined words are corrected without changing identity or carrying mismatched examples", () => {
  const root = "public/data/vocabulary/";
  const current: VocabularyCatalog = JSON.parse(readFileSync(`${root}${VOCABULARY_VERSION}/index.json`, "utf8"));
  let resolved = 0;
  for (const shard of new Set(current.words.map(w => w.shard))) {
    const previous: VocabularyWord[] = JSON.parse(readFileSync(`${root}v06-20261010-r2/${shard}`, "utf8"));
    const rows: VocabularyWord[] = JSON.parse(readFileSync(`${root}${VOCABULARY_VERSION}/${shard}`, "utf8"));
    for (const before of previous.filter(w => w.learningStatus === "needs-review")) {
      const after = rows.find(w => w.id === before.id)!;
      assert.equal(after.level, before.level);
      assert.equal(after.learningStatus, "ready");
      assert.ok(after.meaningZh && after.meaningEn.length);
      assert.deepEqual(after.sentences, []);
      assert.deepEqual(correctedVocabularySnapshot(before), after);
      resolved++;
    }
  }
  assert.equal(resolved, 263);
});
