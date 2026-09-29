import type { TedArticle, TedParagraph } from "./types.ts";

// Retain old loop timestamps and identities; only follow unambiguous text mappings.
export function visibleParagraph(article: TedArticle, id?: string): TedParagraph | undefined {
  if (!id) return undefined;
  const paragraph = article.paragraphs.find(p => p.id === id);
  if (!paragraph?.displayHidden) return paragraph;
  const targets = paragraph.sourceMappedTo ?? [];
  if (targets.length !== 1) return undefined;
  return article.paragraphs.find(p => p.id === targets[0] && !p.displayHidden);
}
