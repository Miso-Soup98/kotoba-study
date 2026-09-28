export type Category = "grammar" | "vocabulary" | "reading" | "listening";
export type Question = {
  id: string;
  category: Category;
  title: string;
  prompt: string;
  passage?: string;
  transcript?: string;
  options: string[];
  answerIndex: number;
  explanation: string;
  grammarIds: string[];
  level: "N4" | "N3" | "N2";
  skill: string;
  purpose?: "diagnostic" | "practice" | "checkpoint";
  skillTags?: string[];
  reference?: { title: string; url: string };
};
export type PracticeAttempt = {
  questionId: string;
  choice: number;
  correct: boolean;
  category: Category;
  elapsedSeconds: number;
  mode: "practice" | "timed" | "mistakes" | "diagnostic" | "checkpoint";
  sessionId?: string;
};
export type PracticeRecord = PracticeAttempt & { id: string; at: number };
export const categoryLabels: Record<Category, string> = {
  grammar: "语法",
  vocabulary: "词汇",
  reading: "阅读",
  listening: "听力",
};
