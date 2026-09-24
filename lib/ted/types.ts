export type TedToken = {
  surface: string;
  lemma: string;
  reading: string;
  pos: string;
  dictionaryId?: string;
};
export type TedExample = { japanese: string; chinese: string };
export type TedGloss = {
  term: string;
  reading: string;
  meaning: string;
  usage: string;
  examples: TedExample[];
  page: number;
  source?: string;
};
export type TedParagraph = {
  id: string;
  page: number;
  japanese: string;
  chinese: string;
  tokens?: TedToken[];
};
export type TedArticle = {
  id: string;
  title: string;
  collection: "new" | "old";
  number: number;
  pages: number;
  paragraphs: TedParagraph[];
  glossary: TedGloss[];
  notes: { page: number; text: string }[];
  warnings: string[];
  dictionary?: Record<string, TedGloss>;
};
export type TedSummary = {
  id: string;
  title: string;
  collection: "new" | "old";
  number: number;
  pages: number;
  paragraphCount: number;
  duration: number;
  hasAudio: boolean;
  hasPdf: boolean;
  warnings: string[];
};
export type TedLoop = {
  articleId: string;
  label: string;
  color: number;
  start: number;
  end: number;
  paragraphId?: string;
};
export const LOOP_COLORS = [
  "#c43d50",
  "#aa6600",
  "#267f57",
  "#2569b5",
  "#8152a2",
  "#aa437c",
];
export function formatTime(seconds: number) {
  const time = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  return `${Math.floor(time / 60)}:${Math.floor(time % 60)
    .toString()
    .padStart(2, "0")}`;
}
