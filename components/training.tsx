"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { fetchJSON } from "@/lib/study/session";
import type { useStudy } from "@/lib/study/use-study";
import {
  categoryLabels,
  type Question,
  type PracticeAttempt,
} from "@/lib/training/types";
import { selectQuestions, trainingSummary } from "@/lib/training/planner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

function TrainingAudio({ id, onStart }: { id: string; onStart: () => void }) {
  const media = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const audio = media.current;
    if (audio && !audio.getAttribute("src"))
      audio.src = `/audio/training/${id}.mp3`;
    return () => {
      audio?.pause();
      audio?.removeAttribute("src");
      audio?.load();
    };
  }, [id]);
  return (
    <audio
      ref={media}
      controls
      preload="none"
      src={`/audio/training/${id}.mp3`}
      onPlay={onStart}
      aria-label="练习听力音频"
    />
  );
}

export function Training({
  study,
  onGrammar,
  onStartAudio,
}: {
  study: ReturnType<typeof useStudy>;
  onGrammar: (id: string) => void;
  onStartAudio: () => void;
}) {
  const [questions, setQuestions] = useState<Question[]>([]),
    [error, setError] = useState("");
  const [retry, setRetry] = useState(0),
    [category, setCategory] = useState("all");
  const [queue, setQueue] = useState<Question[]>([]),
    [index, setIndex] = useState(0);
  const [choice, setChoice] = useState<number | null>(null),
    [submitted, setSubmitted] = useState(false);
  const [mode, setMode] = useState<PracticeAttempt["mode"]>("practice");
  const [results, setResults] = useState<{ id: string; correct: boolean }[]>(
    [],
  );
  const [ended, setEnded] = useState(false),
    [busy, setBusy] = useState(false),
    [showText, setShowText] = useState(false);
  const [deadline, setDeadline] = useState(0),
    [remaining, setRemaining] = useState(0);
  const startedAt = useRef(Date.now()),
    saving = useRef(false);
  useEffect(() => {
    const request = new AbortController();
    setError("");
    fetchJSON<Question[]>("/data/n2-questions.json", 12000, request.signal)
      .then(setQuestions)
      .catch(() => {
        if (!request.signal.aborted) setError("练习内容未能加载，请重试。");
      });
    return () => request.abort();
  }, [retry]);
  useEffect(() => {
    if (!deadline || ended || !queue.length) return;
    const update = () => {
      const seconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setRemaining(seconds);
      if (!seconds) setEnded(true);
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [deadline, ended, queue.length]);
  const stats = useMemo(
    () => trainingSummary(study.model.practice),
    [study.model.practice],
  );
  const question = queue[index];
  function start(nextMode: PracticeAttempt["mode"]) {
    const next = selectQuestions(
      questions,
      study.model.practice,
      category,
      nextMode === "mistakes",
    ).slice(0, 10);
    if (!next.length) {
      toast.message(
        nextMode === "mistakes"
          ? "这个分类还没有待回练的错题。"
          : "这个分类尚无题目。",
      );
      return;
    }
    setQueue(next);
    setMode(nextMode);
    setIndex(0);
    setChoice(null);
    setSubmitted(false);
    setEnded(false);
    setResults([]);
    setShowText(false);
    const end = nextMode === "timed" ? Date.now() + 20 * 60000 : 0;
    setDeadline(end);
    setRemaining(end ? 1200 : 0);
    startedAt.current = Date.now();
  }
  async function submit() {
    if (choice === null || submitted || saving.current || !question || ended)
      return;
    if (deadline && Date.now() >= deadline) {
      setEnded(true);
      return;
    }
    saving.current = true;
    setBusy(true);
    const attempt: PracticeAttempt = {
      questionId: question.id,
      choice,
      correct: choice === question.answerIndex,
      category: question.category,
      mode,
      elapsedSeconds: Math.min(
        3600,
        Math.round((Date.now() - startedAt.current) / 1000),
      ),
    };
    try {
      await study.append(
        "practice",
        `practice:${question.id}`,
        JSON.stringify(attempt),
      );
      setResults((previous) => [
        ...previous,
        { id: question.id, correct: attempt.correct },
      ]);
      setSubmitted(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "答案未保存，请重试。");
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  function next() {
    if (index + 1 >= queue.length) {
      setEnded(true);
      return;
    }
    setIndex((i) => i + 1);
    setChoice(null);
    setSubmitted(false);
    setShowText(false);
    startedAt.current = Date.now();
  }
  if (error)
    return (
      <section className="panel">
        <p role="alert">{error}</p>
        <button className="primary" onClick={() => setRetry((x) => x + 1)}>
          重新加载
        </button>
      </section>
    );
  return (
    <div className="training-workspace">
      <div className="page-heading">
        <div>
          <div className="eyebrow">PRACTICE · UNDERSTAND · RETRY</div>
          <h1>N2 训练</h1>
          <p>先作答，再看理由，把错题练明白。</p>
        </div>
        <span className="date-badge">{questions.length} 道原创专项题</span>
      </div>
      {!queue.length ? (
        <>
          <div className="training-stats">
            {stats.categories.map((item) => (
              <section className="panel" key={item.category}>
                <h2>{categoryLabels[item.category]}</h2>
                <strong>
                  {item.total
                    ? `${Math.round((item.correct / item.total) * 100)}%`
                    : "尚未练习"}
                </strong>
                <p>
                  最近 {item.total} 次 · 答对 {item.correct} 次
                </p>
              </section>
            ))}
          </div>
          <section className="panel">
            <h2>今天练什么</h2>
            <Tabs value={category} onValueChange={setCategory}>
              <TabsList className="training-tabs">
                <TabsTrigger value="all">综合</TabsTrigger>
                {Object.entries(categoryLabels).map(([id, label]) => (
                  <TabsTrigger key={id} value={id}>
                    {label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <p>
              {stats.weakest
                ? `可以先练${categoryLabels[stats.weakest.category]}，这是最近已练分类中正确率较低的一项。`
                : "先完成几组题，之后会根据你的记录推荐薄弱项。"}
            </p>
            <div className="button-row">
              <button
                className="primary"
                disabled={!questions.length || !study.session}
                onClick={() => start("practice")}
              >
                开始专项练习
              </button>
              <button
                className="secondary"
                disabled={!questions.length || !study.session}
                onClick={() => start("mistakes")}
              >
                错题回练（{stats.mistakes.length}）
              </button>
              <button
                className="secondary"
                disabled={!questions.length || !study.session}
                onClick={() => start("timed")}
              >
                限时练习 · 20 分钟
              </button>
            </div>
            {!study.session && <p>登录后可练习并同步答题记录。</p>}
            <p className="footnote">
              每组最多 10 题，优先错题与未做题。N3 衔接 N2
              的原创练习，不是官方真题或完整模拟考试；正确率不预测考试成绩。听力使用合成语音。
            </p>
          </section>
        </>
      ) : ended ? (
        <section className="panel training-result" aria-live="polite">
          <h2>{deadline && !remaining ? "本次计时已结束" : "这一组完成了"}</h2>
          <p>
            已提交 {results.length} / {queue.length} 题，答对{" "}
            {results.filter((r) => r.correct).length} 题。
            {queue.length > results.length ? "未提交的题目不记为答错。" : ""}
          </p>
          <p>
            答案已经保存，错题会进入回练。练习答对后会从待回练列表中移出，历史记录保留。
          </p>
          <button className="primary" onClick={() => setQueue([])}>
            返回训练首页
          </button>
        </section>
      ) : (
        question && (
          <section className="panel training-question">
            <div className="section-heading">
              <span>
                {categoryLabels[question.category]} · {question.level} ·{" "}
                {index + 1} / {queue.length}
              </span>
              {deadline > 0 && (
                <strong role="timer">
                  剩余 {Math.floor(remaining / 60)}:
                  {String(remaining % 60).padStart(2, "0")}
                </strong>
              )}
            </div>
            <h2>{question.title}</h2>
            {question.passage && (
              <p className="training-passage" lang="ja">
                {question.passage}
              </p>
            )}
            {question.transcript && (
              <>
                <TrainingAudio
                  key={question.id}
                  id={question.id}
                  onStart={onStartAudio}
                />
                <button
                  className="text-button"
                  onClick={() => setShowText((v) => !v)}
                >
                  {showText ? "隐藏听力原文" : "显示听力原文（辅助）"}
                </button>
                {(showText || submitted) && (
                  <p className="training-passage" lang="ja">
                    {question.transcript}
                  </p>
                )}
              </>
            )}
            <p className="training-prompt" lang="ja">
              {question.prompt}
            </p>
            <fieldset className="training-options" disabled={submitted || busy}>
              <legend>选择一个答案</legend>
              {question.options.map((option, i) => (
                <label
                  key={i}
                  className={`${choice === i ? "chosen" : ""} ${submitted && i === question.answerIndex ? "answer-correct" : ""}`}
                >
                  <input
                    type="radio"
                    name={`answer-${question.id}`}
                    value={i}
                    checked={choice === i}
                    onChange={() => setChoice(i)}
                  />
                  <span>
                    {i + 1}. {option}
                  </span>
                </label>
              ))}
            </fieldset>
            {!submitted ? (
              <button
                className="primary"
                disabled={choice === null || busy}
                onClick={() => void submit()}
              >
                {busy ? "保存中…" : "提交答案"}
              </button>
            ) : (
              <div className="training-explanation" aria-live="polite">
                <h3>
                  {choice === question.answerIndex
                    ? "答对了"
                    : `正确答案是 ${question.answerIndex + 1}`}
                </h3>
                <p>{question.explanation}</p>
                <div className="button-row">
                  {question.grammarIds.map((id) => (
                    <button
                      key={id}
                      className="text-button"
                      onClick={() => onGrammar(id)}
                    >
                      复习相关语法 {id}
                    </button>
                  ))}
                </div>
                {question.reference && (
                  <a
                    target="_blank"
                    rel="noreferrer"
                    href={question.reference.url}
                  >
                    {question.reference.title}
                  </a>
                )}
                <div>
                  <button className="primary" onClick={next}>
                    {index + 1 === queue.length ? "查看本组结果" : "下一题"}
                  </button>
                </div>
              </div>
            )}
            <button
              className="text-button"
              disabled={busy}
              onClick={() => {
                setEnded(true);
              }}
            >
              结束本组
            </button>
          </section>
        )
      )}
    </div>
  );
}
