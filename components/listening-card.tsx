"use client";
import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import type { useStudy } from "@/lib/study/use-study";
import { listeningCardSchema, type ListeningCard } from "@/lib/study/listening-card";
import { formatTime, type TedArticle, type TedLoop } from "@/lib/ted/types";
import { visibleParagraph } from "@/lib/ted/paragraph";

export function ListeningClip({ card, onStart }: { card: ListeningCard; onStart: () => void }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false), [error, setError] = useState("");
  useEffect(() => {
    const audio = ref.current;
    if (audio && !audio.getAttribute("src")) audio.src = `/api/ted/media?id=${card.articleId}&kind=audio`;
    const stop = () => { audio?.pause(); setPlaying(false); };
    window.addEventListener("kotoba:stop-ted", stop);
    return () => {
      window.removeEventListener("kotoba:stop-ted", stop);
      audio?.pause(); audio?.removeAttribute("src"); audio?.load();
    };
  }, [card.id, card.articleId]);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      const audio = ref.current;
      if (audio && audio.currentTime >= card.end) audio.pause();
    }, 40);
    return () => clearInterval(timer);
  }, [playing, card.end]);
  async function play() {
    const audio = ref.current;
    if (!audio) return;
    if (playing) { audio.pause(); return; }
    if (audio.readyState >= 1 && (!Number.isFinite(audio.duration) || card.start >= audio.duration || card.end > audio.duration + 0.1)) {
      setError("片段超出音频长度，请回原文重新标记。"); return;
    }
    onStart(); setError("");
    try {
      audio.currentTime = card.start;
      await audio.play();
    } catch { setError("音频未能播放，请检查网络和登录状态后再点一次。"); }
  }
  return <div className="listening-card-audio">
    <audio ref={ref} preload="none" src={`/api/ted/media?id=${card.articleId}&kind=audio`}
      onLoadedMetadata={() => {
        const audio = ref.current;
        if (!audio) return;
        if (!Number.isFinite(audio.duration) || card.start >= audio.duration || card.end > audio.duration + 0.1) {
          audio.pause(); setError("片段超出音频长度，请回原文重新标记。");
        } else audio.currentTime = card.start;
      }}
      onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
      onEnded={() => setPlaying(false)}
      onTimeUpdate={() => { if (ref.current && ref.current.currentTime >= card.end) ref.current.pause(); }}
      onError={() => { setPlaying(false); setError("原音频暂不可用，请联网后重试。"); }} />
    <button className="primary" onClick={() => void play()}>{playing ? "暂停片段" : "听原声片段"}</button>
    <p className="muted">{formatTime(card.start)}–{formatTime(card.end)} · {card.label}</p>
    {error && <p role="alert">{error}</p>}
  </div>;
}

export function ListeningCardReview({ card, flipped, onFlip, onStart }: {
  card: ListeningCard; flipped: boolean; onFlip: () => void; onStart: () => void;
}) {
  return <>
    <span className="level-badge">TED 原声</span>
    <p className="card-prompt">先听原声，回忆日文和意思，再翻面核对。</p>
    <ListeningClip key={card.id} card={card} onStart={onStart} />
    {flipped ? <div className="card-answer">
      <p className="japanese" lang="ja">{card.japanese}</p>
      <p className="answer-meaning">{card.chinese}</p>
      <p className="footnote">来自《{card.articleTitle}》。卡片保留创建时的文字和音频范围。</p>
    </div> : <button className="secondary flip-button" onClick={onFlip}>显示原文与意思</button>}
  </>;
}

export function ListeningCardDialog({ target, article, study, onClose }: {
  target: { id: string; loop: TedLoop };
  article: TedArticle;
  study: ReturnType<typeof useStudy>;
  onClose: () => void;
}) {
  const paragraph = visibleParagraph(article, target.loop.paragraphId);
  const [japanese, setJapanese] = useState(paragraph?.japanese ?? "");
  const [chinese, setChinese] = useState(paragraph?.chinese ?? "");
  const [label, setLabel] = useState(target.loop.label);
  const [busy, setBusy] = useState(false);
  async function save() {
    if (busy) return;
    setBusy(true);
    try {
      const card = listeningCardSchema.parse({ id: `listen:${crypto.randomUUID()}`, articleId: article.id,
        articleTitle: article.title, label, japanese, chinese, start: target.loop.start, end: target.loop.end,
        sourceLoopId: target.id, ...(paragraph ? { paragraphId: paragraph.id } : {}) });
      await study.appendBatch([
        { kind: "listening_card", entity: card.id, value: JSON.stringify(card) },
        { kind: "enroll", entity: card.id, value: true },
      ]);
      toast.success("已加入听力复习，按记忆间隔安排再次学习"); onClose();
    } catch (e) {
      toast.error(e instanceof Error && !e.message.startsWith("[") ? e.message : "请填写片段对应的日文和中文；片段最长10分钟。");
    } finally { setBusy(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <DialogContent className="listening-card-dialog">
      <DialogHeader><DialogTitle>制作原声听力卡</DialogTitle>
        <DialogDescription>核对文字只对应 {formatTime(target.loop.start)}–{formatTime(target.loop.end)} 这段音频。翻面前只显示播放按钮。</DialogDescription>
      </DialogHeader>
      <label>卡片名称<input value={label} maxLength={80} onChange={e => setLabel(e.target.value)} /></label>
      <label>这段日文<textarea lang="ja" value={japanese} maxLength={2000} onChange={e => setJapanese(e.target.value)} /></label>
      <label>中文意思<textarea value={chinese} maxLength={2000} onChange={e => setChinese(e.target.value)} /></label>
      {!paragraph && <p className="footnote">尚未关联段落，或原段落校对后对应了多个新段。请核对并填写，或回原文重新关联段落；音频范围保持不变。</p>}
      <button className="primary" disabled={busy || !japanese.trim() || !chinese.trim() || !label.trim()}
        onClick={() => void save()}>{busy ? "保存中…" : "保存并加入复习"}</button>
    </DialogContent>
  </Dialog>;
}
