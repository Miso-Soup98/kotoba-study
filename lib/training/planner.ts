import {
  categoryLabels,
  type Category,
  type PracticeRecord,
  type Question,
} from "./types.ts";
import { tasks } from "../study/content.ts";
export function latestAnswers(records: PracticeRecord[]) {
  const latest = new Map<string, PracticeRecord>();
  for (const record of records) latest.set(record.questionId, record);
  return latest;
}
export function trainingSummary(records: PracticeRecord[]) {
  const recent = records.slice(-60);
  const categories = (Object.keys(categoryLabels) as Category[]).map(
    (category) => {
      const selected = recent.filter((r) => r.category === category);
      return {
        category,
        total: selected.length,
        correct: selected.filter((r) => r.correct).length,
      };
    },
  );
  const weakest = categories
    .filter((c) => c.total >= 3)
    .sort((a, b) => a.correct / a.total - b.correct / b.total)[0];
  return {
    categories,
    weakest,
    mistakes: [...latestAnswers(records).values()].filter((r) => !r.correct),
  };
}
export function selectQuestions(
  questions: Question[],
  records: PracticeRecord[],
  category: string,
  mistakesOnly: boolean,
) {
  const latest = latestAnswers(records);
  return questions
    .filter(
      (q) =>
        (category === "all" || category === q.category) &&
        (!mistakesOnly || latest.get(q.id)?.correct === false),
    )
    .sort((a, b) => {
      const rank = (id: string) =>
        latest.get(id)?.correct === false ? 0 : latest.has(id) ? 2 : 1;
      return (
        rank(a.id) - rank(b.id) ||
        (latest.get(a.id)?.at ?? 0) - (latest.get(b.id)?.at ?? 0)
      );
    });
}
export function adaptivePlan(
  records: PracticeRecord[],
  dueCount: number,
  now = Date.now(),
) {
  const summary = trainingSummary(records);
  const plan = tasks.map((t) => ({ ...t }));
  plan[1].label = "语法与词汇训练";
  plan[1].description = "完成专项练习，结合解析补充语法";
  if (dueCount >= 30) {
    plan[0].minutes += 10;
    plan[1].minutes -= 10;
  }
  const weak = summary.weakest;
  if (weak && weak.correct / weak.total < 0.8) {
    const target =
      weak.category === "listening" ? 3 : weak.category === "reading" ? 2 : 1;
    const donor = target === 2 ? 3 : 2;
    plan[target].minutes += 10;
    plan[donor].minutes -= 10;
    plan[target].description =
      `优先练习${categoryLabels[weak.category]}错题，再完成新题`;
  }
  const days = Math.max(0, Math.ceil((Date.UTC(2027, 6, 1) - now) / 86400000));
  return {
    tasks: plan,
    days,
    phase:
      days > 180
        ? "N3 补缺与 N2 基础"
        : days > 60
          ? "N2 专项与错题巩固"
          : "限时练习与薄弱项回顾",
    reason:
      dueCount >= 30
        ? "到期卡片较多，先增加复习时间。"
        : weak && weak.correct / weak.total < 0.8
          ? `最近练习中，${categoryLabels[weak.category]}需要多分配一些时间。`
          : "练习记录还少或表现较均衡，先保持两小时的基础安排。",
  };
}
