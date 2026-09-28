import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rebuild, combineEvents, mergeCache } from "../lib/study/model.ts";
import { eventSchema } from "../lib/study/validation.ts";
import { listeningCardSchema } from "../lib/study/listening-card.ts";
import { trainingSessionSchema, QUESTION_SET_VERSION, sessionAnswers, sessionFinished, diagnosticAdvice } from "../lib/training/session.ts";
import { articleMatches, reviewedMatches } from "../lib/ted/context-lessons.ts";
import { visibleParagraph } from "../lib/ted/paragraph.ts";
import type { TedArticle, TedContextLesson, TedParagraph } from "../lib/ted/types.ts";
import type { StudyEvent } from "../lib/study/types.ts";
import type { Question, PracticeRecord } from "../lib/training/types.ts";
import type { LessonPattern } from "../lib/ted/lessons.ts";

const at = Date.UTC(2026, 8, 29);
const session = { id: crypto.randomUUID(), mode: "timed" as const, contentVersion: QUESTION_SET_VERSION,
  questionIds: ["n2-grammar-001", "n2-grammar-002"], startedAt: at, deadline: at + 60000, category: "all" as const };
function event(kind: StudyEvent["kind"], entity: string, value: unknown, offset: number, seq?: number): StudyEvent {
  return { id: crypto.randomUUID(), kind, entity, value, at: at + offset, ...(seq ? { seq } : {}) };
}
const begin = () => event("training_session", `session:${session.id}`, JSON.stringify(session), 0, 1);
const answer = (questionId: string, offset: number, seq: number) => event("practice", `practice:${questionId}`,
  JSON.stringify({ questionId, sessionId: session.id, mode: "timed", category: "grammar", choice: 1,
    correct: true, elapsedSeconds: 4 }), offset, seq);
const card = { id: `listen:${crypto.randomUUID()}`, articleId: "ted-new-004", articleTitle: "测试文章",
  label: "难句", start: 12.5, end: 19.25, japanese: "もう一度聞きましょう。", chinese: "再听一次吧。",
  sourceLoopId: `tedloop:${crypto.randomUUID()}`, paragraphId: "p1" };

test("listening cards survive sync, source-loop deletion and FSRS replay", () => {
  const created = event("listening_card", card.id, JSON.stringify(card), 1);
  const enrolled = event("enroll", card.id, true, 2);
  const reviewed = { ...event("review", card.id, 3, 3000), base: null };
  for (const item of [created, enrolled, reviewed]) assert.equal(eventSchema.safeParse(item).success, true);
  const cache = mergeCache({ events: [], pending: [created, enrolled, reviewed], cursor: 0 },
    [{ ...created, seq: 1 }, { ...enrolled, seq: 2 }], 2);
  const model = rebuild([...combineEvents(cache.events, cache.pending), event("ted_loop", card.sourceLoopId, null, 4000)]);
  assert.deepEqual(model.listeningCards[card.id], card);
  assert.equal(model.cards[card.id].card.reps, 1);
  assert.equal(model.cards[card.id].enrolled, true);
  assert.equal(model.tedLoops[card.sourceLoopId], null);
  assert.equal(model.reviews.length, 1);
});

test("listening card validation rejects invalid ranges, missing text and unsafe sources", () => {
  for (const patch of [{ start: -1 }, { end: 12.5 }, { end: 12.6 }, { end: 700 }, { japanese: " " },
    { chinese: "" }, { articleId: "../../secret" }, { sourceLoopId: "bad" }, { src: "https://example.com" }])
    assert.equal(listeningCardSchema.safeParse({ ...card, ...patch }).success, false, JSON.stringify(patch));
  const wrongEntity = event("listening_card", `listen:${crypto.randomUUID()}`, JSON.stringify(card), 0);
  assert.equal(eventSchema.safeParse(wrongEntity).success, false);
  assert.deepEqual(rebuild([wrongEntity]).listeningCards, {});
});

test("training sessions freeze a safe content version, unique queue and bounded deadline", () => {
  assert.equal(trainingSessionSchema.safeParse(session).success, true);
  for (const patch of [{ contentVersion: "../private" }, { questionIds: [session.questionIds[0], session.questionIds[0]] },
    { deadline: at }, { deadline: at + 4 * 3600000 }, { contentVersion: undefined }])
    assert.equal(trainingSessionSchema.safeParse({ ...session, ...patch }).success, false);
});

test("an offline answer submitted before finish is accepted even when it syncs later", () => {
  const finished = event("training_finish", `session:${session.id}`, "finished", 30000, 2);
  const lateSync = answer(session.questionIds[0], 10000, 3);
  const tooLate = answer(session.questionIds[1], 31000, 4);
  const model = rebuild([lateSync, tooLate, finished, begin()]);
  assert.deepEqual(model.practice.map(a => a.questionId), [session.questionIds[0]]);
  assert.equal(model.trainingConflicts, 1);
  assert.equal(model.trainingSessions[session.id].endedAt, at + 30000);
});

test("two devices answering one question count once, while another session remains independent", () => {
  const first = answer(session.questionIds[0], 5000, 2), duplicate = answer(session.questionIds[0], 6000, 3);
  const second = { ...session, id: crypto.randomUUID() };
  const other = answer(session.questionIds[0], 8000, 5);
  other.value = JSON.stringify({ ...JSON.parse(String(other.value)), sessionId: second.id });
  const model = rebuild([other, duplicate, first, begin(), event("training_session", `session:${second.id}`, JSON.stringify(second), 0, 4)]);
  assert.equal(model.practice.length, 2);
  assert.equal(model.trainingConflicts, 1);
  assert.equal(sessionAnswers(model.trainingSessions[session.id], model.practice).length, 1);
  assert.equal(sessionFinished(model.trainingSessions[session.id], model.practice, at + 60000), true);
});

test("training replay rejects wrong queues, unknown sessions and expired answers", () => {
  const wrong = answer("n2-grammar-999", 1000, 2), expired = answer(session.questionIds[0], 60001, 3);
  const unknown = answer(session.questionIds[1], 1000, 4);
  unknown.value = JSON.stringify({ ...JSON.parse(String(unknown.value)), sessionId: crypto.randomUUID() });
  const model = rebuild([begin(), wrong, expired, unknown]);
  assert.equal(model.practice.length, 0);
  assert.equal(model.trainingConflicts, 3);
});

const paragraph: TedParagraph = { id: "p1", page: 1, japanese: "日本について調べます。", chinese: "调查日本的情况。" };
const lesson: TedContextLesson = { id: "test-context", articleId: "ted-new-004", paragraphId: "p1", kind: "grammar",
  surface: "について", start: 2, end: 6, expression: "について", reading: "について", meaning: "关于",
  connection: "名词＋について", usage: "表示调查的对象", caution: "例句为原创。", example: { japanese: "町について調べます。", chinese: "调查这个城镇。" },
  grammarIds: [], references: [{ title: "原始PDF", page: 1 }], reviewStatus: "context-reviewed" };
const article = { id: "ted-new-004", paragraphs: [paragraph], contextLessons: [lesson] } as TedArticle;
test("old audio regions follow only unambiguous paragraph corrections", () => {
  const changed = { ...article, paragraphs: [paragraph,
    { ...paragraph, id: "old-one", displayHidden: true, sourceMappedTo: ["p1"] },
    { ...paragraph, id: "old-many", displayHidden: true, sourceMappedTo: ["p1", "p2"] }] };
  assert.equal(visibleParagraph(changed, "old-one")?.id, "p1");
  assert.equal(visibleParagraph(changed, "old-many"), undefined);
  assert.equal(visibleParagraph(changed, "missing"), undefined);
});
test("reviewed contextual explanations override generic matches only at verified text offsets", () => {
  const patterns: LessonPattern[] = JSON.parse(readFileSync("public/data/ted-patterns.json", "utf8"));
  const matches = articleMatches(article, paragraph, patterns, "grammar");
  assert.equal(matches.length, 1);
  assert.equal(matches[0].lesson.id, lesson.id);
  assert.equal(matches[0].lesson.contextReviewed, true);
  for (const invalid of [{ start: 1 }, { end: 999 }, { surface: "という" }, { articleId: "ted-new-005" }, { paragraphId: "missing" }])
    assert.equal(reviewedMatches({ ...article, contextLessons: [{ ...lesson, ...invalid }] }, paragraph).length, 0);
  assert.equal(articleMatches(article, { ...paragraph, displayHidden: true }, patterns, "grammar").length, 0);
});

test("curriculum covers all N3/N2 entries once as new material with 120-minute days", () => {
  const curriculum = JSON.parse(readFileSync("public/data/n2-weekly-curriculum.json", "utf8"));
  const corpus = JSON.parse(readFileSync("public/data/grammar.json", "utf8")).entries as { id: string; level: string }[];
  const expected = corpus.filter(e => ["N3", "N2"].includes(e.level)).map(e => e.id);
  const planned = curriculum.weeks.flatMap((w: { newGrammarIds: string[] }) => w.newGrammarIds);
  assert.equal(curriculum.weeks.length, 40);
  assert.equal(planned.length, 406);
  assert.deepEqual(new Set(planned), new Set(expected));
  const known = new Set(corpus.map(e => e.id));
  for (const week of curriculum.weeks) {
    for (const id of [...week.grammarIds, ...week.prerequisiteGrammarIds]) assert.ok(known.has(id));
    for (const day of week.dailyPlans) assert.equal(Object.values(day.minutes).reduce((n: number, x) => n + Number(x), 0), 120);
  }
});

test("assessment versions retain their exact question snapshot and diagnostics require a complete sample", () => {
  const questions: Question[] = JSON.parse(readFileSync("public/data/n2-questions.json", "utf8"));
  const frozen = JSON.parse(readFileSync(`public/data/question-sets/${QUESTION_SET_VERSION}.json`, "utf8"));
  assert.deepEqual(questions, frozen);
  const diagnostic = questions.filter(q => q.purpose === "diagnostic");
  assert.equal(diagnostic.length, 24);
  const answers: PracticeRecord[] = diagnostic.map(q => ({ id: crypto.randomUUID(), questionId: q.id,
    category: q.category, mode: "diagnostic", at, choice: q.answerIndex, correct: true, elapsedSeconds: 1 }));
  assert.equal(diagnosticAdvice(questions, answers.slice(0, 23)).phase, "incomplete");
  assert.equal(diagnosticAdvice(questions, answers).phase, "n2");
  assert.equal(diagnosticAdvice(questions, answers.map(a => ({ ...a, correct: false }))).phase, "foundation");
});
