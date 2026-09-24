import type { Entry, Word } from "./types";

const studyDayFormatter = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function vocabulary(entry: Entry): Word[] {
  return entry.vocabulary
    .split(/[；;]/)
    .map((s) => s.trim().replace(/[。.]$/, ""))
    .filter(Boolean)
    .map((original, i) => {
      const colon = original.search(/[：:]/);
      const head = colon < 0 ? original : original.slice(0, colon);
      return {
        id: `word:${entry.id}:${i}`,
        text: head.replace(/（[^）]*）/g, ""),
        reading: head.replace(/([\p{Script=Han}々]+)（([^）]+)）/gu, "$2"),
        meaning: colon < 0 ? "请参考原文" : original.slice(colon + 1),
        source: entry.id,
        original,
      };
    });
}
export function studyDay(date: Date | number = Date.now()): string {
  return studyDayFormatter.format(date);
}
export const tasks = [
  {
    id: "review",
    label: "到期复习",
    minutes: 25,
    description: "语法和生词，先回忆再翻面",
    icon: "cards",
  },
  {
    id: "grammar",
    label: "学习新语法",
    minutes: 25,
    description: "理解接续，再读两个例句",
    icon: "book",
  },
  {
    id: "reading",
    label: "阅读练习",
    minutes: 30,
    description: "读一篇材料，记录难句和生词",
    icon: "text",
  },
  {
    id: "listening",
    label: "听力与跟读",
    minutes: 30,
    description: "完整听一段，再回听难句",
    icon: "audio",
  },
  {
    id: "reflection",
    label: "回顾与表达",
    minutes: 10,
    description: "用今天的语法写一句话",
    icon: "pen",
  },
];
