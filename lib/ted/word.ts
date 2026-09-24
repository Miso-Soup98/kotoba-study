import type { Word } from "../study/types.ts";
import type { TedArticle, TedParagraph, TedToken } from "./types.ts";
import { lookupWord } from "./lookup.ts";
import { tedWordSchema } from "./validation.ts";

/** Keep a headword with its own reading; an unknown inflection stays in surface form. */
export async function makeTedWord(
  article: TedArticle,
  paragraph: TedParagraph,
  token: TedToken,
): Promise<Word> {
  const { gloss } = lookupWord(article, token);
  const text = gloss?.reading ? gloss.term : token.surface;
  const reading = gloss?.reading || token.reading;
  const digest = new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(JSON.stringify([text, reading])),
    ),
  );
  const identity = Array.from(digest, (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  return tedWordSchema.parse({
    id: `tedword:${article.id}:${identity}`,
    text,
    reading,
    meaning: (gloss?.meaning || "暂未收录中文释义，请结合原文核对").slice(
      0,
      2000,
    ),
    source: article.id,
    original: token.surface,
    usage: [token.lemma && `原形：${token.lemma}`, token.pos, gloss?.usage]
      .filter(Boolean)
      .join("；")
      .slice(0, 1000),
    example: {
      japanese: paragraph.japanese.slice(0, 1000),
      japanese_annotated: paragraph.japanese.slice(0, 1000),
      japanese_reading: paragraph.japanese.slice(0, 1000),
      chinese: paragraph.chinese.slice(0, 1000),
    },
  });
}
