import corrections from "./saved-word-corrections.json" with { type: "json" };
import { vocabularyWordSchema, type VocabularyWord } from "./schema.ts";

// A small, version-bound patch table; no full catalog fetch or event rewrite.
// Original snapshots stay in the event log and all scheduling stays untouched.
type Correction = { sourceVersion: string; text: string; reading: string; set: Partial<VocabularyWord> };
const byId = corrections.words as Record<string, Correction[]>;
export function correctedVocabularySnapshot(word: VocabularyWord): VocabularyWord {
  if (!corrections.sourceVersions.includes(word.version)) return word;
  const correction = byId[word.id]?.find(item => item.sourceVersion === word.version);
  if (!correction || correction.text !== word.text || correction.reading !== word.reading) return word;
  return vocabularyWordSchema.parse({ ...word, ...correction.set, version: corrections.version });
}
