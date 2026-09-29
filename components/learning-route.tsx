"use client";
import { useEffect, useMemo, useState } from "react";
import type { useStudy } from "@/lib/study/use-study";
import type { Entry } from "@/lib/study/types";
import type { diagnosticAdvice } from "@/lib/training/session";
import { fetchJSON } from "@/lib/study/session";
import { studyDay } from "@/lib/study/content";
import { toast } from "sonner";

type Week = {
  id: string; weekNumber: number; startDate: string; endDate: string;
  phase: string; theme: string; goals: string[];
  grammarIds: string[]; newGrammarIds: string[]; prerequisiteGrammarIds: string[];
  tedArticleIds: string[]; assessmentId: string | null;
  dailyPlans: { date: string; grammarIds: string[]; minutes: Record<string, number>; task: string }[];
};
type Curriculum = { title: string; startDate: string; endDate: string; weeks: Week[] };
const phaseLabels: Record<string, string> = { foundation: "N4补缺", bridge: "N3衔接", n2: "N2系统学习", review: "综合复盘", mock: "原创阶段检测" };
export function LearningRoute({ study, entries, advice, onGrammar, onDiagnostic, onPractice, onCheckpoint, disabled }: {
  study: ReturnType<typeof useStudy>; entries: Entry[];
  advice: ReturnType<typeof diagnosticAdvice> | null;
  onGrammar: (id: string) => void; onDiagnostic: () => void;
  onPractice: () => void; onCheckpoint: () => void; disabled: boolean;
}) {
  const [curriculum, setCurriculum] = useState<Curriculum | null>(null), [error, setError] = useState("");
  const [retry, setRetry] = useState(0), [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    const request = new AbortController(); setError("");
    fetchJSON<Curriculum>("/data/n2-weekly-curriculum.json", 12000, request.signal).then(setCurriculum)
      .catch(() => { if (!request.signal.aborted) setError("课程暂未加载，联网后可重试。"); });
    return () => request.abort();
  }, [retry]);
  const byId = useMemo(() => new Map(entries.map(e => [e.id, e])), [entries]);
  if (error) return <section className="panel"><p role="alert">{error}</p><button className="secondary" onClick={() => setRetry(v => v + 1)}>重新加载课程</button></section>;
  if (!curriculum) return <p role="status">正在打开每周课程…</p>;
  const today = studyDay();
  const scheduled = curriculum.weeks.find(w => w.startDate <= today && w.endDate >= today)
    ?? (today < curriculum.startDate ? curriculum.weeks[0] : curriculum.weeks[curriculum.weeks.length - 1]);
  const week = curriculum.weeks.find(w => w.id === picked) ?? scheduled;
  const plannedIds = [...new Set(curriculum.weeks.flatMap(w => w.newGrammarIds))];
  const done = plannedIds.filter(id => study.model.tasks[`course:${id}`]).length;
  const completed = week.grammarIds.filter(id => study.model.tasks[`course:${id}`]).length;
  async function complete(id: string) {
    if (busy) return;
    setBusy(id);
    try {
      const isComplete = study.model.tasks[`course:${id}`];
      await study.appendBatch([
        { kind: "task", entity: `course:${id}`, value: !isComplete },
        ...(!isComplete && !study.model.cards[id]?.enrolled ? [{ kind: "enroll" as const, entity: id, value: true }] : []),
      ]);
      toast.success(isComplete ? "已取消学习标记，原有复习记录保留" : "已记录本课学习，并加入间隔复习");
    } catch (e) { toast.error(e instanceof Error ? e.message : "学习记录未保存"); }
    finally { setBusy(null); }
  }
  return <>
    <section className="panel course-overview">
      <div><span className="eyebrow">2027年7月目标 · 每天120分钟</span><h2>每周知道学什么，每次知道从哪里继续。</h2>
        <p>40周课程覆盖现有教材183条N3和223条N2，先补N4，再学习、练习与复盘。</p></div>
      <div className="course-progress"><strong>{done}<small> / {plannedIds.length}</small></strong><span>N3／N2条目已学</span>
        <progress value={done} max={plannedIds.length} aria-label="课程已学进度" /></div>
    </section>
    <section className="panel course-diagnostic"><div><h2>{advice ? "你的学习起点建议" : "先找准学习起点"}</h2>
      <p>{advice?.route ?? "用24道原创题检查N4基础、N3衔接和N2内容，再决定从哪一阶段开始。"}</p>
      <p className="footnote">起点建议来自小样本练习，不是等级认证；课程日期是安排，可按自己的掌握情况选周。</p></div>
      <div className="button-row"><button className="secondary" disabled={disabled || !study.session} onClick={onDiagnostic}>{advice ? "重新测评" : "开始起点测评"}</button>
        {advice && advice.phase !== "incomplete" && <button className="primary" onClick={() => setPicked(curriculum.weeks.find(w => w.phase === advice.phase)?.id ?? week.id)}>查看建议起点</button>}</div>
    </section>
    <section className="panel course-week">
      <div className="section-heading"><label className="course-select">选择学习周<select value={week.id} onChange={e => setPicked(e.target.value)}>
        {curriculum.weeks.map(w => <option key={w.id} value={w.id}>第{w.weekNumber}周 · {phaseLabels[w.phase] ?? w.phase} · {w.startDate}</option>)}
      </select></label><button className="text-button" onClick={() => setPicked(scheduled.id)}>回到本周</button></div>
      <span className="level-badge">{phaseLabels[week.phase] ?? week.phase}</span>
      <h2>第{week.weekNumber}周 · {week.theme}</h2><p className="muted">{week.startDate}—{week.endDate} · 本周条目已学 {completed}/{week.grammarIds.length}</p>
      <ul>{week.goals.map(goal => <li key={goal}>{goal}</li>)}</ul>
      <div className="course-lessons">{week.grammarIds.map(id => { const entry = byId.get(id); return <div className="course-item" key={id}>
        <button className="course-lesson-title" onClick={() => onGrammar(id)}><small>{id} · {week.newGrammarIds.includes(id) ? "新课" : "复盘"}</small><span>{entry?.title ?? id}</span></button>
        <button className={study.model.tasks[`course:${id}`] ? "secondary compact" : "primary compact"}
          disabled={!!busy || !study.session} onClick={() => void complete(id)}>{busy === id ? "保存中…" : study.model.tasks[`course:${id}`] ? "已学 · 可撤回" : "已学并加入复习"}</button>
      </div>; })}</div>
      {!!week.prerequisiteGrammarIds.length && <details><summary>需要时回顾这些基础点</summary><div className="button-row">
        {week.prerequisiteGrammarIds.map(id => <button className="text-button" key={id} onClick={() => onGrammar(id)}>{id} {byId.get(id)?.title}</button>)}</div></details>}
      <details className="course-daily"><summary>展开每天的安排</summary>{week.dailyPlans.map(day => <div key={day.date}>
        <strong>{day.date}{day.date === today ? " · 今天" : ""}</strong><p>{day.task}</p>
        <div className="button-row">{day.grammarIds.map(id => <button className="text-button" key={id} onClick={() => onGrammar(id)}>{id}</button>)}</div>
        <p className="footnote">复习 {day.minutes.fsrs} 分钟 · 语法 {day.minutes.grammar} 分钟 · 阅读 {day.minutes.reading} 分钟 · 听力 {day.minutes.listening} 分钟 · 练习与笔记 {day.minutes.practiceAndNotes} 分钟</p>
      </div>)}</details>
      <div className="course-ted"><h3>本周精读精听</h3><p>同一篇可以反复学：盲听、核对文字、标记难句，再将片段加入听力复习。</p>
        <div className="button-row">{week.tedArticleIds.map(id => <button className="secondary" key={id} onClick={() => onGrammar(id)}>打开{id.includes("new") ? "日刊精读" : "TED演讲"} {id.slice(-3)}</button>)}</div></div>
      <div className="button-row"><button className="primary" onClick={onPractice}>练习与错题回顾</button>
        {week.assessmentId && <button className="secondary" disabled={disabled || !study.session} onClick={week.weekNumber === 1 ? onDiagnostic : onCheckpoint}>{week.weekNumber === 1 ? "检查学习起点" : "做原创阶段检测"}</button>}</div>
      <p className="footnote">当前提供一套24题阶段检测，重复使用不代表不同的模拟卷。“已学”是完成标记，掌握情况需要结合后续复习和练习判断。</p>
    </section>
  </>;
}
