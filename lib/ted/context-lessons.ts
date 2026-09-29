import { matchLessons, type LessonMatch, type LessonPattern } from "./lessons.ts";
import type { TedArticle, TedParagraph } from "./types.ts";

export function reviewedMatches(article: TedArticle, paragraph: TedParagraph, kind?: "phrase" | "grammar"): LessonMatch[] {
  if (paragraph.displayHidden) return [];
  return (article.contextLessons ?? []).filter(item => item.reviewStatus === "context-reviewed" && item.articleId === article.id && item.paragraphId === paragraph.id &&
    (!kind || item.kind === kind) && Number.isInteger(item.start) && Number.isInteger(item.end) &&
    item.start >= 0 && item.end > item.start && item.end <= paragraph.japanese.length && paragraph.japanese.slice(item.start, item.end) === item.surface)
    .map(item => ({ start: item.start, end: item.end, surface: item.surface,
      lesson: { id: item.id, kind: item.kind, title: item.expression, reading: item.reading,
        meaning: item.meaning, connection: item.connection, usage: item.usage, caution: item.caution,
        example: item.example, grammarIds: item.grammarIds, patterns: [], contextReviewed: true,
        references: item.references.map(r => ({ title: r.title,
          url: r.url ?? `/api/ted/media?id=${article.id}&kind=pdf#page=${r.page ?? paragraph.page}` })) } }));
}
export function articleMatches(article: TedArticle, paragraph: TedParagraph, patterns: LessonPattern[], kind: "phrase" | "grammar") {
  if (paragraph.displayHidden) return [];
  const reviewed = reviewedMatches(article, paragraph, kind);
  const candidates = matchLessons(paragraph.japanese, patterns, kind)
    .filter(hit => !reviewed.some(r => hit.start < r.end && r.start < hit.end));
  const sorted = [...reviewed, ...candidates].sort((a, b) => a.start - b.start || b.end - a.end);
  const selected: LessonMatch[] = [];
  for (const hit of sorted) if (!selected.length || hit.start >= selected[selected.length - 1].end) selected.push(hit);
  return selected;
}
