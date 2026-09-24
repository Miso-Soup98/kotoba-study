"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Bookmark,
  Check,
  ChevronLeft,
  ChevronRight,
  Cloud,
  Download,
  GraduationCap,
  Headphones,
  House,
  Layers3,
  LoaderCircle,
  Pause,
  Play,
  Plus,
  Search,
  Settings2,
  Square,
  Target,
  Upload,
  Volume2,
  WifiOff,
  X,
  NotebookPen,
  LogOut,
  ExternalLink,
} from "lucide-react";
import {
  Sidebar,
  SidebarProvider,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Toaster, toast } from "sonner";
import { useStudy } from "@/lib/study/use-study";
import { useAudio } from "@/lib/study/use-audio";
import { useNoteDraft } from "@/lib/study/use-note-draft";
import { vocabulary, studyDay, tasks } from "@/lib/study/content";
import { combineEvents, ALGORITHM, scheduler } from "@/lib/study/model";
import { eventSchema } from "@/lib/study/validation";
import { fetchJSON } from "@/lib/study/session";
import type { Entry, Word, EventKind, StudyEvent } from "@/lib/study/types";
import type { Grade } from "ts-fsrs";

const NAV = [
  { id: "today", label: "今天", icon: House },
  { id: "library", label: "语法库", icon: BookOpen },
  { id: "review", label: "复习", icon: Layers3 },
  { id: "words", label: "生词本", icon: Bookmark },
  { id: "profile", label: "我的", icon: GraduationCap },
];
function Ruby({ text, show = true }: { text: string; show?: boolean }) {
  return (
    <>
      {text.split(/([\p{Script=Han}々]+（[^）]+）)/gu).map((part, i) => {
        const m = part.match(/^([\p{Script=Han}々]+)（([^）]+)）$/u);
        return m ? (
          <ruby key={i}>
            {m[1]}
            {show && <rt>{m[2]}</rt>}
          </ruby>
        ) : (
          <span key={i}>{part}</span>
        );
      })}
    </>
  );
}
function Choice({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  label: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default function StudyApp({
  signInHref = "/signin-with-chatgpt?return_to=%2F",
}: {
  signInHref?: string;
}) {
  const study = useStudy();
  const { model, session, ready } = study;
  const audio = useAudio(model.settings);
  const [entries, setEntries] = useState<Entry[]>([]),
    [loadError, setLoadError] = useState("");
  const [view, setView] = useState("today"),
    [level, setLevel] = useState("N3"),
    [query, setQuery] = useState(""),
    [selected, setSelected] = useState("");
  const [onlySaved, setOnlySaved] = useState(false),
    [flipped, setFlipped] = useState(false),
    [reviewId, setReviewId] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [busy, setBusy] = useState(false),
    [tick, setTick] = useState(Date.now()),
    [confirmImport, setConfirmImport] = useState<StudyEvent[] | null>(null);
  const [wordQuery, setWordQuery] = useState(""),
    [swReady, setSwReady] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const today = studyDay(tick);
  useEffect(() => {
    let cancelled = false;
    fetchJSON<{ entries: Entry[] }>("/data/grammar.json")
      .then((data) => {
        if (!Array.isArray(data.entries) || !data.entries.length) throw Error();
        if (!cancelled) setEntries(data.entries);
      })
      .catch(() => {
        if (!cancelled) setLoadError("教材加载失败或超时，请联网后重试。");
      });
    const timer = setInterval(() => setTick(Date.now()), 15000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    if (
      "serviceWorker" in navigator &&
      location.hostname !== "localhost" &&
      location.hostname !== "127.0.0.1"
    )
      navigator.serviceWorker
        .register("/sw.js")
        .then(() => navigator.serviceWorker.ready)
        .then(() => setSwReady(true))
        .catch(() => setSwReady(false));
  }, []);
  const byId = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries]);
  const words = useMemo(() => entries.flatMap(vocabulary), [entries]);
  const wordById = useMemo(() => new Map(words.map((w) => [w.id, w])), [words]);
  const current =
    byId.get(selected || model.position) ||
    entries.find((e) => e.level === "N3") ||
    entries[0];
  const filtered = useMemo(
    () =>
      entries.filter(
        (e) =>
          (level === "ALL" || e.level === level) &&
          (!onlySaved || model.bookmarks[e.id]) &&
          `${e.id} ${e.title} ${e.meaning} ${e.usage}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    [entries, level, onlySaved, model.bookmarks, query],
  );
  const savedWords = words.filter(
    (w) =>
      model.bookmarks[w.id] &&
      `${w.text} ${w.reading} ${w.meaning}`.includes(wordQuery),
  );
  const allDue = Object.entries(model.cards)
    .filter(
      ([id, s]) =>
        s.enrolled &&
        s.card.due.getTime() <= tick &&
        (byId.has(id) || wordById.has(id)),
    )
    .sort((a, b) => a[1].card.due.getTime() - b[1].card.due.getTime());
  const newStarted = model.reviews.filter(
    (e) => e.base === null && studyDay(e.at) === today,
  ).length;
  const due = [
    ...allDue.filter(([, s]) => s.card.reps > 0),
    ...allDue
      .filter(([, s]) => s.card.reps === 0)
      .slice(
        0,
        Math.max(0, Number(model.settings.newLimit ?? 10) - newStarted),
      ),
  ];
  const newToday = model.reviews.filter((e) => studyDay(e.at) === today);
  const finished = tasks.filter((t) => model.tasks[`${today}:${t.id}`]);
  const activeCard = due.find(([id]) => id === reviewId) ?? due[0];
  const reviewEntry = activeCard ? byId.get(activeCard[0]) : undefined;
  const reviewWord = activeCard ? wordById.get(activeCard[0]) : undefined;
  const recommendation =
    entries.find((e) => e.level === "N3" && !model.cards[e.id]?.enrolled) ??
    entries.find((e) => e.level === "N2" && !model.cards[e.id]?.enrolled);
  const noteDraft = useNoteDraft(
    session?.userId,
    current?.id ?? "",
    model.notes[current?.id],
  );
  const journalDraft = useNoteDraft(
    session?.userId,
    `journal:${today}`,
    model.notes[`journal:${today}`],
  );
  const note = noteDraft.text,
    setNote = noteDraft.setText,
    journal = journalDraft.text,
    setJournal = journalDraft.setText;
  useEffect(() => setFlipped(false), [activeCard?.[0]]);
  useEffect(() => {
    const context = (
      document as unknown as {
        modelContext?: {
          registerTool: (tool: unknown, options: unknown) => void;
        };
      }
    ).modelContext;
    if (!context?.registerTool) return;
    const controller = new AbortController();
    try {
      context.registerTool(
        {
          name: "search_grammar",
          title: "搜索语法",
          description:
            "在完整教材中按编号、语法或中文意思搜索，不修改学习记录。",
          inputSchema: {
            type: "object",
            properties: { query: { type: "string" } },
            required: ["query"],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: true },
          execute(input: unknown) {
            if (
              !input ||
              typeof (input as { query?: unknown }).query !== "string"
            )
              throw Error("query必须是文字");
            const q = (input as { query: string }).query;
            return entries
              .filter((e) => `${e.id} ${e.title} ${e.meaning}`.includes(q))
              .slice(0, 20)
              .map((e) => ({
                id: e.id,
                title: e.title,
                meaning: e.meaning,
                page: e.pdf_page,
              }));
          },
        },
        { signal: controller.signal },
      );
    } catch {}
    return () => controller.abort();
  }, [entries]);
  async function action(fn: () => Promise<unknown>, message?: string) {
    try {
      await fn();
      if (message) toast.success(message);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "操作失败，请重试");
    }
  }
  const save = (
    kind: EventKind,
    entity: string,
    value: unknown,
    base?: string | null,
  ) => study.append(kind, entity, value, base);
  async function persistDraft(
    entity: string,
    draft: ReturnType<typeof useNoteDraft>,
  ) {
    const remote = model.notes[entity];
    const resolves = [
      ...(remote?.conflicts.map((c) => c.id) ?? []),
      ...(draft.remoteChanged && remote ? [remote.revision] : []),
    ];
    const event = await study.append(
      "note",
      entity,
      draft.text,
      draft.base,
      resolves,
    );
    draft.saved(event.id);
  }
  function openEntry(id: string) {
    setSelected(id);
    setView("library");
    const e = byId.get(id);
    if (e) setLevel(e.level);
    if (session) void action(() => save("position", "current", id));
  }
  function setting(key: string, value: unknown) {
    void action(() => save("setting", key, value));
  }
  async function rate(rating: number) {
    if (!activeCard || busy) return;
    setBusy(true);
    const [id, state] = activeCard;
    try {
      await save("review", id, rating, state.revision);
      setFlipped(false);
      setReviewId("");
      toast.success(rating === 1 ? "已安排再次复习" : "复习已记录");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }
  async function exportBackup() {
    const backup = {
      format: "kotoba-study",
      version: 1,
      algorithm: ALGORITHM,
      exportedAt: new Date().toISOString(),
      events: combineEvents(study.cache.events, study.cache.pending).map(
        ({ seq, ...e }) => e,
      ),
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `kotoba-backup-${today}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success("备份已导出，请妥善保存");
  }
  async function readImport(file?: File) {
    if (!file) return;
    try {
      if (file.size > 20 * 1024 * 1024) throw Error("备份文件不能超过20MB");
      const data = JSON.parse(await file.text());
      if (
        data.format !== "kotoba-study" ||
        data.version !== 1 ||
        !Array.isArray(data.events) ||
        data.events.length > 100000
      )
        throw Error("这不是支持的言葉备份文件");
      const events = data.events.map((e: unknown) => eventSchema.parse(e));
      if (events.some((e: StudyEvent) => e.at > Date.now() + 300000))
        throw Error("备份包含未来时间，请检查设备时间");
      setConfirmImport(events);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "备份格式无效");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }
  const formatDue = (date: Date) => {
    const min = Math.round((date.getTime() - Date.now()) / 60000);
    return min < 60
      ? `${Math.max(1, min)}分钟`
      : min < 1440
        ? `${Math.round(min / 60)}小时`
        : `${Math.round(min / 1440)}天`;
  };
  const toggleWord = (word: Word) =>
    action(
      () => save("bookmark", word.id, !model.bookmarks[word.id]),
      model.bookmarks[word.id] ? "已移出生词本" : "已加入生词本",
    );
  const pageTitle = NAV.find((n) => n.id === view)?.label;
  if (loadError)
    return (
      <main className="loading-screen">
        <BookOpen size={40} />
        <h1>{loadError}</h1>
        <button className="primary" onClick={() => location.reload()}>
          重新加载
        </button>
      </main>
    );
  if (!entries.length || !ready)
    return (
      <main className="loading-screen">
        <span className="brand-mark">言</span>
        <LoaderCircle className="spin" />
        <p>正在打开你的学习桌面…</p>
        <button className="secondary" onClick={() => location.reload()}>
          重新加载
        </button>
      </main>
    );
  return (
    <SidebarProvider>
      <Toaster position="top-center" richColors />
      <Sidebar className="desktop-sidebar" collapsible="none">
        <SidebarHeader>
          <a className="brand" href="/" aria-label="言葉首页">
            <span className="brand-mark">言</span>
            <span>
              言葉<small>KOTOBA STUDY</small>
            </span>
          </a>
        </SidebarHeader>
        <SidebarContent>
          <div className="sidebar-label">学习空间</div>
          <SidebarMenu>
            {NAV.map((n) => (
              <SidebarMenuItem key={n.id}>
                <SidebarMenuButton
                  isActive={view === n.id}
                  onClick={() => setView(n.id)}
                  className="nav-item"
                >
                  <n.icon />
                  <span>{n.label}</span>
                  {n.id === "review" && due.length > 0 && (
                    <span className="nav-count">{due.length}</span>
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
          <div className="side-goal">
            <Target size={21} />
            <p>下一个里程碑</p>
            <strong>JLPT N2</strong>
            <span>2027 年 7 月</span>
            <div className="goal-line" />
            <small>每天前进一步。</small>
          </div>
        </SidebarContent>
        <SidebarFooter>
          <button
            className="sidebar-account"
            onClick={() => setView("profile")}
          >
            <span className="avatar">学</span>
            <span>
              {session ? "我的学习账户" : "登录并同步"}
              <small>{study.status}</small>
            </span>
            <Settings2 size={17} />
          </button>
        </SidebarFooter>
      </Sidebar>
      <div className="app-main">
        <header className="topbar">
          <div className="breadcrumb">
            <span className="mobile-brand">言葉</span>
            <span className="desktop-only">我的学习空间</span>
            <ChevronRight size={14} />
            <strong>{pageTitle}</strong>
          </div>
          <div className="top-actions">
            <button
              className="sync-button"
              onClick={() =>
                session ? void study.sync() : location.assign(signInHref)
              }
              title={study.error || study.status}
            >
              {study.status.includes("离线") ? (
                <WifiOff size={15} />
              ) : (
                <Cloud size={15} />
              )}
              <span>{study.status}</span>
              {study.cache.pending.length > 0 && (
                <b>{study.cache.pending.length}</b>
              )}
            </button>
            <button
              className="icon-button"
              aria-label="打开声音和显示设置"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings2 size={19} />
            </button>
          </div>
        </header>
        <main
          className={`workspace ${view === "library" ? "library-workspace" : ""}`}
        >
          {!session && (
            <div className="login-banner">
              <Cloud size={20} />
              <div>
                <strong>在每台设备上，接着上次学。</strong>
                <p>登录后保存生词、笔记与复习进度。教材可以直接阅读。</p>
              </div>
              <a className="primary compact" href={signInHref} target="_top">
                登录并同步 <ArrowRight size={15} />
              </a>
            </div>
          )}
          {study.error && (
            <div className="notice" role="status">
              {study.error}
              <button onClick={() => void study.sync()}>重试</button>
            </div>
          )}
          {view === "today" && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">
                    {new Intl.DateTimeFormat("zh-CN", {
                      month: "long",
                      day: "numeric",
                      weekday: "long",
                      timeZone: "Asia/Tokyo",
                    }).format(tick)}
                  </div>
                  <h1>今天，也向前一点。</h1>
                  <p>从一次回忆开始，让学过的日语留下来。</p>
                </div>
                <span className="date-badge">
                  <Target size={17} /> N2 · 2027.07
                </span>
              </div>
              <div className="today-grid">
                <section className="focus-card">
                  <div className="section-kicker">
                    <Layers3 size={17} /> 今日复习
                  </div>
                  <div className="focus-number">
                    {due.length}
                    <span>张卡片待复习</span>
                  </div>
                  <p>
                    {due.length
                      ? "先试着回忆，再翻面确认。"
                      : "你的复习桌面已准备好。把正在学的语法加入进来。"}
                  </p>
                  <button
                    className="light-button"
                    onClick={() =>
                      due.length
                        ? setView("review")
                        : openEntry(recommendation?.id ?? "N3-001")
                    }
                  >
                    {due.length ? "开始复习" : "选择学习内容"}
                    <ArrowRight size={18} />
                  </button>
                  <span className="focus-kanji" aria-hidden="true">
                    習
                  </span>
                </section>
                <section className="daily-card">
                  <div className="section-heading">
                    <h2>今天的学习节奏</h2>
                    <span>120 分钟</span>
                  </div>
                  <div className="daily-progress">
                    <strong>
                      {finished.reduce((sum, t) => sum + t.minutes, 0)}
                      <small> / 120</small>
                    </strong>
                    <span>已完成计划 · 分钟</span>
                  </div>
                  <Progress
                    value={
                      (finished.reduce((sum, t) => sum + t.minutes, 0) / 120) *
                      100
                    }
                  />
                  <div className="mini-stats">
                    <div>
                      <b>{newToday.length}</b>
                      <span>今日复习</span>
                    </div>
                    <div>
                      <b>{words.filter((w) => model.bookmarks[w.id]).length}</b>
                      <span>已收藏生词</span>
                    </div>
                    <div>
                      <b>
                        {
                          Object.values(model.cards).filter((c) => c.enrolled)
                            .length
                        }
                      </b>
                      <span>学习中的卡片</span>
                    </div>
                  </div>
                </section>
              </div>
              <div className="content-columns">
                <section className="panel">
                  <div className="section-heading">
                    <h2>今日计划</h2>
                    <span className="muted">{finished.length} / 5 已完成</span>
                  </div>
                  <div className="task-list">
                    {tasks.map((t, i) => (
                      <div
                        className={`task-row ${model.tasks[`${today}:${t.id}`] ? "completed" : ""}`}
                        key={t.id}
                      >
                        <Checkbox
                          aria-label={`完成${t.label}`}
                          checked={!!model.tasks[`${today}:${t.id}`]}
                          onCheckedChange={(v) =>
                            void action(() =>
                              save("task", `${today}:${t.id}`, v === true),
                            )
                          }
                        />
                        <button
                          className="task-info"
                          onClick={() => {
                            if (t.id === "review") setView("review");
                            else if (t.id === "grammar")
                              openEntry(recommendation?.id ?? model.position);
                            else
                              document.getElementById("daily-journal")?.focus();
                          }}
                        >
                          <strong>
                            <span className="task-index">0{i + 1}</span>
                            {t.label}
                          </strong>
                          <small>{t.description}</small>
                        </button>
                        <span className="duration">{t.minutes} 分钟</span>
                      </div>
                    ))}
                  </div>
                  <p className="footnote">
                    按东京时间记录学习日。完成勾选表示计划完成，不是计时器。
                  </p>
                </section>
                <div className="right-stack">
                  <section className="panel continue-panel">
                    <div className="section-heading">
                      <h2>继续学习</h2>
                      <BookOpen size={19} />
                    </div>
                    <span className="level-badge">{current?.level}</span>
                    <h3>
                      <Ruby text={current?.title ?? ""} />
                    </h3>
                    <p>{current?.meaning}</p>
                    <button
                      className="text-button"
                      onClick={() => openEntry(current.id)}
                    >
                      打开 {current.id}
                      <ArrowRight size={17} />
                    </button>
                  </section>
                  <section className="panel journal-panel">
                    <h2>留下一点收获</h2>
                    <p className="muted">
                      记录阅读 / 听力材料，或用今天的语法造句。
                    </p>
                    <textarea
                      id="daily-journal"
                      value={journal}
                      onChange={(e) => setJournal(e.target.value)}
                      placeholder="今天读了什么？哪个句子让我停下来想了想？"
                      maxLength={12000}
                    />
                    {journalDraft.remoteChanged && (
                      <div className="notice">
                        另一设备已更新：{model.notes[`journal:${today}`]?.text}
                        。本机草稿已保留，请合并后保存。
                      </div>
                    )}
                    {model.notes[`journal:${today}`]?.conflicts.map((c) => (
                      <div className="notice" key={c.id}>
                        待合并笔记：{c.text}
                      </div>
                    ))}
                    <button
                      className="secondary"
                      onClick={() =>
                        void action(
                          () => persistDraft(`journal:${today}`, journalDraft),
                          "今日笔记已保存",
                        )
                      }
                    >
                      {journalDraft.remoteChanged ||
                      model.notes[`journal:${today}`]?.conflicts.length
                        ? "保存并合并冲突"
                        : "保存今日笔记"}
                    </button>
                  </section>
                </div>
              </div>
            </>
          )}
          {view === "library" && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">N5 → N2 · 622 条语法</div>
                  <h1>语法库</h1>
                  <p>读懂一个用法，放回一个句子。</p>
                </div>
                <a
                  className="secondary compact"
                  href="/docs/Japanese_Grammar_N5-N2_Furigana.pdf"
                  target="_blank"
                  rel="noreferrer"
                >
                  <BookOpen size={16} />
                  原书 PDF
                </a>
              </div>
              <div className="library-layout">
                <section className="catalog">
                  <label className="search-field">
                    <Search size={18} />
                    <input
                      aria-label="搜索语法"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="搜索语法、编号或意思"
                    />
                  </label>
                  <Tabs value={level} onValueChange={setLevel}>
                    <TabsList className="level-tabs">
                      {["N5", "N4", "N3", "N2", "ALL"].map((l) => (
                        <TabsTrigger key={l} value={l}>
                          {l === "ALL" ? "全部" : l}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </Tabs>
                  <label className="check-label">
                    <Checkbox
                      checked={onlySaved}
                      onCheckedChange={(v) => setOnlySaved(v === true)}
                    />
                    只看收藏 <span className="muted">{filtered.length} 条</span>
                  </label>
                  <div className="catalog-list">
                    {filtered.map((e) => (
                      <button
                        key={e.id}
                        className={`catalog-item ${current?.id === e.id ? "active" : ""}`}
                        onClick={() => openEntry(e.id)}
                      >
                        <span>
                          {e.id}
                          <small>原书 P.{e.pdf_page}</small>
                        </span>
                        <strong>
                          <Ruby text={e.title} show={false} />
                        </strong>
                        <p>{e.meaning}</p>
                        {model.cards[e.id]?.enrolled && (
                          <span className="enrolled-dot">复习中</span>
                        )}
                      </button>
                    ))}
                    {!filtered.length && (
                      <div className="empty-state">
                        <Search />
                        <p>没有找到匹配的语法</p>
                        <button
                          onClick={() => {
                            setQuery("");
                            setOnlySaved(false);
                            setLevel("ALL");
                          }}
                        >
                          清除筛选
                        </button>
                      </div>
                    )}
                  </div>
                </section>
                <article className="lesson panel" key={current.id}>
                  <div className="lesson-meta">
                    <span className="level-badge">{current.level}</span>
                    <span>{current.id}</span>
                    <a
                      href={`/docs/Japanese_Grammar_N5-N2_Furigana.pdf#page=${current.pdf_page}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      原书 P.{current.pdf_page}
                      <ExternalLink size={12} />
                    </a>
                    <button
                      className={`icon-button bookmark ${model.bookmarks[current.id] ? "saved" : ""}`}
                      aria-label={
                        model.bookmarks[current.id]
                          ? "取消收藏语法"
                          : "收藏语法"
                      }
                      onClick={() =>
                        void action(() =>
                          save(
                            "bookmark",
                            current.id,
                            !model.bookmarks[current.id],
                          ),
                        )
                      }
                    >
                      <Bookmark size={21} />
                    </button>
                  </div>
                  <h2 className="grammar-title">
                    <Ruby text={current.title} />
                  </h2>
                  <p className="meaning">{current.meaning}</p>
                  <div className="lesson-actions">
                    <button
                      className="primary"
                      onClick={() => void action(() => audio.play([current]))}
                    >
                      <Play size={17} />
                      播放本条
                    </button>
                    <button
                      className="secondary"
                      onClick={() =>
                        void action(
                          () =>
                            save(
                              "enroll",
                              current.id,
                              !model.cards[current.id]?.enrolled,
                            ),
                          model.cards[current.id]?.enrolled
                            ? "已暂停复习"
                            : "已加入复习计划",
                        )
                      }
                    >
                      <Layers3 size={17} />
                      {model.cards[current.id]?.enrolled
                        ? "暂停复习"
                        : "加入复习"}
                    </button>
                    <button
                      className="text-button"
                      onClick={() =>
                        void action(() =>
                          audio.play(
                            filtered.slice(
                              Math.max(
                                0,
                                filtered.findIndex((e) => e.id === current.id),
                              ),
                            ),
                          ),
                        )
                      }
                    >
                      连续播放
                    </button>
                  </div>
                  <div className="explanation">
                    <h3>接续与用法</h3>
                    <p>
                      <Ruby text={current.usage} />
                    </p>
                  </div>
                  <div className="caution">
                    <span>留意这里</span>
                    <p>
                      <Ruby text={current.caution} />
                    </p>
                  </div>
                  <div className="section-heading examples-heading">
                    <h3>放进句子里</h3>
                    <div className="display-switches">
                      <label>
                        假名
                        <Switch
                          checked={model.settings.ruby !== false}
                          onCheckedChange={(v) => setting("ruby", v)}
                        />
                      </label>
                      <label>
                        译文
                        <Switch
                          checked={model.settings.translation !== false}
                          onCheckedChange={(v) => setting("translation", v)}
                        />
                      </label>
                    </div>
                  </div>
                  {current.examples.map((ex, i) => (
                    <section className="example" key={i}>
                      <div className="example-label">
                        例句 0{i + 1}
                        <button
                          className="icon-button"
                          aria-label={`播放例句${i + 1}`}
                          onClick={() =>
                            void action(() => audio.play([current], i))
                          }
                        >
                          <Volume2 size={19} />
                        </button>
                      </div>
                      <p className="japanese" lang="ja">
                        <Ruby
                          text={ex.japanese_annotated}
                          show={model.settings.ruby !== false}
                        />
                      </p>
                      {model.settings.translation !== false && (
                        <p className="translation">{ex.chinese}</p>
                      )}
                    </section>
                  ))}
                  <div className="vocab-section">
                    <h3>句子里的生词</h3>
                    <div className="word-chips">
                      {vocabulary(current).map((w) => (
                        <button
                          className={
                            model.bookmarks[w.id]
                              ? "word-chip saved"
                              : "word-chip"
                          }
                          key={w.id}
                          onClick={() => void toggleWord(w)}
                          title={`${w.reading} · ${w.meaning}`}
                        >
                          <Ruby text={w.original.split(/[：:]/)[0]} />
                          {model.bookmarks[w.id] ? (
                            <Check size={13} />
                          ) : (
                            <Plus size={13} />
                          )}
                        </button>
                      ))}
                    </div>
                    <p className="footnote">
                      点击词语收藏到生词本；收藏后可单独加入复习。
                    </p>
                  </div>
                  <div className="lesson-note">
                    <h3>我的笔记</h3>
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      maxLength={12000}
                      placeholder="记下理解、易混点，或自己的例句…"
                    />
                    {noteDraft.remoteChanged && (
                      <div className="notice">
                        另一设备已更新：{model.notes[current.id]?.text}
                        。本机草稿已保留，请合并后保存。
                      </div>
                    )}
                    {model.notes[current.id]?.conflicts.map((c, i) => (
                      <div className="notice" key={i}>
                        另一设备的笔记：{c.text}
                      </div>
                    ))}
                    <button
                      className="secondary"
                      onClick={() =>
                        void action(
                          () => persistDraft(current.id, noteDraft),
                          "笔记已保存",
                        )
                      }
                    >
                      {noteDraft.remoteChanged ||
                      model.notes[current.id]?.conflicts.length
                        ? "保存并合并冲突"
                        : "保存笔记"}
                    </button>
                  </div>
                  <div className="lesson-bottom">
                    <button
                      className="text-button"
                      disabled={
                        entries.findIndex((e) => e.id === current.id) === 0
                      }
                      onClick={() =>
                        openEntry(
                          entries[
                            Math.max(
                              0,
                              entries.findIndex((e) => e.id === current.id) - 1,
                            )
                          ].id,
                        )
                      }
                    >
                      <ChevronLeft size={17} />
                      上一条
                    </button>
                    <button
                      className="text-button"
                      disabled={
                        entries.findIndex((e) => e.id === current.id) ===
                        entries.length - 1
                      }
                      onClick={() =>
                        openEntry(
                          entries[
                            Math.min(
                              entries.length - 1,
                              entries.findIndex((e) => e.id === current.id) + 1,
                            )
                          ].id,
                        )
                      }
                    >
                      下一条
                      <ChevronRight size={17} />
                    </button>
                  </div>
                </article>
              </div>
            </>
          )}
          {view === "review" && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">SPACED REPETITION</div>
                  <h1>给记忆一点时间。</h1>
                  <p>先在心里回答，再翻面。忘记时，选择“忘记了”。</p>
                </div>
                <span className="date-badge">
                  今日已复习 {newToday.length} 张
                </span>
              </div>
              {activeCard ? (
                <div className="review-area">
                  <div className="review-top">
                    <span>{reviewEntry ? "语法理解卡" : "生词卡"}</span>
                    <span>待复习 {due.length} 张</span>
                  </div>
                  <article className={`flashcard ${flipped ? "flipped" : ""}`}>
                    <span className="level-badge">
                      {reviewEntry?.level ?? "生词"}
                    </span>
                    <p className="card-prompt">
                      {reviewEntry
                        ? "它是什么意思？怎样接续？"
                        : "试着读出来，并回忆它的意思。"}
                    </p>
                    <h2 lang="ja">
                      {reviewEntry ? (
                        <Ruby text={reviewEntry.title} />
                      ) : (
                        reviewWord?.text
                      )}
                    </h2>
                    {flipped ? (
                      <div className="card-answer">
                        {reviewEntry ? (
                          <>
                            <p className="answer-meaning">
                              {reviewEntry.meaning}
                            </p>
                            <p>{reviewEntry.usage}</p>
                            <p className="japanese" lang="ja">
                              <Ruby
                                text={
                                  reviewEntry.examples[0].japanese_annotated
                                }
                              />
                            </p>
                            <p className="muted">
                              {reviewEntry.examples[0].chinese}
                            </p>
                            <button
                              className="text-button"
                              onClick={() =>
                                void action(() => audio.play([reviewEntry], 0))
                              }
                            >
                              <Volume2 size={18} />
                              听例句
                            </button>
                          </>
                        ) : (
                          <>
                            <p className="reading" lang="ja">
                              {reviewWord?.reading}
                            </p>
                            <p className="answer-meaning">
                              {reviewWord?.meaning}
                            </p>
                            <p className="muted">来自 {reviewWord?.source}</p>
                            <button
                              className="text-button"
                              onClick={() =>
                                void action(() => audio.word(reviewWord!.text))
                              }
                            >
                              <Volume2 size={18} />
                              听读音
                            </button>
                          </>
                        )}
                      </div>
                    ) : (
                      <button
                        className="primary flip-button"
                        onClick={() => setFlipped(true)}
                      >
                        显示答案
                        <ArrowRight size={17} />
                      </button>
                    )}
                  </article>
                  {flipped && (
                    <div className="rating-row">
                      {[
                        { n: 1, label: "忘记了", cls: "again" },
                        { n: 2, label: "很费力", cls: "hard" },
                        { n: 3, label: "记得", cls: "good" },
                        { n: 4, label: "很轻松", cls: "easy" },
                      ].map((r) => (
                        <button
                          className={r.cls}
                          key={r.n}
                          disabled={busy}
                          onClick={() => void rate(r.n)}
                        >
                          <strong>{r.label}</strong>
                          <span>
                            {formatDue(
                              scheduler.next(
                                activeCard[1].card,
                                new Date(tick),
                                r.n as Grade,
                              ).card.due,
                            )}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  <p className="footnote">
                    翻面前先回忆。间隔是算法估计，会随你的复习表现调整。
                  </p>
                  <button
                    className="text-button"
                    onClick={() =>
                      openEntry(reviewEntry?.id ?? reviewWord!.source)
                    }
                  >
                    回到原文
                    <ArrowRight size={15} />
                  </button>
                </div>
              ) : (
                <div className="empty-state large">
                  <div className="empty-icon">
                    <Check size={35} />
                  </div>
                  <h2>
                    {Object.values(model.cards).some((c) => c.enrolled)
                      ? allDue.some(([, s]) => s.card.reps === 0)
                        ? "今天的新卡额度已用完"
                        : "当前到期内容已完成"
                      : "从第一张卡片开始"}
                  </h2>
                  <p>
                    {Object.values(model.cards).some((c) => c.enrolled)
                      ? "可以去读一篇文章，或继续少量新内容。"
                      : "在语法详情或生词本中，选择“加入复习”。"}
                  </p>
                  <button
                    className="primary"
                    onClick={() => openEntry(recommendation?.id ?? "N3-001")}
                  >
                    去语法库
                    <ArrowRight size={17} />
                  </button>
                </div>
              )}
              {model.conflicts > 0 && (
                <p className="notice">
                  {model.conflicts}{" "}
                  次多设备重复评分已保留在历史中，没有重复推进复习间隔。
                </p>
              )}
            </>
          )}
          {view === "words" && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">MY VOCABULARY</div>
                  <h1>在句子里遇见的词。</h1>
                  <p>保留读音，也保留你遇见它的地方。</p>
                </div>
                <span className="date-badge">
                  {words.filter((w) => model.bookmarks[w.id]).length} 个收藏
                </span>
              </div>
              <label className="search-field word-search">
                <Search size={18} />
                <input
                  aria-label="搜索生词"
                  value={wordQuery}
                  onChange={(e) => setWordQuery(e.target.value)}
                  placeholder="搜索写法、读音或中文意思"
                />
              </label>
              {savedWords.length ? (
                <div className="word-grid">
                  {savedWords.map((w) => (
                    <article className="panel word-card" key={w.id}>
                      <div className="section-heading">
                        <span className="word-source">{w.source}</span>
                        <button
                          className="icon-button"
                          aria-label={`移除${w.text}`}
                          onClick={() => void toggleWord(w)}
                        >
                          <X size={17} />
                        </button>
                      </div>
                      <h2 lang="ja">{w.text}</h2>
                      <p className="reading" lang="ja">
                        {w.reading}
                      </p>
                      <p className="word-meaning">{w.meaning}</p>
                      <p className="word-context" lang="ja">
                        {byId
                          .get(w.source)
                          ?.examples.find((e) => e.japanese.includes(w.text))
                          ?.japanese ??
                          byId.get(w.source)?.examples[0].japanese}
                      </p>
                      <div className="word-actions">
                        <button
                          className="icon-button"
                          aria-label={`播放${w.text}`}
                          onClick={() => void action(() => audio.word(w.text))}
                        >
                          <Volume2 size={19} />
                        </button>
                        <button
                          className="text-button"
                          onClick={() => openEntry(w.source)}
                        >
                          看原文
                        </button>
                        <button
                          className="secondary compact"
                          onClick={() =>
                            void action(() =>
                              save(
                                "enroll",
                                w.id,
                                !model.cards[w.id]?.enrolled,
                              ),
                            )
                          }
                        >
                          {model.cards[w.id]?.enrolled
                            ? "暂停复习"
                            : "加入复习"}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="empty-state large">
                  <Bookmark size={38} />
                  <h2>{wordQuery ? "没有找到这个词" : "把遇见的生词留下来"}</h2>
                  <p>
                    在语法详情中点击词语，即可收藏。收藏和加入复习可以分别选择。
                  </p>
                  <button
                    className="primary"
                    onClick={() => openEntry(model.position)}
                  >
                    去收藏第一个词
                    <ArrowRight size={17} />
                  </button>
                </div>
              )}
            </>
          )}
          {view === "profile" && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">MY LEARNING</div>
                  <h1>让学习接得上。</h1>
                  <p>查看进度，管理声音、同步和备份。</p>
                </div>
              </div>
              <div className="profile-grid">
                <section className="panel">
                  <div className="section-heading">
                    <h2>账户与同步</h2>
                    <Cloud size={20} />
                  </div>
                  <p>{session ? "已登录学习账户" : "尚未登录"}</p>
                  <p className="muted">
                    电脑、iPhone 和 iPad 使用同一个 ChatGPT
                    账号，学习记录即可自动同步。
                  </p>
                  <div className="sync-detail">
                    <span>{study.status}</span>
                    <span>{study.cache.pending.length} 条待上传</span>
                  </div>
                  <div className="button-row">
                    {session ? (
                      <>
                        <button
                          className="primary"
                          onClick={() => void study.sync()}
                        >
                          立即同步
                        </button>
                        <button
                          className="secondary"
                          onClick={() => void action(study.signout)}
                        >
                          <LogOut size={16} />
                          退出登录
                        </button>
                      </>
                    ) : (
                      <a className="primary" href={signInHref} target="_top">
                        登录并同步
                      </a>
                    )}
                  </div>
                  <p className="footnote">
                    个人记录仅对当前账号开放。离线更改会先保存在本机，联网后补同步。
                  </p>
                </section>
                <section className="panel">
                  <h2>备份与恢复</h2>
                  <p className="muted">
                    完整导出卡片、复习记录、生词和笔记。恢复会合并记录，保留已有内容。
                  </p>
                  <div className="button-row">
                    <button
                      className="secondary"
                      onClick={() => void exportBackup()}
                    >
                      <Download size={17} />
                      导出备份
                    </button>
                    <button
                      className="secondary"
                      onClick={() => fileRef.current?.click()}
                    >
                      <Upload size={17} />
                      导入备份
                    </button>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="application/json,.json"
                      hidden
                      onChange={(e) => void readImport(e.target.files?.[0])}
                    />
                  </div>
                  <p className="footnote">
                    备份含你的私人笔记，请不要提交到公开 GitHub 仓库。
                  </p>
                </section>
                <section className="panel">
                  <h2>最近七天</h2>
                  <div className="activity-chart">
                    {Array.from({ length: 7 }, (_, i) => {
                      const day = studyDay(tick - (6 - i) * 86400000),
                        count = model.reviews.filter(
                          (r) => studyDay(r.at) === day,
                        ).length;
                      return (
                        <div key={day}>
                          <span>{count}</span>
                          <div className="bar-track">
                            <div
                              style={{ height: Math.min(100, count * 8) + "%" }}
                            />
                          </div>
                          <small>{day.slice(5)}</small>
                        </div>
                      );
                    })}
                  </div>
                  <p className="footnote">
                    已接受的复习次数，不代表掌握程度或考试通过率。
                  </p>
                </section>
                <section className="panel">
                  <h2>你的备考路线</h2>
                  <ol className="roadmap">
                    <li>
                      <b>现在—2026.11</b>
                      <span>N4 补缺，推进 N3</span>
                    </li>
                    <li>
                      <b>2026.12—2027.02</b>
                      <span>N3 巩固，系统学习 N2</span>
                    </li>
                    <li>
                      <b>2027.03—05</b>
                      <span>N2 阅读、听力与综合训练</span>
                    </li>
                    <li>
                      <b>2027.06—考试</b>
                      <span>模拟练习，集中处理薄弱项</span>
                    </li>
                  </ol>
                  <p className="footnote">
                    阶段随实际表现调整。N1
                    内容尚未加入；目标月份不是已确认的具体考试日期。
                  </p>
                </section>
                <section className="panel">
                  <h2>安装与离线使用</h2>
                  <p>
                    iPhone / iPad：用 Safari
                    打开，在分享菜单选择“添加到主屏幕”。电脑可使用浏览器的安装应用功能。
                  </p>
                  <p className="muted">
                    {swReady
                      ? "离线功能已就绪。请先打开要用的页面，再离线学习。"
                      : "在线版本支持缓存教材与应用；本地开发预览不启用离线缓存。"}
                  </p>
                  <p className="footnote">
                    浏览器点读声音可能需要网络。锁屏和后台播放效果取决于设备，尚未在你的
                    iPhone / iPad 上实测。
                  </p>
                </section>
                <section className="panel">
                  <h2>听读样例</h2>
                  <p className="muted">
                    前三条已生成
                    MP3，可下载试听。已检查解码和字幕，尚未完成读音审校。
                  </p>
                  {["N5-001", "N5-002", "N5-003"].map((id) => (
                    <div className="sample-track" key={id}>
                      <strong>{id}</strong>
                      <audio controls preload="none" src={`/audio/${id}.mp3`} />
                      <a
                        href={`/audio/${id}.mp3`}
                        download
                        aria-label={`下载${id}`}
                      >
                        <Download size={17} />
                      </a>
                    </div>
                  ))}
                  <p className="footnote">
                    范围：例句跟读，含中文译文；不是完整语法讲解录音。
                  </p>
                </section>
              </div>
              <div className="about-line">
                <span>言葉 · v0.1.0 · 全量 622 条 / 1,244 例句</span>
                <a
                  href="https://github.com/Miso-Soup98/kotoba-study"
                  target="_blank"
                  rel="noreferrer"
                >
                  GitHub 源码
                  <ExternalLink size={14} />
                </a>
                <a href="/reader.html" target="_blank" rel="noreferrer">
                  原版点读页
                </a>
              </div>
            </>
          )}
        </main>
        <nav className="mobile-nav" aria-label="主要导航">
          {NAV.map((n) => (
            <button
              key={n.id}
              className={view === n.id ? "active" : ""}
              onClick={() => setView(n.id)}
            >
              <n.icon size={21} />
              <span>{n.label}</span>
            </button>
          ))}
        </nav>
        {audio.playing && (
          <div className="audio-bar" role="status">
            <span className="audio-icon">
              <Headphones size={20} />
            </span>
            <div>
              <strong>{audio.playing}</strong>
              <span>{audio.paused ? "已暂停" : "正在朗读"}</span>
            </div>
            <button
              className="icon-button"
              aria-label={audio.paused ? "继续播放" : "暂停播放"}
              onClick={audio.pause}
            >
              {audio.paused ? <Play size={20} /> : <Pause size={20} />}
            </button>
            <button
              className="icon-button"
              aria-label="停止播放"
              onClick={audio.stop}
            >
              <Square size={18} />
            </button>
          </div>
        )}
      </div>
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="settings-dialog">
          <DialogHeader>
            <DialogTitle>声音与显示</DialogTitle>
            <DialogDescription>
              中日语分别选择声音。设置会随账号同步。
            </DialogDescription>
          </DialogHeader>
          <div className="form-field">
            <label>每天开始的新卡</label>
            <Choice
              label="每天开始的新卡"
              value={String(model.settings.newLimit ?? 10)}
              onChange={(v) => setting("newLimit", Number(v))}
              options={[0, 5, 10, 15, 20].map((v) => ({
                value: String(v),
                label: v === 0 ? "暂停新卡，只复习已学内容" : `${v} 张`,
              }))}
            />
            <p className="footnote">
              到期旧卡优先。新卡额度用完后，其他已加入的卡片会留到之后学习。
            </p>
          </div>
          {(["ja", "zh"] as const).map((lang) => (
            <div className="form-field" key={lang}>
              <label>{lang === "ja" ? "日语声音" : "中文声音"}</label>
              <Choice
                label={`${lang}声音`}
                value={String(model.settings[lang + "Voice"] ?? "auto")}
                onChange={(v) => setting(lang + "Voice", v)}
                options={[
                  { value: "auto", label: "自动选择对应语言" },
                  ...audio.voices
                    .filter((v) => v.lang.startsWith(lang))
                    .map((v) => ({ value: v.voiceURI, label: v.name })),
                ]}
              />
            </div>
          ))}
          <button className="text-button" onClick={audio.refresh}>
            刷新声音列表（
            {audio.voices.filter((v) => v.lang.startsWith("ja")).length}{" "}
            个日语声音）
          </button>
          <div className="form-two">
            <div className="form-field">
              <label>基础语速</label>
              <Choice
                label="基础语速"
                value={String(model.settings.speed ?? 1)}
                onChange={(v) => setting("speed", Number(v))}
                options={[0.65, 0.8, 1, 1.15, 1.25].map((v) => ({
                  value: String(v),
                  label: `${v}×`,
                }))}
              />
            </div>
            <div className="form-field">
              <label>跟读留白</label>
              <Choice
                label="跟读留白"
                value={String(model.settings.gap ?? 4)}
                onChange={(v) => setting("gap", Number(v))}
                options={[1, 2, 4, 6, 8].map((v) => ({
                  value: String(v),
                  label: `${v} 秒`,
                }))}
              />
            </div>
          </div>
          <div className="form-field">
            <label>播放方式</label>
            <Choice
              label="播放方式"
              value={String(model.settings.audioMode ?? "study")}
              onChange={(v) => setting("audioMode", v)}
              options={[
                {
                  value: "study",
                  label: "跟读：日语 → 译文 → 慢读 → 留白 → 复读",
                },
                { value: "review", label: "复习：日语 → 可选译文 → 留白" },
              ]}
            />
          </div>
          <label className="switch-row">
            朗读中文译文
            <Switch
              checked={model.settings.withChinese !== false}
              onCheckedChange={(v) => setting("withChinese", v)}
            />
          </label>
          <label className="switch-row">
            按书中假名送读
            <Switch
              checked={!!model.settings.useReadings}
              onCheckedChange={(v) => setting("useReadings", v)}
            />
          </label>
          <p className="footnote">
            默认读日语原句，不重复朗读括号注音。假名稿未经逐句发音审核。网络声音可能将所读文字发送给语音提供方。
          </p>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!confirmImport}
        onOpenChange={(v) => !v && setConfirmImport(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>合并学习备份</DialogTitle>
            <DialogDescription>
              将 {confirmImport?.length}{" "}
              条记录合并到当前账号，并在联网后同步。重复记录会自动跳过。
            </DialogDescription>
          </DialogHeader>
          <div className="button-row">
            <button
              className="secondary"
              onClick={() => setConfirmImport(null)}
            >
              取消
            </button>
            <button
              className="primary"
              onClick={() =>
                void action(async () => {
                  await study.importEvents(confirmImport!);
                  setConfirmImport(null);
                }, "备份已合并")
              }
            >
              确认合并
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}
