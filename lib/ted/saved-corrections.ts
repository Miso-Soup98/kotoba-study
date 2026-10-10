import type { Word } from "../study/types.ts";
import { listeningCardSchema, type ListeningCard } from "../study/listening-card.ts";
import type { TedArticle, TedCorrection, TedParagraph } from "./types.ts";
import { tedWordSchema } from "./validation.ts";

export type TedSavedUpdate = {
  kind: "ted_word" | "listening_card";
  entity: string;
  value: string;
};

// A saved card has no source revision. Only a complete old value, with a unique
// correction that reaches the currently displayed source, is safe to replace.
function paragraphTarget(article: TedArticle, correction: TedCorrection): TedParagraph | undefined {
  const { paragraphId, original } = correction;
  if (!paragraphId || typeof original.japanese !== "string" || typeof original.chinese !== "string") return;
  const paragraph = article.paragraphs.find(p => p.id === paragraphId);
  if (!paragraph || paragraph.displayHidden || paragraph.sourceMappedTo?.length ||
    article.paragraphs.some(p => p.sourceMappedTo?.includes(paragraphId))) return;
  if (paragraph.japanese !== (correction.japanese ?? original.japanese) ||
    paragraph.chinese !== (correction.chinese ?? original.chinese)) return;
  return paragraph;
}

function correctedWord(article: TedArticle, saved: Word): Word {
  if (saved.source !== article.id || !saved.id.startsWith(`tedword:${article.id}:`) ||
    saved.id.includes(":lesson:")) return saved;
  const corrections = article.corrections ?? [];
  let next = saved;
  const glossMatches = corrections.filter(c => c.kind === "glossary" &&
    typeof c.original.term === "string" && !!c.original.reading &&
    typeof c.original.meaning === "string" && saved.text === c.original.term &&
    saved.reading === c.original.reading && saved.meaning === c.original.meaning);
  if (glossMatches.length === 1) {
    const c = glossMatches[0];
    const text = c.correctedTerm ?? saved.text;
    const reading = c.correctedReading ?? saved.reading;
    const meaning = c.correctedMeaning ?? saved.meaning;
    const usageChanged = c.correctedUsage !== undefined && c.correctedUsage !== c.original.usage;
    // makeTedWord prefixes usage with token information. Do not guess where an
    // old usage ends, or overwrite a user's own addition to it.
    const usageSafe = !usageChanged || (typeof c.original.usage === "string" && saved.usage === c.original.usage);
    const targets = article.glossary.filter(g => !g.displayHidden && !g.uncertainTerm &&
      g.term === text && g.reading === reading && g.meaning === meaning &&
      (!usageChanged || g.usage === c.correctedUsage));
    if (usageSafe && targets.length === 1) next = { ...saved, text, reading, meaning,
      ...(usageChanged ? { usage: c.correctedUsage } : {}) };
  }
  const example = saved.example;
  if (example && example.japanese === example.japanese_annotated &&
    example.japanese === example.japanese_reading) {
    const matches = corrections.filter(c => c.kind === "paragraph" &&
      c.original.japanese === example.japanese && c.original.chinese === example.chinese);
    if (matches.length === 1) {
      const target = paragraphTarget(article, matches[0]);
      // No prefix matching: earlier cards may contain a truncated paragraph.
      if (target) next = { ...next, example: { japanese: target.japanese,
        japanese_annotated: target.japanese, japanese_reading: target.japanese, chinese: target.chinese } };
    }
  }
  return next;
}

function correctedListening(article: TedArticle, saved: ListeningCard): ListeningCard {
  if (saved.articleId !== article.id || !saved.paragraphId) return saved;
  const matches = (article.corrections ?? []).filter(c => c.kind === "paragraph" &&
    c.paragraphId === saved.paragraphId && c.original.japanese === saved.japanese &&
    c.original.chinese === saved.chinese);
  if (matches.length !== 1) return saved;
  const target = paragraphTarget(article, matches[0]);
  // A change to Japanese could invalidate the chosen audio span. Translation
  // only updates cannot move that span or expand a hand-selected excerpt.
  if (!target || target.japanese !== saved.japanese) return saved;
  return { ...saved, chinese: target.chinese };
}

/**
 * Pure, article-local proposal. Does not fetch content or mutate study state.
 * Guards protect edits present in the supplied snapshot. TED content events
 * currently use last-write-wins; appendBatch has no compare-and-swap for edits
 * arriving concurrently from another device after this proposal is computed.
 */
export function tedSavedCardUpdates(article: TedArticle, words: Record<string, Word>,
  listeningCards: Record<string, ListeningCard>): TedSavedUpdate[] {
  if (!article.corrections?.length) return [];
  const updates: TedSavedUpdate[] = [];
  for (const [id, saved] of Object.entries(words)) {
    if (saved.id !== id) continue;
    const next = correctedWord(article, saved);
    const value = JSON.stringify(next);
    if (value !== JSON.stringify(saved) && value.length <= 12000 && tedWordSchema.safeParse(next).success)
      updates.push({ kind: "ted_word", entity: id, value });
  }
  for (const [id, saved] of Object.entries(listeningCards)) {
    if (saved.id !== id) continue;
    const next = correctedListening(article, saved);
    const value = JSON.stringify(next);
    if (value !== JSON.stringify(saved) && value.length <= 12000 && listeningCardSchema.safeParse(next).success)
      updates.push({ kind: "listening_card", entity: id, value });
  }
  return updates;
}
