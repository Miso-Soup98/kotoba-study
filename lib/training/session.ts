import { z } from "zod";
import type { PracticeRecord, Question } from "./types.ts";

export const trainingMode = z.enum(["practice", "timed", "mistakes", "diagnostic", "checkpoint"]);
export const QUESTION_SET_VERSION = "n2-2026-09-v05";
export const trainingSessionSchema = z.object({
  id: z.string().uuid(),
  mode: trainingMode,
  contentVersion: z.string().regex(/^[a-z0-9-]{1,64}$/),
  questionIds: z.array(z.string().regex(/^n2-[a-z0-9-]{1,70}$/)).min(1).max(100),
  startedAt: z.number().int().min(0).max(4102444800000),
  deadline: z.number().int().min(0).max(4102444800000),
  category: z.enum(["all", "grammar", "vocabulary", "reading", "listening"]),
}).strict().refine(s => new Set(s.questionIds).size === s.questionIds.length,
  "题目不能重复").refine(s => s.deadline === 0 ||
    (s.deadline > s.startedAt && s.deadline - s.startedAt <= 3 * 3600000), "限时范围无效");
export type TrainingSession = z.infer<typeof trainingSessionSchema> & {
  endedAt?: number;
  finishReason?: "finished" | "abandoned";
};
export function parseTrainingSession(value: unknown) {
  try { return trainingSessionSchema.safeParse(JSON.parse(String(value))); }
  catch { return trainingSessionSchema.safeParse(null); }
}
export function sessionAnswers(session: TrainingSession, records: PracticeRecord[]) {
  return records.filter(r => r.sessionId === session.id && session.questionIds.includes(r.questionId));
}
export function sessionFinished(session: TrainingSession, records: PracticeRecord[], now: number) {
  return !!session.endedAt || (session.deadline > 0 && now >= session.deadline) ||
    sessionAnswers(session, records).length === session.questionIds.length;
}
export function diagnosticAdvice(questions: Question[], answers: PracticeRecord[]) {
  const byId = new Map(questions.map(q => [q.id, q]));
  const levels = (["N4", "N3", "N2"] as const).map(level => {
    const items = answers.filter(a => byId.get(a.questionId)?.level === level);
    return { level, total: items.length, correct: items.filter(a => a.correct).length };
  });
  const n4 = levels[0], n3 = levels[1];
  if (answers.length < 24) return { levels, route: "先完成24题，再查看学习起点建议。", phase: "incomplete" };
  if (n4.total < 8 || n3.total < 8) return { levels, route: "样本不足，请重新完成完整诊断。", phase: "incomplete" };
  if (n4.correct < 6) return { levels, route: "先补N4基础，完成前三周课程后再推进N3。", phase: "foundation" };
  if (n3.correct < 6) return { levels, route: "从N3衔接课程开始，N4薄弱项穿插复习。", phase: "bridge" };
  return { levels, route: "可以进入N2课程，同时复习本次暴露的N3薄弱项。", phase: "n2" };
}
