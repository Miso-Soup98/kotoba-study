export type Example = {
  japanese: string;
  japanese_annotated: string;
  japanese_reading: string;
  chinese: string;
};
export type Entry = {
  id: string;
  level: string;
  priority: string;
  pdf_page: number;
  title: string;
  meaning: string;
  usage: string;
  caution: string;
  vocabulary: string;
  examples: Example[];
};
export type Word = {
  id: string;
  text: string;
  reading: string;
  meaning: string;
  source: string;
  original: string;
  usage?: string;
  example?: Example;
};
export type EventKind =
  | "enroll"
  | "bookmark"
  | "note"
  | "review"
  | "task"
  | "position"
  | "setting"
  | "ted_loop"
  | "ted_word"
  | "ted_progress"
  | "practice";
export type StudyEvent = {
  id: string;
  kind: EventKind;
  entity: string;
  value: unknown;
  at: number;
  base?: string | null;
  resolves?: string[];
  seq?: number;
};
export type Cache = {
  events: StudyEvent[];
  pending: StudyEvent[];
  cursor: number;
};
export type Session = { userId: string; displayName: string };
