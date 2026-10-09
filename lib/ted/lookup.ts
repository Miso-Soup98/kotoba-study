import type { TedArticle, TedToken, TedGloss } from "./types.ts";
function usable(gloss?: TedGloss): gloss is TedGloss {
  return !!gloss && !gloss.displayHidden && !gloss.uncertainTerm && !!gloss.meaning.trim() &&
    !/Template:|模板[:：]|以下.{0,12}(?:尚未|未創建|未创建)|=+\s*(?:日语|日語|日本語)\s*=+|^【[^】]+】$|^\[[^\]]+\]$/i.test(gloss.meaning.trim());
}
export function lookupWord(article: TedArticle, token: TedToken) {
  const correction = article.corrections?.find(
    (c) =>
      c.kind === "glossary" &&
      [token.lemma, token.surface].includes(c.correctedTerm || c.term || ""),
  );
  if (correction) {
    const checked = article.glossary.find(
      (g) => usable(g) && g.term === (correction.correctedTerm || correction.term),
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
  if (usable(selected))
    return { gloss: selected, source: selected.source || "词典候选义项" };
  const normalized = (text: string) =>
    text
      .normalize("NFKC")
      .replace(/\s+/g, "")
      .replace(/[（(][ぁ-んァ-ヶー]+[）)]/g, "");
  const local = article.glossary.find(
    (g) =>
      usable(g) &&
      (!g.reading || g.reading === token.reading) &&
      [token.lemma, token.surface].some(
        (t) => normalized(g.term) === normalized(t),
      ),
  );
  return {
    gloss: local,
    source: local ? "本篇PDF词汇讲解" : "自动分词；未找到可用释义",
  };
}
