import type { Word } from "../study/types.ts";
import type { TedParagraph } from "./types.ts";
import { tedWordSchema } from "./validation.ts";
export type LessonPattern = {
  id: string;
  kind: "phrase" | "grammar";
  title: string;
  reading: string;
  meaning: string;
  connection: string;
  usage: string;
  caution: string;
  example: { japanese: string; chinese: string };
  patterns: string[];
  grammarIds: string[];
  references: { title: string; url: string }[];
};
export type LessonMatch = {
  start: number;
  end: number;
  surface: string;
  lesson: LessonPattern;
};
export function matchLessons(
  text: string,
  patterns: LessonPattern[],
  kind?: LessonPattern["kind"],
): LessonMatch[] {
  const found: LessonMatch[] = [];
  for (const lesson of patterns) {
    if (kind && lesson.kind !== kind) continue;
    for (const source of lesson.patterns) {
      const regex = new RegExp(source, "gu");
      let result: RegExpExecArray | null;
      while ((result = regex.exec(text))) {
        if (!result[0]) {
          regex.lastIndex++;
          continue;
        }
        found.push({
          start: result.index,
          end: result.index + result[0].length,
          surface: result[0],
          lesson,
        });
        if (found.length >= 150) break;
      }
      if (found.length >= 150) break;
    }
    if (found.length >= 150) break;
  }
  // Prefer the longest construction at each position; no overlapping buttons.
  found.sort(
    (a, b) =>
      a.start - b.start ||
      b.end - a.end ||
      a.lesson.id.localeCompare(b.lesson.id),
  );
  const selected: LessonMatch[] = [];
  for (const hit of found)
    if (!selected.length || hit.start >= selected[selected.length - 1].end)
      selected.push(hit);
  return selected;
}
export function lessonWord(
  articleId: string,
  paragraph: TedParagraph,
  match: LessonMatch,
): Word {
  const item = match.lesson;
  return tedWordSchema.parse({
    id: `tedword:${articleId}:lesson:${item.id}`,
    text: item.title,
    reading: item.reading,
    meaning: item.meaning,
    source: articleId,
    original: match.surface,
    usage: [item.connection, item.usage, item.caution]
      .filter(Boolean)
      .join("；")
      .slice(0, 2800),
    example: {
      japanese: paragraph.japanese.slice(0, 2400),
      japanese_annotated: paragraph.japanese.slice(0, 2400),
      japanese_reading: paragraph.japanese.slice(0, 2400),
      chinese: paragraph.chinese.slice(0, 2400),
    },
  });
}
