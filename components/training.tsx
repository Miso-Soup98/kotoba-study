"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { fetchJSON } from "@/lib/study/session";
import type { useStudy } from "@/lib/study/use-study";
import type { Entry } from "@/lib/study/types";
import { categoryLabels, type Question, type PracticeAttempt } from "@/lib/training/types";
import { selectQuestions, trainingSummary } from "@/lib/training/planner";
import { diagnosticAdvice, sessionAnswers, sessionFinished, QUESTION_SET_VERSION, type TrainingSession } from "@/lib/training/session";
import { LearningRoute } from "./learning-route";
import { toast } from "sonner";

const modeLabels: Record<PracticeAttempt["mode"], string> = {
  practice: "专项练习", timed: "限时练习", mistakes: "错题回练", diagnostic: "学习起点测评", checkpoint: "原创阶段检测",
};
function TrainingAudio({ id, onStart }: { id: string; onStart: () => void }) {
  const media = useRef<HTMLAudioElement>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const audio = media.current;
    if (audio && !audio.getAttribute("src")) audio.src = `/audio/training/${id}.mp3`;
    return () => { audio?.pause(); audio?.removeAttribute("src"); audio?.load(); };
  }, [id]);
  return <><audio ref={media} controls preload="none" src={`/audio/training/${id}.mp3`}
    onPlay={onStart} onError={() => setError(true)} aria-label="练习听力音频" />
    {error && <p role="alert">音频暂不可用，请联网重试；可先暂停本组，避免把音频问题当作答题错误。</p>}</>;
}
export function Training({ study, entries, onGrammar, onStartAudio }: {
  study: ReturnType<typeof useStudy>; entries: Entry[];
  onGrammar: (id: string) => void; onStartAudio: () => void;
}) {
  const [questions, setQuestions] = useState<Question[]>([]), [error, setError] = useState("");
  const [retry, setRetry] = useState(0), [category, setCategory] = useState("all");
  const [activeId, setActiveId] = useState<string | null>(null), [index, setIndex] = useState(0);
  const [choice, setChoice] = useState<number | null>(null), [showText, setShowText] = useState(false);
  const [busy, setBusy] = useState(false), [now, setNow] = useState(Date.now());
  const [showResult, setShowResult] = useState(false), [tab, setTab] = useState("course");
  const [archive, setArchive] = useState<{ version: string; questions: Question[] } | null>(null);
  const [archiveError, setArchiveError] = useState("");
  const [historyLimit, setHistoryLimit] = useState(12);
  const startedAt = useRef(Date.now()), saving = useRef(false);
  useEffect(() => {
    const request = new AbortController(); setError("");
    fetchJSON<Question[]>(`/data/question-sets/${QUESTION_SET_VERSION}.json`, 12000, request.signal).then(setQuestions)
      .catch(() => { if (!request.signal.aborted) setError("练习内容未能加载，请重试。"); });
    return () => request.abort();
  }, [retry]);
  const sessions = Object.values(study.model.trainingSessions).sort((a, b) => b.startedAt - a.startedAt);
  const session = activeId ? study.model.trainingSessions[activeId] : undefined;
  useEffect(() => {
    const version = session?.contentVersion;
    setArchiveError("");
    if (!version || version === QUESTION_SET_VERSION) return;
    const request = new AbortController();
    fetchJSON<Question[]>(`/data/question-sets/${version}.json`, 12000, request.signal)
      .then(items => setArchive({ version, questions: items }))
      .catch(() => { if (!request.signal.aborted) setArchiveError("这组旧版题库暂未加载，答案记录仍保留，请联网重试。"); });
    return () => request.abort();
  }, [session?.contentVersion, retry]);
  const activeQuestions = session && session.contentVersion !== QUESTION_SET_VERSION
    ? archive?.version === session.contentVersion ? archive.questions : [] : questions;
  const activeById = useMemo(() => new Map(activeQuestions.map(q => [q.id, q])), [activeQuestions]);
  const answers = session ? sessionAnswers(session, study.model.practice) : [];
  const queue = session?.questionIds.map(id => activeById.get(id)).filter((q): q is Question => !!q) ?? [];
  const question = queue[index];
  const recorded = answers.find(a => a.questionId === question?.id);
  const selectedChoice = recorded?.choice ?? choice;
  const remaining = session?.deadline ? Math.max(0, Math.ceil((session.deadline - now) / 1000)) : 0;
  const expired = !!session?.deadline && remaining === 0;
  const ended = showResult || !!session?.endedAt || expired;
  const assessment = session?.mode === "diagnostic" || session?.mode === "checkpoint";
  useEffect(() => {
    if (!session?.deadline || ended) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [session?.id, session?.deadline, ended]);
  const stats = useMemo(() => trainingSummary(study.model.practice), [study.model.practice]);
  const latestDiagnostic = sessions.find(s => s.contentVersion === QUESTION_SET_VERSION && s.mode === "diagnostic" && sessionAnswers(s, study.model.practice).length === 24);
  const advice = latestDiagnostic ? diagnosticAdvice(questions, sessionAnswers(latestDiagnostic, study.model.practice)) : null;
  async function start(mode: PracticeAttempt["mode"]) {
    if (saving.current) return;
    saving.current = true; setBusy(true);
    try {
      const isAssessment = mode === "diagnostic" || mode === "checkpoint";
      const pool = isAssessment ? questions.filter(q => q.purpose === mode)
        : mode === "mistakes" ? questions : questions.filter(q => !q.purpose || q.purpose === "practice");
      const picked = isAssessment ? pool : selectQuestions(pool, study.model.practice, category, mode === "mistakes").slice(0, 10);
      if (!picked.length) throw Error(mode === "mistakes" ? "这个分类没有待回练的错题。" : "题目还未加载，请稍后重试。");
      if (isAssessment && picked.length !== 24) throw Error("测评题集不完整，请重新加载。");
      const began = Date.now();
      const next: TrainingSession = { id: crypto.randomUUID(), mode, contentVersion: QUESTION_SET_VERSION, questionIds: picked.map(q => q.id),
        startedAt: began, deadline: mode === "timed" ? began + 20 * 60000 : mode === "checkpoint" ? began + 45 * 60000 : 0,
        category: (isAssessment ? "all" : category) as TrainingSession["category"] };
      await study.append("training_session", `session:${next.id}`, JSON.stringify(next));
      setActiveId(next.id); setIndex(0); setChoice(null); setShowText(false); setShowResult(false); setNow(began);
      startedAt.current = began;
    } catch (e) { toast.error(e instanceof Error ? e.message : "未能开始练习"); }
    finally { saving.current = false; setBusy(false); }
  }
  function resume(item: TrainingSession) {
    const submitted = sessionAnswers(item, study.model.practice);
    const first = item.questionIds.findIndex(id => !submitted.some(a => a.questionId === id));
    setActiveId(item.id); setIndex(Math.max(0, first)); setChoice(null); setShowText(false);
    setShowResult(sessionFinished(item, study.model.practice, Date.now())); setNow(Date.now()); startedAt.current = Date.now();
  }
  async function submit() {
    if (choice === null || recorded || saving.current || !question || !session || ended) return;
    if (session.deadline && Date.now() >= session.deadline) { setNow(Date.now()); return; }
    saving.current = true; setBusy(true);
    const attempt: PracticeAttempt = { questionId: question.id, choice, correct: choice === question.answerIndex,
      category: question.category, mode: session.mode, sessionId: session.id,
      elapsedSeconds: Math.min(3600, Math.max(0, Math.round((Date.now() - startedAt.current) / 1000))) };
    try { await study.append("practice", `practice:${question.id}`, JSON.stringify(attempt)); }
    catch (e) { toast.error(e instanceof Error ? e.message : "答案未保存，请重试"); }
    finally { saving.current = false; setBusy(false); }
  }
  async function finish(reason: "finished" | "abandoned") {
    if (!session || busy) return;
    setBusy(true);
    try { await study.append("training_finish", `session:${session.id}`, reason); setShowResult(true); }
    catch (e) { toast.error(e instanceof Error ? e.message : "结果未保存"); }
    finally { setBusy(false); }
  }
  function next() {
    if (index + 1 >= queue.length) { void finish("finished"); return; }
    setIndex(i => i + 1); setChoice(null); setShowText(false); startedAt.current = Date.now();
  }
  if (error) return <section className="panel"><p role="alert">{error}</p>
    <button className="primary" onClick={() => setRetry(x => x + 1)}>重新加载</button></section>;
  if (session && queue.length !== session.questionIds.length) return <section className="panel">
    <p>{archiveError || "这组题目的内容还未完整加载。进度已保留。"}</p>
    <button className="secondary" onClick={() => setRetry(v => v + 1)}>重新加载题库</button>
    <button className="secondary" onClick={() => setActiveId(null)}>返回学习路线</button></section>;
  return <div className="training-workspace">
    <div className="page-heading"><div><div className="eyebrow">N2 · 学习与训练</div>
      <h1>{session ? modeLabels[session.mode] : "从今天，学到 N2。"}</h1>
      <p>{session ? "提交的答案会保存，离开后可继续。" : "先找准起点，再按周学习，把薄弱项练明白。"}</p>
    </div><span className="date-badge">{questions.length} 道原创题</span></div>
    {!session ? <>
      <div className="course-tabs" role="tablist" aria-label="学习与训练">
        {[["course","每周课程"],["practice","专项与测评"]].map(([id,label]) => <button key={id} role="tab" aria-selected={tab === id}
          className={tab === id ? "primary" : "secondary"} onClick={() => setTab(id)}>{label}</button>)}
      </div>
      {sessions.filter(s => !sessionFinished(s, study.model.practice, Date.now())).slice(0, 3).map(s => <section className="panel course-resume" key={s.id}>
        <div><strong>继续{modeLabels[s.mode]}</strong><p>已提交 {sessionAnswers(s, study.model.practice).length}/{s.questionIds.length} 题</p></div>
        <button className="primary" onClick={() => resume(s)}>继续这一组</button></section>)}
      {tab === "course" ? <LearningRoute study={study} entries={entries} advice={advice}
        onGrammar={onGrammar} onDiagnostic={() => void start("diagnostic")} onPractice={() => setTab("practice")}
        onCheckpoint={() => void start("checkpoint")} disabled={busy || !questions.length} /> : <>
        <div className="training-stats">{stats.categories.map(item => <section className="panel" key={item.category}>
          <h2>{categoryLabels[item.category]}</h2><strong>{item.total ? `${Math.round(item.correct / item.total * 100)}%` : "尚未练习"}</strong>
          <p>最近 {item.total} 次 · 答对 {item.correct} 次</p></section>)}</div>
        <section className="panel"><h2>今天练什么</h2>
          <label className="course-select">专项分类<select value={category} onChange={e => setCategory(e.target.value)}>
            <option value="all">综合</option>{Object.entries(categoryLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select></label>
          <p>{stats.weakest ? `建议先练${categoryLabels[stats.weakest.category]}，这是近期已练分类中较薄弱的一项。` : "先完成一组练习，再查看薄弱项。"}</p>
          <div className="button-row">{(["practice", "mistakes", "timed"] as const).map(mode => <button key={mode}
            className={mode === "practice" ? "primary" : "secondary"} disabled={busy || !questions.length || !study.session} onClick={() => void start(mode)}>
            {modeLabels[mode]}{mode === "mistakes" ? `（${stats.mistakes.length}）` : mode === "timed" ? " · 20分钟" : ""}</button>)}</div>
          <p className="footnote">每组最多10题。错题答对后移出待回练列表，历史保留。已提交答案同步，未提交选项只保留在当前页面。</p>
        </section>
        <div className="assessment-grid"><section className="panel"><h2>学习起点测评</h2><p>24题，含N4、N3和N2衔接内容。完成后给出学习起点建议。</p>
          <button className="primary" disabled={busy || !questions.length || !study.session} onClick={() => void start("diagnostic")}>开始起点测评</button></section>
          <section className="panel"><h2>原创阶段检测</h2><p>24题 · 45分钟。四类综合检测，交卷后统一查看解析；这是缩短的阶段训练。</p>
            <button className="secondary" disabled={busy || !questions.length || !study.session} onClick={() => void start("checkpoint")}>开始阶段检测</button></section></div>
        <p className="footnote">原创练习不是官方真题或完整模拟卷，表现不换算JLPT成绩或通过率。重复做同一套测评会受记忆答案影响；听力使用合成语音。</p>
      </>}
      {!!sessions.length && <details className="panel"><summary>训练记录（{sessions.length}组）</summary>{sessions.slice(0, historyLimit).map(s => <div className="course-item" key={s.id}>
        <span>{modeLabels[s.mode]}<small>{new Date(s.startedAt).toLocaleDateString("zh-CN", { timeZone: "Asia/Tokyo" })} · 已答 {sessionAnswers(s, study.model.practice).length}/{s.questionIds.length}</small></span>
        <button className="text-button" onClick={() => resume(s)}>{sessionFinished(s, study.model.practice, Date.now()) ? "查看结果" : "继续"}</button></div>)}
        {sessions.length > historyLimit && <button className="secondary" onClick={() => setHistoryLimit(n => n + 12)}>显示更早记录</button>}</details>}
    </> : ended ? <section className="panel training-result" aria-live="polite">
      <h2>{expired ? "本次计时已结束" : session.finishReason === "abandoned" ? "已结束这一组" : "本组学习结果"}</h2>
      <p>已提交 {answers.length}/{queue.length} 题，答对 {answers.filter(a => a.correct).length} 题。{answers.length < queue.length ? "未答题未计入答题正确率，本组未完整完成。" : ""}</p>
      {session.mode === "diagnostic" && <div className="diagnostic-result"><h3>建议从哪里开始</h3>
        <p>{diagnosticAdvice(activeQuestions, answers).route}</p>
        {diagnosticAdvice(activeQuestions, answers).levels.map(l => <span key={l.level}>{l.level}：{l.correct}/{l.total}　</span>)}
        <p className="footnote">这只是小样本学习建议，不代表取得对应等级。</p></div>}
      <div className="button-row"><button className="primary" onClick={() => { setActiveId(null); setTab("course"); }}>返回每周课程</button>
        <button className="secondary" onClick={() => { setActiveId(null); setTab("practice"); }}>去错题回练</button></div>
      {queue.map(q => { const answer = answers.find(a => a.questionId === q.id); return <details className="assessment-answer" key={q.id}>
        <summary>{q.title} · {answer ? answer.correct ? "答对" : "待巩固" : "未答"}</summary>
        {q.passage && <p lang="ja">{q.passage}</p>}{q.transcript && <p lang="ja">{q.transcript}</p>}
        <p lang="ja">{q.prompt}</p><p>你的答案：{answer ? `${answer.choice + 1}. ${q.options[answer.choice]}` : "未提交"}</p>
        <p>正确答案：{q.answerIndex + 1}. {q.options[q.answerIndex]}</p><p>{q.explanation}</p>
        <div className="button-row">{q.grammarIds.map(id => <button className="text-button" key={id} onClick={() => onGrammar(id)}>复习 {id}</button>)}</div>
      </details>; })}
    </section> : question && <section className="panel training-question">
      <div className="section-heading"><span>{categoryLabels[question.category]} · {question.level} · {index + 1}/{queue.length}</span>
        {!!session.deadline && <strong role="timer">剩余 {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}</strong>}</div>
      <h2>{question.title}</h2>
      {question.passage && <p className="training-passage" lang="ja">{question.passage}</p>}
      {question.transcript && <><TrainingAudio key={question.id} id={question.id} onStart={onStartAudio} />
        {!assessment && <button className="text-button" onClick={() => setShowText(v => !v)}>{showText ? "隐藏听力原文" : "显示听力原文（辅助）"}</button>}
        {!assessment && (showText || recorded) && <p className="training-passage" lang="ja">{question.transcript}</p>}</>}
      <p className="training-prompt" lang="ja">{question.prompt}</p>
      <fieldset className="training-options" disabled={!!recorded || busy}><legend>选择一个答案</legend>
        {question.options.map((option, i) => <label key={i} className={`${selectedChoice === i ? "chosen" : ""} ${recorded && !assessment && i === question.answerIndex ? "answer-correct" : ""}`}>
          <input type="radio" name={`answer-${question.id}`} checked={selectedChoice === i} onChange={() => setChoice(i)} /><span>{i + 1}. {option}</span></label>)}
      </fieldset>
      {!recorded ? <button className="primary" disabled={choice === null || busy} onClick={() => void submit()}>{busy ? "保存中…" : "提交答案"}</button> : <div className="training-explanation" aria-live="polite">
        {assessment ? <p>答案已保存，完成整组后统一核对。</p> : <><h3>{recorded.correct ? "答对了" : `正确答案是 ${question.answerIndex + 1}`}</h3><p>{question.explanation}</p>
          <div className="button-row">{question.grammarIds.map(id => <button className="text-button" key={id} onClick={() => onGrammar(id)}>复习相关语法 {id}</button>)}</div>
          {question.reference && <a href={question.reference.url} target="_blank" rel="noreferrer">{question.reference.title}</a>}</>}
        <button className="primary" disabled={busy} onClick={next}>{index + 1 === queue.length ? "查看本组结果" : "下一题"}</button>
      </div>}
      <div className="button-row"><button className="text-button" disabled={busy} onClick={() => setActiveId(null)}>暂时离开，稍后继续</button>
        <button className="text-button" disabled={busy} onClick={() => void finish("abandoned")}>结束并查看已答结果</button></div>
      {!!session.deadline && <p className="footnote">离开或切换设备后计时继续，截止时间保持不变。</p>}
    </section>}
    {study.model.trainingConflicts > 0 && <p className="notice">{study.model.trainingConflicts}条重复或过期答题记录已保留在历史中，没有重复计分。以同步后的结果为准。</p>}
  </div>;
}
