import { z } from "zod";
import type { StudyEvent } from "../study/types";

export const VOCABULARY_VERSION = "v06-20261010-r2";
export const LEVELS = ["N5", "N4", "N3", "N2", "N1"] as const;
export const vocabularyId = z.string().regex(/^lex:openjlpt:[a-z0-9]{6,40}$/);
const sourceUrl = z.string().max(500).url().refine(value => value.startsWith("https://"));
export const vocabularyWordSchema = z.object({
  id: vocabularyId,
  text: z.string().min(1).max(100),
  reading: z.string().min(1).max(200),
  meaning: z.string().min(1).max(3000),
  source: vocabularyId,
  original: z.string().max(2000),
  level: z.enum(LEVELS),
  version: z.string().regex(/^v[0-9a-z-]{1,40}$/),
  meaningZh: z.string().max(3000),
  meaningEn: z.array(z.string().max(1000)).max(20),
  chineseSenses: z.array(z.string().max(1000)).max(20),
  chineseStatus: z.enum(["dictionary-candidate", "machine-assisted", "missing"]),
  learningStatus: z.enum(["ready", "needs-review"]),
  contentNote: z.string().max(1000),
  pos: z.array(z.string().max(100)).max(20),
  sentences: z.array(z.object({
    japanese: z.string().min(1).max(2000),
    english: z.string().max(2000),
    sourceUrl,
    japaneseAuthor: z.string().min(1).max(150),
    englishAuthor: z.string().min(1).max(150),
    japaneseAuthorUrl: sourceUrl,
    englishAuthorUrl: sourceUrl,
    englishSourceUrl: sourceUrl,
    licenseUrl: sourceUrl,
  }).strict()).max(2),
  sourceUrls: z.array(sourceUrl).min(1).max(8),
}).strict().refine(w => w.id === w.source)
  .refine(w => w.chineseStatus === "missing" ? !w.meaningZh : !!w.meaningZh)
  .refine(w => JSON.stringify(w).length <= 12000, "单词记录过长");
export type VocabularyWord = z.infer<typeof vocabularyWordSchema>;
export type VocabularyIndex = Pick<VocabularyWord, "id" | "text" | "reading" | "meaning" | "meaningEn" | "level" | "learningStatus"> & { shard: string };
export type VocabularyCatalog = {
  version: string;
  counts: Record<string, number>;
  chineseCounts: Record<string, number>;
  words: VocabularyIndex[];
};
export function parseVocabularyWord(value: unknown) {
  try { return vocabularyWordSchema.safeParse(typeof value === "string" ? JSON.parse(value) : value); }
  catch { return vocabularyWordSchema.safeParse(null); }
}
export function normaliseQuery(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60)).trim();
}
export function matchesVocabulary(word: VocabularyIndex, query: string) {
  return normaliseQuery(`${word.text} ${word.reading} ${word.meaning} ${word.meaningEn.join(" ")}`).includes(normaliseQuery(query));
}
type Input = Pick<StudyEvent, "kind" | "entity" | "value">;
// Only materialise words the learner actually saves. A whole catalog never becomes events.
export function vocabularyChanges(word: VocabularyWord, intent: "enroll" | "bookmark" | "known", state: {
  vocabularyWords: Record<string, VocabularyWord>;
  vocabularyKnown: Record<string, boolean>;
  bookmarks: Record<string, boolean>;
  cards: Record<string, { enrolled: boolean }>;
}): Input[] {
  const parsed = vocabularyWordSchema.parse(word);
  if (intent === "enroll" && word.learningStatus !== "ready") throw Error("本词读音或释义仍待核对，暂不加入背诵。");
  const result: Input[] = [];
  const add = (kind: Input["kind"], value: unknown) => result.push({ kind, entity: word.id, value });
  if (!state.vocabularyWords[word.id]) add("vocabulary_word", JSON.stringify(parsed));
  if (intent === "bookmark") add("bookmark", !state.bookmarks[word.id]);
  if (intent === "enroll") {
    const enabled = !state.cards[word.id]?.enrolled;
    if (enabled && state.vocabularyKnown[word.id]) add("vocabulary_known", false);
    add("enroll", enabled);
  }
  if (intent === "known") {
    const known = !state.vocabularyKnown[word.id];
    add("vocabulary_known", known);
    if (known && state.cards[word.id]?.enrolled) add("enroll", false);
  }
  return result;
}
