"use client";
import { useEffect, useRef, useState } from "react";
import { Play, Pause, Repeat2, Flag, Save, Trash2, Pencil } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { LOOP_COLORS, formatTime, type TedLoop } from "@/lib/ted/types";
import { tedLoopSchema } from "@/lib/ted/validation";
import { toast } from "sonner";

type Props = {
  id: string;
  duration: number;
  progress: number;
  loops: Record<string, TedLoop | null>;
  paragraphId?: string;
  onSave: (id: string, loop: TedLoop | null) => Promise<unknown>;
  onProgress: (time: number) => Promise<unknown>;
  onStart: () => void;
  onActive: (paragraph?: string) => void;
};
export function TedPlayer(props: Props) {
  const media = useRef<HTMLAudioElement>(null);
  const [time, setTime] = useState(0),
    [duration, setDuration] = useState(props.duration),
    [playing, setPlaying] = useState(false),
    [ready, setReady] = useState(false);
  const [active, setActive] = useState(""),
    [draftId, setDraftId] = useState(""),
    [start, setStart] = useState(0),
    [end, setEnd] = useState(0),
    [label, setLabel] = useState(""),
    [color, setColor] = useState(0),
    [speed, setSpeed] = useState("1");
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(false);
  const [gap, setGap] = useState(0),
    [repeatLimit, setRepeatLimit] = useState(0),
    [repeats, setRepeats] = useState(0);
  const playbackState = useRef({ ready: false, speed: "1" }),
    position = useRef(0),
    restartLoop = useRef(false);
  playbackState.current = { ready, speed };
  const [draftParagraph, setDraftParagraph] = useState<string | undefined>();
  const waiting = useRef<ReturnType<typeof setTimeout> | null>(null),
    lastSaved = useRef(0),
    live = useRef(props),
    loopState = useRef({ active: "", gap: 0, repeatLimit: 0, repeats: 0 });
  live.current = props;
  loopState.current = { active, gap, repeatLimit, repeats };
  const loops = Object.entries(props.loops).filter(
    (pair): pair is [string, TedLoop] =>
      !!pair[1] && pair[1].articleId === props.id,
  );
  function clearWait() {
    if (waiting.current !== null) clearTimeout(waiting.current);
    waiting.current = null;
  }
  function checkpoint() {
    const value = media.current?.currentTime ?? position.current;
    if (Math.abs(value - lastSaved.current) >= 1) {
      lastSaved.current = value;
      void live.current
        .onProgress(value)
        .catch(() => toast.error("播放位置未能保存，请重试"));
    }
  }
  useEffect(() => {
    // Host refs are detached before passive cleanup. Retain this element so an
    // article change also stops its download/decoder after React clears the ref.
    const audio = media.current;
    // React Strict Mode replays setup after cleanup without replacing the node.
    if (audio && !audio.getAttribute("src"))
      audio.src = `/api/ted/media?id=${props.id}&kind=audio`;
    const persist = () => {
      if (document.visibilityState === "hidden") checkpoint();
    };
    document.addEventListener("visibilitychange", persist);
    const stop = () => {
      clearWait();
      media.current?.pause();
      setPlaying(false);
      checkpoint();
    };
    window.addEventListener("kotoba:stop-ted", stop);
    return () => {
      position.current = audio?.currentTime ?? position.current;
      checkpoint();
      clearWait();
      audio?.pause();
      audio?.removeAttribute("src");
      audio?.load();
      document.removeEventListener("visibilitychange", persist);
      window.removeEventListener("kotoba:stop-ted", stop);
    };
  }, [props.id]);
  function fail() {
    clearWait();
    setError("音频无法播放，请检查网络并重新载入。");
    setPlaying(false);
    setReady(false);
  }
  async function playAt(at?: number) {
    const audio = media.current;
    if (!audio || !playbackState.current.ready) {
      setError("音频还未准备好，请稍候或重新载入。");
      return;
    }
    clearWait();
    setError("");
    restartLoop.current = false;
    live.current.onStart();
    if (at !== undefined)
      audio.currentTime = Math.max(
        0,
        Math.min(at, Math.max(0, audio.duration - 0.05)),
      );
    audio.playbackRate = Number(playbackState.current.speed);
    audio.preservesPitch = true;
    try {
      await audio.play();
    } catch {
      setError("浏览器没有开始播放，请再次点击播放按钮。");
    }
  }
  function finishLoop() {
    const state = loopState.current,
      loop = live.current.loops[state.active],
      audio = media.current;
    if (!loop || !audio || waiting.current !== null) return;
    if (state.repeatLimit > 0 && state.repeats + 1 >= state.repeatLimit) {
      audio.pause();
      setPlaying(false);
      setActive("");
      live.current.onActive();
      setRepeats(state.repeats + 1);
      return;
    }
    const next = state.repeats + 1;
    restartLoop.current = true;
    loopState.current.repeats = next;
    setRepeats(next);
    if (state.gap) {
      audio.pause();
      setPlaying(true);
      waiting.current = setTimeout(() => {
        waiting.current = null;
        void playAt(loop.start);
      }, state.gap * 1000);
    } else {
      audio.currentTime = loop.start;
      restartLoop.current = false;
      if (audio.paused) void playAt(loop.start);
    }
  }
  useEffect(() => {
    if (!playing || !active) return;
    const timer = setInterval(() => {
      const audio = media.current,
        loop = live.current.loops[loopState.current.active];
      if (
        audio &&
        !audio.paused &&
        loop &&
        audio.currentTime >= loop.end - 0.025
      )
        finishLoop();
    }, 40);
    return () => clearInterval(timer);
  }, [playing, active]);
  useEffect(() => {
    if (active && !props.loops[active]) {
      clearWait();
      media.current?.pause();
      setPlaying(false);
      setActive("");
      props.onActive();
    }
  }, [props.loops, active]);
  function toggle() {
    if (playing) {
      clearWait();
      media.current?.pause();
      setPlaying(false);
      checkpoint();
    } else {
      const loop = live.current.loops[loopState.current.active];
      void playAt(loop && restartLoop.current ? loop.start : undefined);
    }
  }
  function seekTo(target: number) {
    clearWait();
    restartLoop.current = false;
    setActive("");
    loopState.current.active = "";
    props.onActive();
    if (media.current) media.current.currentTime = target;
    position.current = target;
    setTime(target);
    if (playing) void playAt(target);
    else setPlaying(false);
  }
  function selectLoop(id: string, loop: TedLoop) {
    clearWait();
    setActive(id);
    loopState.current.active = id;
    setRepeats(0);
    loopState.current.repeats = 0;
    props.onActive(loop.paragraphId);
    void playAt(loop.start);
  }
  async function save() {
    const parsed = tedLoopSchema.safeParse({
      articleId: props.id,
      label: label.trim() || `重点 ${loops.length + 1}`,
      color,
      start,
      end,
      ...((draftId ? draftParagraph : props.paragraphId)
        ? { paragraphId: draftId ? draftParagraph : props.paragraphId }
        : {}),
    });
    if (!parsed.success || end > duration) {
      toast.error(
        "请设置有效起止点：终点需晚于起点至少0.25秒，且不能超出音频。",
      );
      return;
    }
    setBusy(true);
    try {
      await props.onSave(
        draftId || `tedloop:${crypto.randomUUID()}`,
        parsed.data,
      );
      setDraftId("");
      setLabel("");
      toast.success("循环区域已保存");
    } catch {
      toast.error("保存失败，标记仍保留在这里");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="ted-player panel" aria-label="精听播放器">
      <audio
        ref={media}
        src={`/api/ted/media?id=${props.id}&kind=audio`}
        preload="metadata"
        onLoadedMetadata={() => {
          setReady(true);
          setDuration(media.current!.duration);
          setError("");
          if (!loaded) {
            setLoaded(true);
            setTime(Math.min(props.progress, media.current!.duration));
            media.current!.currentTime = Math.min(
              props.progress,
              Math.max(0, media.current!.duration - 0.1),
            );
          }
        }}
        onPlay={() => {
          setPlaying(true);
          props.onStart();
        }}
        onPause={() => {
          if (waiting.current === null) setPlaying(false);
          checkpoint();
        }}
        onTimeUpdate={() => {
          const current = media.current!.currentTime;
          position.current = current;
          setTime(current);
          if (Math.abs(current - lastSaved.current) >= 30) checkpoint();
        }}
        onEnded={() => {
          if (loopState.current.active) finishLoop();
          else {
            setPlaying(false);
            checkpoint();
          }
        }}
        onError={fail}
      />
      <div className="section-heading">
        <h2>精听播放器</h2>
        <span>{active ? "区域循环" : "全文播放"}</span>
      </div>
      <div className="ted-transport">
        <button
          className="primary"
          disabled={!ready}
          onClick={toggle}
          aria-label={playing ? "暂停音频" : "播放音频"}
        >
          {playing ? <Pause size={18} /> : <Play size={18} />}
        </button>
        <button
          className="secondary"
          disabled={!ready}
          onClick={() => {
            clearWait();
            setActive("");
            loopState.current.active = "";
            props.onActive();
            setRepeats(0);
            void playAt(0);
          }}
        >
          播放全文
        </button>
        <button
          className="text-button"
          disabled={!ready}
          onClick={() => {
            const target = Math.max(0, (media.current?.currentTime ?? 0) - 5);
            seekTo(target);
          }}
        >
          退 5 秒
        </button>
        <label>
          速度{" "}
          <Select
            value={speed}
            onValueChange={(value) => {
              setSpeed(value);
              if (media.current) media.current.playbackRate = Number(value);
            }}
          >
            <SelectTrigger aria-label="TED播放速度">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[0.5, 0.65, 0.8, 1, 1.15, 1.25, 1.5].map((v) => (
                <SelectItem key={v} value={String(v)}>
                  {v}×
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      </div>
      <div className="ted-time">
        <span>{formatTime(time)}</span>
        <span>{formatTime(duration)}</span>
      </div>
      <Slider
        aria-label="音频播放进度"
        disabled={!ready}
        value={[time]}
        min={0}
        max={Math.max(duration, 1)}
        step={0.1}
        onValueChange={([v]) => seekTo(v)}
        onValueCommit={checkpoint}
      />
      <div className="ted-regions" aria-label="已保存的彩色循环区域">
        {loops.map(([id, loop], index) => (
          <button
            title={`${loop.label} ${formatTime(loop.start)}–${formatTime(loop.end)}`}
            aria-label={`循环${index + 1} ${loop.label}`}
            key={id}
            onClick={() => selectLoop(id, loop)}
            style={{
              left: `${(loop.start / Math.max(duration, 1)) * 100}%`,
              width: `${Math.max(1, ((loop.end - loop.start) / Math.max(duration, 1)) * 100)}%`,
              top: (index % 3) * 8,
              background: LOOP_COLORS[loop.color],
            }}
          />
        ))}
      </div>
      {error && (
        <p className="notice" role="alert">
          {error}{" "}
          <button
            className="text-button"
            onClick={() => {
              setReady(false);
              media.current?.load();
            }}
          >
            重新载入音频
          </button>
        </p>
      )}
      <details className="ted-marking" open>
        <summary>
          <Flag size={16} />
          {draftId ? "编辑循环区域" : "标记一个重点"}
        </summary>
        <div className="ted-marker-points">
          <label>
            A 起点（秒）
            <input
              aria-label="循环起点秒数"
              type="number"
              step="0.1"
              min="0"
              max={duration}
              value={start}
              onChange={(e) => setStart(Number(e.target.value))}
            />
            <button
              className="secondary compact"
              disabled={!ready}
              onClick={() => {
                setStart(
                  Math.round((media.current?.currentTime ?? 0) * 10) / 10,
                );
              }}
            >
              当前位置设为 A
            </button>
          </label>
          <label>
            B 终点（秒）
            <input
              aria-label="循环终点秒数"
              type="number"
              step="0.1"
              min="0"
              max={duration}
              value={end}
              onChange={(e) => setEnd(Number(e.target.value))}
            />
            <button
              className="secondary compact"
              disabled={!ready}
              onClick={() => {
                setEnd(Math.round((media.current?.currentTime ?? 0) * 10) / 10);
              }}
            >
              当前位置设为 B
            </button>
          </label>
        </div>
        <input
          aria-label="循环区域名称"
          placeholder="给这段起个名字，例如：没听清的转折"
          maxLength={80}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <div className="ted-colors" aria-label="循环区域颜色">
          {LOOP_COLORS.map((value, i) => (
            <button
              key={value}
              aria-label={`颜色 ${i + 1}`}
              aria-pressed={color === i}
              style={{ background: value }}
              onClick={() => setColor(i)}
            >
              {i + 1}
            </button>
          ))}
          <button
            className="primary compact"
            disabled={busy || !ready}
            onClick={() => void save()}
          >
            <Save size={15} />
            {busy ? "保存中…" : "保存区域"}
          </button>
          {draftId && (
            <button
              className="text-button"
              onClick={() => {
                setDraftId("");
                setLabel("");
              }}
            >
              取消编辑
            </button>
          )}
        </div>
        <p className="footnote">
          播放到开头时标 A，听到结尾时标 B；可直接修改秒数微调。
          {!draftId && props.paragraphId ? "保存后关联当前选中段落。" : ""}
        </p>
        {draftId && (
          <div className="footnote">
            当前关联：{draftParagraph || "无"}。
            {props.paragraphId && (
              <button
                className="text-button"
                onClick={() => setDraftParagraph(props.paragraphId)}
              >
                改为当前选中段落
              </button>
            )}
            {draftParagraph && (
              <button
                className="text-button"
                onClick={() => setDraftParagraph(undefined)}
              >
                解除段落关联
              </button>
            )}
          </div>
        )}
      </details>
      <div className="ted-repeat-settings">
        <label>
          循环次数{" "}
          <Select
            value={String(repeatLimit)}
            onValueChange={(value) => setRepeatLimit(Number(value))}
          >
            <SelectTrigger aria-label="循环次数">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[0, 3, 5, 10].map((v) => (
                <SelectItem key={v} value={String(v)}>
                  {v ? `${v} 次` : "不限"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label>
          跟读留白{" "}
          <Select
            value={String(gap)}
            onValueChange={(value) => setGap(Number(value))}
          >
            <SelectTrigger aria-label="循环留白">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[0, 2, 4, 6].map((v) => (
                <SelectItem key={v} value={String(v)}>
                  {v} 秒
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        {active && <span>已完成 {repeats} 次</span>}
      </div>
      <div className="ted-loop-list">
        {loops.map(([id, loop], index) => (
          <div
            className={active === id ? "ted-loop active" : "ted-loop"}
            key={id}
            style={{ borderLeftColor: LOOP_COLORS[loop.color] }}
          >
            <button
              className="ted-loop-play"
              onClick={() => selectLoop(id, loop)}
            >
              <Repeat2 size={16} style={{ color: LOOP_COLORS[loop.color] }} />
              <span>
                <strong>
                  {index + 1}. {loop.label}
                </strong>
                <small>
                  {formatTime(loop.start)} – {formatTime(loop.end)}
                </small>
              </span>
            </button>
            <button
              className="icon-button"
              aria-label={`编辑${loop.label}`}
              onClick={() => {
                setDraftId(id);
                setDraftParagraph(loop.paragraphId);
                setLabel(loop.label);
                setColor(loop.color);
                setStart(loop.start);
                setEnd(loop.end);
              }}
            >
              <Pencil size={15} />
            </button>
            <button
              className="icon-button"
              aria-label={`删除${loop.label}`}
              onClick={() =>
                void props
                  .onSave(id, null)
                  .then(() => toast.success("已删除区域"))
                  .catch(() => toast.error("删除失败，请重试"))
              }
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>
      {!loops.length && (
        <p className="footnote">
          保存多组区域后，点击对应颜色或名称即可反复听。
        </p>
      )}
    </section>
  );
}
