import type { TedArticle, TedToken } from "./types.ts";
export function lookupWord(article: TedArticle, token: TedToken) {
  const correction = article.corrections?.find(
    (c) =>
      c.kind === "glossary" &&
      [token.lemma, token.surface].includes(c.correctedTerm || c.term || ""),
  );
  if (correction) {
    const checked = article.glossary.find(
      (g) => g.term === (correction.correctedTerm || correction.term),
    );
    if (checked)
      return {
        gloss: checked,
        source: "已订正的本文词义 · 依据见本篇订正记录",
      };
  }
  const selected = token.dictionaryId
    ? article.dictionary?.[token.dictionaryId]
    : undefined;
  if (selected)
    return { gloss: selected, source: selected.source || "词典候选义项" };
  const normalized = (text: string) =>
    text
      .normalize("NFKC")
      .replace(/\s+/g, "")
      .replace(/[（(][ぁ-んァ-ヶー]+[）)]/g, "");
  const local = article.glossary.find(
    (g) =>
      (!g.reading || g.reading === token.reading) &&
      [token.lemma, token.surface].some(
        (t) => normalized(g.term) === normalized(t),
      ),
  );
  const dictionary = token.dictionaryId
    ? article.dictionary?.[token.dictionaryId]
    : undefined;
  return {
    gloss: local ?? dictionary,
    source: local ? "本篇PDF词汇讲解" : (dictionary?.source ?? "自动分词"),
  };
}
