import test from "node:test";
import assert from "node:assert/strict";
import { tedSavedCardUpdates } from "../lib/ted/saved-corrections.ts";
import { rebuild } from "../lib/study/model.ts";
import { eventSchema } from "../lib/study/validation.ts";
import type { Word, StudyEvent } from "../lib/study/types.ts";
import type { ListeningCard } from "../lib/study/listening-card.ts";
import type { TedArticle, TedCorrection } from "../lib/ted/types.ts";

const word: Word = { id: "tedword:ted-old-001:original-id", source: "ted-old-001",
  text: "存在", reading: "そんざい", meaning: "旧释义", original: "存在",
  usage: "原形：存在；名詞", example: { japanese: "存在する。", japanese_annotated: "存在する。",
    japanese_reading: "存在する。", chinese: "旧译文" } };
const listening: ListeningCard = { id: "listen:00000000-0000-4000-8000-000000000001",
  articleId: "ted-old-001", articleTitle: "创建时标题", label: "自己的标记名称", start: 12.4, end: 17.8,
  sourceLoopId: "tedloop:00000000-0000-4000-8000-000000000002", paragraphId: "p1",
  japanese: "存在する。", chinese: "旧译文" };
const glossCorrection: TedCorrection = { id: "g1", kind: "glossary", term: "存在",
  original: { term: "存在", reading: "そんざい", meaning: "旧释义", usage: "" },
  correctedMeaning: "存在；有", reason: "test", reference: { title: "test" } };
const paragraphCorrection: TedCorrection = { id: "p1", kind: "paragraph", paragraphId: "p1",
  original: { japanese: "存在する。", chinese: "旧译文" }, chinese: "存在。",
  reason: "test", reference: { title: "test" } };
function article(corrections: TedCorrection[] = [glossCorrection, paragraphCorrection]): TedArticle {
  return { id: "ted-old-001", title: "文章", collection: "old", number: 1, pages: 1,
    paragraphs: [{ id: "p1", page: 1, japanese: "存在する。", chinese: "存在。" }],
    glossary: [{ term: "存在", reading: "そんざい", meaning: "存在；有", usage: "", examples: [], page: 1 }],
    notes: [], warnings: [], corrections };
}
const words = (w = word) => ({ [w.id]: w });
const cards = (c = listening) => ({ [c.id]: c });

test("exact old glossary and full example update together without changing card identity or other fields", () => {
  const source = structuredClone(word);
  const [update] = tedSavedCardUpdates(article(), words(), {});
  assert.equal(update.kind, "ted_word");
  assert.equal(update.entity, word.id);
  assert.deepEqual(JSON.parse(update.value), { ...word, meaning: "存在；有",
    example: { ...word.example, chinese: "存在。" } });
  assert.deepEqual(word, source);
  assert.deepEqual(tedSavedCardUpdates(article(), words(JSON.parse(update.value)), {}), []);
});

test("custom or partial headwords/readings/meanings, lesson cards and other articles are not guessed", () => {
  for (const changed of [{ text: "存" }, { reading: "そん" }, { meaning: "我自己的释义" },
    { source: "ted-old-002", id: "tedword:ted-old-002:x" }, { id: "tedword:ted-old-001:lesson:x" }]) {
    assert.deepEqual(tedSavedCardUpdates(article([glossCorrection]), words({ ...word, ...changed }), {}), []);
  }
});

test("ambiguous glossary candidates, hidden targets and incomplete original readings are skipped", () => {
  const ambiguous = article([glossCorrection, { ...glossCorrection, id: "g2" }]);
  assert.deepEqual(tedSavedCardUpdates(ambiguous, words(), {}), []);
  const hidden = article([glossCorrection]); hidden.glossary[0].displayHidden = true;
  assert.deepEqual(tedSavedCardUpdates(hidden, words(), {}), []);
  const incomplete = article([{ ...glossCorrection, original: { ...glossCorrection.original, reading: "" } }]);
  assert.deepEqual(tedSavedCardUpdates(incomplete, words(), {}), []);
});

test("changed usage cannot overwrite token prefixes or user additions", () => {
  const source = article([{ ...glossCorrection, correctedUsage: "新用法" }]);
  source.glossary[0].usage = "新用法";
  assert.deepEqual(tedSavedCardUpdates(source, words(), {}), []);
  const [update] = tedSavedCardUpdates(source, words({ ...word, usage: "" }), {});
  assert.equal(JSON.parse(update.value).usage, "新用法");
});

test("word examples require complete equal bilingual text and unmodified annotation/reading", () => {
  for (const example of [{ ...word.example!, japanese: "存在" },
    { ...word.example!, chinese: "我改过的意思" },
    { ...word.example!, japanese_reading: "そんざいする。" },
    { ...word.example!, japanese_annotated: "存在（そんざい）する。" }]) {
    assert.deepEqual(tedSavedCardUpdates(article([paragraphCorrection]), words({ ...word, example }), {}), []);
  }
  const truncated = { ...paragraphCorrection, original: { japanese: "存在する。続き。", chinese: "旧译文后续" } };
  assert.deepEqual(tedSavedCardUpdates(article([truncated]), words(), {}), []);
});

test("duplicate old paragraphs, stale corrections and merged targets are not applied to saved examples", () => {
  const ambiguous = article([paragraphCorrection, { ...paragraphCorrection, id: "p2", paragraphId: "p2" }]);
  assert.deepEqual(tedSavedCardUpdates(ambiguous, words(), {}), []);
  const stale = article([paragraphCorrection]); stale.paragraphs[0].chinese = "更新一版的翻译";
  assert.deepEqual(tedSavedCardUpdates(stale, words(), {}), []);
  const merged = article([paragraphCorrection]);
  merged.paragraphs.push({ id: "p2", page: 1, japanese: "", chinese: "", displayHidden: true, sourceMappedTo: ["p1"] });
  assert.deepEqual(tedSavedCardUpdates(merged, words(), cards()), []);
});

test("listening updates only the exact same paragraph's translation, retaining all audio metadata", () => {
  const [update] = tedSavedCardUpdates(article(), {}, cards());
  assert.equal(update.kind, "listening_card");
  assert.deepEqual(JSON.parse(update.value), { ...listening, chinese: "存在。" });
  assert.deepEqual(tedSavedCardUpdates(article(), {}, cards(JSON.parse(update.value))), []);
});

test("listening excerpts, edited text, different paragraphs and Japanese changes are skipped", () => {
  for (const changed of [{ chinese: "用户翻译" }, { japanese: "存在" }, { paragraphId: undefined },
    { paragraphId: "p2" }, { articleId: "ted-old-002" }]) {
    assert.deepEqual(tedSavedCardUpdates(article(), {}, cards({ ...listening, ...changed })), []);
  }
  const source = article([{ ...paragraphCorrection, japanese: "存在しています。" }]);
  source.paragraphs[0].japanese = "存在しています。";
  assert.deepEqual(tedSavedCardUpdates(source, {}, cards()), []);
});

test("oversized corrected snapshots are rejected before enqueueing", () => {
  const source = article([{ ...paragraphCorrection, chinese: "中".repeat(3001) }]);
  source.paragraphs[0].chinese = "中".repeat(3001);
  assert.deepEqual(tedSavedCardUpdates(source, words(), cards()), []);
  // Individual fields fit the word schema but the serialized sync event does not.
  const long = article([{ ...paragraphCorrection, japanese: "あ".repeat(2400), chinese: "中".repeat(2400) }]);
  long.paragraphs[0].japanese = "あ".repeat(2400);
  long.paragraphs[0].chinese = "中".repeat(2400);
  assert.deepEqual(tedSavedCardUpdates(long, words({ ...word, meaning: "意".repeat(2800) }), {}), []);
});

test("content-only events survive sync validation and preserve existing FSRS, notes and loop records", () => {
  const makeEvent = (kind: StudyEvent["kind"], entity: string, value: unknown, at: number, base?: string | null): StudyEvent =>
    ({ id: crypto.randomUUID(), kind, entity, value, at, ...(base !== undefined ? { base } : {}) });
  const history = [makeEvent("ted_word", word.id, JSON.stringify(word), 1000),
    makeEvent("listening_card", listening.id, JSON.stringify(listening), 1000),
    makeEvent("enroll", word.id, true, 1000), makeEvent("enroll", listening.id, true, 1000),
    makeEvent("review", word.id, 3, 2000, null),
    makeEvent("note", word.id, "我自己的笔记", 2000, null),
    makeEvent("ted_loop", listening.sourceLoopId, JSON.stringify({ articleId: listening.articleId,
      label: listening.label, color: 4, start: listening.start, end: listening.end, paragraphId: "p1" }), 1000)];
  const before = rebuild(history);
  const updates = tedSavedCardUpdates(article(), before.tedWords, before.listeningCards);
  const events = updates.map(e => makeEvent(e.kind, e.entity, e.value, 3000));
  assert.ok(events.every(e => eventSchema.safeParse(e).success));
  const after = rebuild([...history, ...events]);
  assert.deepEqual(after.cards, before.cards);
  assert.deepEqual(after.notes, before.notes);
  assert.deepEqual(after.tedLoops, before.tedLoops);
  assert.deepEqual(after.reviews, before.reviews);
  assert.deepEqual(tedSavedCardUpdates(article(), after.tedWords, after.listeningCards), []);
});
