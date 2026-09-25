"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  Bookmark,
  Check,
  Headphones,
  Search,
  ExternalLink,
  Plus,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fetchJSON } from "@/lib/study/session";
import { lookupWord } from "@/lib/ted/lookup";
import { TedCorrections } from "./ted-corrections";
import {
  formatTime,
  type TedSummary,
  type TedArticle,
  type TedParagraph,
  type TedToken,
} from "@/lib/ted/types";
import type { useStudy } from "@/lib/study/use-study";
import { makeTedWord } from "@/lib/ted/word";
import { TedPlayer } from "./ted-player";
import { LessonDialog, LessonText } from "./ted-lessons";
import {
  lessonWord,
  matchLessons,
  type LessonPattern,
  type LessonMatch,
} from "@/lib/ted/lessons";
import { toast } from "sonner";

type Props = {
  study: ReturnType<typeof useStudy>;
  selectedId: string;
  onSelect: (id: string) => void;
  onStartAudio: () => void;
  onGrammar: (id: string) => void;
};
type SelectedWord = { token: TedToken; paragraph: TedParagraph };
export function TedStudy({
  study,
  selectedId,
  onSelect,
  onStartAudio,
  onGrammar,
}: Props) {
  const [patterns, setPatterns] = useState<LessonPattern[]>([]),
    [patternError, setPatternError] = useState(false);
  const [layer, setLayer] = useState("word");
  const [selectedLesson, setSelectedLesson] = useState<{
    match: LessonMatch;
    paragraph: TedParagraph;
  } | null>(null);
  const [savingLesson, setSavingLesson] = useState(false);
  useEffect(() => {
    const request = new AbortController();
    fetchJSON<LessonPattern[]>("/data/ted-patterns.json", 12000, request.signal)
      .then(setPatterns)
      .catch(() => {
        if (!request.signal.aborted) setPatternError(true);
      });
    return () => request.abort();
  }, []);
  const [catalog, setCatalog] = useState<TedSummary[]>([]),
    [article, setArticle] = useState<TedArticle | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [retry, setRetry] = useState(0);
  const [search, setSearch] = useState(""),
    [collection, setCollection] = useState("all"),
    [filter, setFilter] = useState("all"),
    [page, setPage] = useState(1);
  const [paragraphId, setParagraphId] = useState<string>(),
    [activeParagraph, setActiveParagraph] = useState<string>(),
    [selectedWord, setSelectedWord] = useState<SelectedWord | null>(null),
    [desktopOpen, setDesktopOpen] = useState(false),
    [mobileOpen, setMobileOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement | null>(null),
    pinnedWord = useRef(false),
    hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showChinese, setShowChinese] = useState(true),
    [showRuby, setShowRuby] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const request = new AbortController();
    setError("");
    setLoading(true);
    setCatalog([]);
    if (!study.session) {
      setLoading(false);
      return;
    }
    fetchJSON<{ articles: TedSummary[] }>("/api/ted", 12000, request.signal)
      .then((data) => {
        if (!cancelled) setCatalog(data.articles);
      })
      .catch(() => {
        if (!cancelled) setError("资料目录加载失败，请检查网络后重试。");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      request.abort();
    };
  }, [study.session?.userId, retry]);
  useEffect(() => {
    let cancelled = false;
    const request = new AbortController();
    setArticle(null);
    setSelectedLesson(null);
    setSelectedWord(null);
    setDesktopOpen(false);
    setMobileOpen(false);
    setParagraphId(undefined);
    setActiveParagraph(undefined);
    if (!selectedId || !study.session) return;
    setLoading(true);
    setError("");
    fetchJSON<TedArticle>(
      `/api/ted/article?id=${selectedId}`,
      20000,
      request.signal,
    )
      .then((data) => {
        if (!cancelled) setArticle(data);
      })
      .catch(() => {
        if (!cancelled) setError("文章加载失败，已保存的标记仍在。请重试。");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      request.abort();
    };
  }, [selectedId, study.session?.userId, retry]);
  useEffect(
    () => () => {
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
    },
    [],
  );
  const filtered = useMemo(
    () =>
      catalog.filter(
        (a) =>
          (collection === "all" || a.collection === collection) &&
          `${a.id} ${a.number} ${a.title}`
            .toLowerCase()
            .includes(search.toLowerCase()) &&
          (filter !== "saved" || study.model.bookmarks[a.id]) &&
          (filter !== "unfinished" || !study.model.tasks[`ted-done:${a.id}`]),
      ),
    [
      catalog,
      collection,
      search,
      filter,
      study.model.bookmarks,
      study.model.tasks,
    ],
  );
  const summary = catalog.find((a) => a.id === selectedId);
  const lessonMatches = useMemo(
    () =>
      new Map(
        (article?.paragraphs ?? []).map((paragraph) => [
          paragraph.id,
          {
            phrase: matchLessons(paragraph.japanese, patterns, "phrase"),
            grammar: matchLessons(paragraph.japanese, patterns, "grammar"),
          },
        ]),
      ),
    [article, patterns],
  );
  const lessonCount = (kind: "phrase" | "grammar") =>
    [...lessonMatches.values()].reduce(
      (sum, matches) => sum + matches[kind].length,
      0,
    );
  async function saveLesson() {
    if (!selectedLesson || !article || savingLesson) return;
    setSavingLesson(true);
    try {
      const word = lessonWord(
        article.id,
        selectedLesson.paragraph,
        selectedLesson.match,
      );
      await study.append("ted_word", word.id, JSON.stringify(word));
      await study.append("bookmark", word.id, true);
      await study.append("enroll", word.id, true);
      toast.success("已加入生词本与复习，记录会自动同步");
    } catch {
      toast.error("表达未能完整保存，请重试");
    } finally {
      setSavingLesson(false);
    }
  }
  function clearHover() {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = null;
  }
  function chooseWord(
    token: TedToken,
    paragraph: TedParagraph,
    target: HTMLButtonElement,
    mobile = false,
    pinned = false,
  ) {
    clearHover();
    pinnedWord.current = pinned;
    anchor.current = target;
    setSelectedWord({ token, paragraph });
    setDesktopOpen(!mobile && !pinned);
    setMobileOpen(mobile || pinned);
  }
  async function toggleSaved(id: string) {
    try {
      await study.append("bookmark", id, !study.model.bookmarks[id]);
    } catch {
      toast.error("收藏未保存，请重试");
    }
  }
  async function saveWord() {
    if (!selectedWord || !article) return;
    const { token, paragraph } = selectedWord;
    try {
      const word = await makeTedWord(article, paragraph, token);
      await study.append("ted_word", word.id, JSON.stringify(word));
      await study.append("bookmark", word.id, true);
      toast.success("已加入生词本，可继续加入复习");
    } catch {
      toast.error("生词保存失败，请重试");
    }
  }
  function wordDetails(interactive = true) {
    if (!selectedWord || !article) return null;
    const { token, paragraph } = selectedWord,
      { gloss, source } = lookupWord(article, token);
    return (
      <div className="ted-word-detail">
        <p className="ted-word-reading" lang="ja">
          {token.reading || gloss?.reading || "读音待核对"}
        </p>
        <h3 lang="ja">{token.surface}</h3>
        <p className="ted-lemma">
          原形：{token.lemma || token.surface}
          {gloss?.reading && gloss.reading !== token.reading
            ? `（${gloss.reading}）`
            : ""}
        </p>
        <h4>意思</h4>
        <p>
          {gloss?.meaning ||
            "暂未收录这个词的中文释义，请结合下方原句和译文核对。"}
        </p>
        <h4>用法</h4>
        <p>{token.pos || "词性待核对"}</p>
        {gloss?.usage && <p>{gloss.usage}</p>}
        <h4>在这篇文章里</h4>
        <p className="ted-word-example" lang="ja">
          {paragraph.japanese}
        </p>
        <p>{paragraph.chinese || "本段中文待核对"}</p>
        {gloss?.examples?.map((ex, i) => (
          <div key={i}>
            <p lang="ja">{ex.japanese}</p>
            <p>{ex.chinese}</p>
          </div>
        ))}
        <p className="footnote">
          {source} · 词义为候选解释；自动读音和扫描识别结果需结合原PDF核对。{" "}
          <a
            href="/ted-licenses/THIRD_PARTY_NOTICES.md"
            target="_blank"
            rel="noreferrer"
          >
            词典来源与许可
          </a>
        </p>
        {interactive ? (
          <button className="primary" onClick={() => void saveWord()}>
            <Plus size={16} />
            加入生词本
          </button>
        ) : (
          <p className="footnote">点按原文词语，打开完整词卡并加入生词本。</p>
        )}
      </div>
    );
  }
  if (!study.session)
    return (
      <div className="empty-state large">
        <BookOpen size={36} />
        <h2>登录后打开你的精读资料</h2>
        <p>文章、原音频与个人循环标记都在自己的学习空间中。</p>
      </div>
    );
  if (error)
    return (
      <section className="panel">
        <p role="alert">{error}</p>
        <button className="primary" onClick={() => setRetry((x) => x + 1)}>
          重新加载
        </button>
        {selectedId && (
          <button className="text-button" onClick={() => onSelect("")}>
            返回目录
          </button>
        )}
      </section>
    );
  if (!selectedId)
    return (
      <div className="ted-library">
        <div className="page-heading">
          <div>
            <div className="eyebrow">LISTEN · READ · REPEAT</div>
            <h1>TED 与日刊精读</h1>
            <p>听原声，读原文，把没听清的地方留下来。</p>
          </div>
          <span className="date-badge">{catalog.length} 篇资料</span>
        </div>
        <label className="search-field">
          <Search size={18} />
          <input
            aria-label="搜索TED资料"
            placeholder="搜索标题或编号"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <div className="ted-library-filters">
          <Tabs
            value={collection}
            onValueChange={(v) => {
              setCollection(v);
              setPage(1);
            }}
          >
            <TabsList>
              <TabsTrigger value="all">全部</TabsTrigger>
              <TabsTrigger value="old">TED 演讲</TabsTrigger>
              <TabsTrigger value="new">日刊精读</TabsTrigger>
            </TabsList>
          </Tabs>
          <Tabs
            value={filter}
            onValueChange={(v) => {
              setFilter(v);
              setPage(1);
            }}
          >
            <TabsList>
              <TabsTrigger value="all">所有文章</TabsTrigger>
              <TabsTrigger value="saved">收藏</TabsTrigger>
              <TabsTrigger value="unfinished">未完成</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        {loading ? (
          <p role="status">正在打开资料目录…</p>
        ) : !filtered.length ? (
          <section className="empty-state panel">
            <BookOpen size={30} />
            <h2>{catalog.length ? "没有符合条件的资料" : "资料正在准备中"}</h2>
            <p>
              {catalog.length
                ? "换个标题或筛选条件试试。"
                : "导入完成后会显示在这里。"}
            </p>
          </section>
        ) : (
          <>
            <div className="ted-catalog">
              {filtered.slice((page - 1) * 24, page * 24).map((a) => (
                <article className="panel ted-catalog-card" key={a.id}>
                  <button className="ted-open" onClick={() => onSelect(a.id)}>
                    <span className="ted-catalog-meta">
                      {a.collection === "old" ? "TED 演讲" : "日刊精读"} ·{" "}
                      {String(a.number).padStart(3, "0")}
                    </span>
                    <h2>{a.title}</h2>
                    <span className="ted-catalog-meta">
                      <Headphones size={15} />
                      {formatTime(a.duration)} · {a.paragraphCount} 段 ·{" "}
                      {a.pages} 页
                    </span>
                    <span className="ted-card-status">
                      {study.model.tasks[`ted-done:${a.id}`]
                        ? "已完成"
                        : study.model.tedProgress[a.id] > 0
                          ? `上次听到 ${formatTime(study.model.tedProgress[a.id])}`
                          : "开始精读"}
                    </span>
                  </button>
                  <button
                    className={`icon-button ${study.model.bookmarks[a.id] ? "saved" : ""}`}
                    aria-label={`收藏${a.title}`}
                    onClick={() => void toggleSaved(a.id)}
                  >
                    <Bookmark size={19} />
                  </button>
                  {a.warnings.length > 0 && (
                    <span className="footnote">含待核对内容</span>
                  )}
                </article>
              ))}
            </div>
            <div className="ted-pagination">
              <button
                className="secondary"
                disabled={page === 1}
                onClick={() => setPage((x) => x - 1)}
              >
                上一页
              </button>
              <span>
                {page} / {Math.ceil(filtered.length / 24)} · {filtered.length}{" "}
                篇
              </span>
              <button
                className="secondary"
                disabled={page * 24 >= filtered.length}
                onClick={() => setPage((x) => x + 1)}
              >
                下一页
              </button>
            </div>
          </>
        )}
        <p className="footnote">
          两套资料分别编号。扫描稿与原 PDF
          都可能有误；已核对内容优先显示订正，并保留依据。资料保存在私人学习空间，开源仓库只包含程序。
        </p>
      </div>
    );
  if (!article) return <p role="status">正在打开文章…</p>;
  return (
    <div className="ted-reading">
      <button className="text-button" onClick={() => onSelect("")}>
        <ArrowLeft size={16} />
        返回精读目录
      </button>
      <div className="ted-article-heading">
        <span className="eyebrow">
          {article.collection === "old" ? "TED 演讲" : "日刊精读"} ·{" "}
          {String(article.number).padStart(3, "0")}
        </span>
        <h1>{article.title}</h1>
        <div className="ted-article-tools">
          <button
            className="secondary compact"
            onClick={() => void toggleSaved(article.id)}
          >
            <Bookmark size={15} />
            {study.model.bookmarks[article.id] ? "已收藏" : "收藏文章"}
          </button>
          <button
            className="secondary compact"
            onClick={() =>
              void study
                .append(
                  "task",
                  `ted-done:${article.id}`,
                  !study.model.tasks[`ted-done:${article.id}`],
                )
                .catch(() => toast.error("完成状态未保存"))
            }
          >
            <Check size={15} />
            {study.model.tasks[`ted-done:${article.id}`]
              ? "已完成精读"
              : "标为已完成"}
          </button>
          {summary?.hasPdf && (
            <a
              className="text-button"
              href={`/api/ted/media?id=${article.id}&kind=pdf`}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink size={15} />原 PDF 对照
            </a>
          )}
        </div>
      </div>
      <div className="ted-workspace">
        <div className="ted-text-column">
          <div className="ted-display-options">
            <label>
              显示中文{" "}
              <Switch checked={showChinese} onCheckedChange={setShowChinese} />
            </label>
            <label>
              自动注音{" "}
              <Switch checked={showRuby} onCheckedChange={setShowRuby} />
            </label>
          </div>
          <p className="ted-reading-help">
            电脑悬停速查，点按打开词卡；手机、iPad
            直接点按。先隐藏中文听一遍，再逐段核对。
          </p>
          <Tabs
            value={layer}
            onValueChange={(value) => {
              setLayer(value);
              setDesktopOpen(false);
            }}
          >
            <TabsList className="ted-learning-layers">
              <TabsTrigger value="word">词汇</TabsTrigger>
              <TabsTrigger value="phrase">
                词组 · {lessonCount("phrase")}
              </TabsTrigger>
              <TabsTrigger value="grammar">
                语法 · {lessonCount("grammar")}
              </TabsTrigger>
            </TabsList>
          </Tabs>
          {layer !== "word" && (
            <p className="footnote">
              点按正文中标出的表达，查看接续、讲解和新例句。
              {lessonCount(layer as "phrase" | "grammar") === 0
                ? "本篇暂未匹配到已收录表达，不表示没有此类用法。"
                : "识别结果是候选提示，请结合上下文判断。"}
            </p>
          )}
          {patternError && (
            <p role="alert">词组和语法讲解未能加载，请重新打开 TED 页面。</p>
          )}
          <TedCorrections article={article} />
          <details className="ted-source-notes">
            <summary>扫描识别与资料核对</summary>
            <p>
              文字、注音与分词尚未逐字审校。原音频未自动逐句对齐，可在播放器手动标记反复听的区域。
            </p>
            {article.warnings.map((warning, i) => (
              <p key={i}>{warning}</p>
            ))}
          </details>
          <Popover open={desktopOpen} onOpenChange={setDesktopOpen}>
            <PopoverAnchor virtualRef={anchor} />
            <div className="ted-paragraphs">
              {article.paragraphs.map((paragraph, index) =>
                !paragraph.japanese && !showChinese ? null : (
                  <section
                    className={`panel ted-paragraph ${activeParagraph === paragraph.id ? "listening" : ""} ${paragraphId === paragraph.id ? "selected" : ""}`}
                    key={paragraph.id}
                  >
                    <div className="section-heading">
                      <span>
                        第 {index + 1} 段 · P.{paragraph.page}
                        {!paragraph.japanese
                          ? " · 中文原段（日文未对齐）"
                          : !paragraph.chinese
                            ? " · 日文原段（中文未对齐）"
                            : ""}
                      </span>
                      <button
                        className="text-button"
                        onClick={() =>
                          setParagraphId(
                            paragraphId === paragraph.id
                              ? undefined
                              : paragraph.id,
                          )
                        }
                      >
                        {paragraphId === paragraph.id
                          ? "已选作标记段落"
                          : "关联循环标记"}
                      </button>
                    </div>
                    {!!paragraph.japanese && (
                      <p className="ted-japanese" lang="ja">
                        {layer !== "word" ? (
                          <LessonText
                            text={paragraph.japanese}
                            matches={
                              lessonMatches.get(paragraph.id)?.[
                                layer as "phrase" | "grammar"
                              ] ?? []
                            }
                            onSelect={(match) =>
                              setSelectedLesson({ match, paragraph })
                            }
                          />
                        ) : (
                          (
                            paragraph.tokens ?? [
                              {
                                surface: paragraph.japanese,
                                lemma: paragraph.japanese,
                                reading: "",
                                pos: "",
                              },
                            ]
                          ).map((token, i) =>
                            /[\p{L}\p{N}]/u.test(token.surface) ? (
                              <button
                                key={i}
                                className="ted-token"
                                aria-label={`查词 ${token.surface}`}
                                onPointerEnter={(event) => {
                                  if (event.pointerType !== "mouse") return;
                                  if (pinnedWord.current && desktopOpen) return;
                                  clearHover();
                                  const target = event.currentTarget;
                                  hoverTimer.current = setTimeout(
                                    () => chooseWord(token, paragraph, target),
                                    250,
                                  );
                                }}
                                onPointerLeave={() => {
                                  clearHover();
                                  if (pinnedWord.current) return;
                                  hoverTimer.current = setTimeout(
                                    () => setDesktopOpen(false),
                                    300,
                                  );
                                }}
                                onClick={(event) =>
                                  chooseWord(
                                    token,
                                    paragraph,
                                    event.currentTarget,
                                    !window.matchMedia(
                                      "(hover: hover) and (pointer: fine)",
                                    ).matches,
                                    true,
                                  )
                                }
                              >
                                {showRuby &&
                                token.reading &&
                                token.reading !== token.surface ? (
                                  <ruby>
                                    {token.surface}
                                    <rt>{token.reading}</rt>
                                  </ruby>
                                ) : (
                                  token.surface
                                )}
                              </button>
                            ) : (
                              <span key={i}>{token.surface}</span>
                            ),
                          )
                        )}
                      </p>
                    )}
                    {showChinese && (
                      <p className="ted-chinese">
                        {paragraph.chinese ||
                          "本段中文尚未可靠识别，请查看原PDF。"}
                      </p>
                    )}
                  </section>
                ),
              )}
            </div>
            <PopoverContent
              className="ted-word-popover"
              side="top"
              align="start"
              collisionPadding={16}
              onOpenAutoFocus={(e) => e.preventDefault()}
              onCloseAutoFocus={(e) => e.preventDefault()}
              onPointerEnter={clearHover}
              onPointerLeave={() => {
                clearHover();
                if (pinnedWord.current) return;
                hoverTimer.current = setTimeout(
                  () => setDesktopOpen(false),
                  300,
                );
              }}
            >
              <button
                className="icon-button ted-close-word"
                aria-label="关闭查词"
                onClick={() => setDesktopOpen(false)}
              >
                <X size={16} />
              </button>
              {wordDetails(false)}
            </PopoverContent>
          </Popover>
          <LessonDialog
            saving={savingLesson}
            selection={selectedLesson}
            onClose={() => setSelectedLesson(null)}
            onSave={() => void saveLesson()}
            onGrammar={(id) => {
              setSelectedLesson(null);
              onGrammar(id);
            }}
          />
          {!!article.glossary.length && (
            <section className="panel ted-original-glossary">
              <h2>原文词汇与用法</h2>
              {article.glossary.map((g, index) => (
                <details key={index}>
                  <summary>
                    <span lang="ja">{g.term}</span> <small>{g.reading}</small>
                  </summary>
                  <p>{g.meaning}</p>
                  {g.usage && <p>{g.usage}</p>}
                  {g.examples.map((ex, i) => (
                    <div key={i}>
                      <p lang="ja">{ex.japanese}</p>
                      <p>{ex.chinese}</p>
                    </div>
                  ))}
                  <small>原 PDF · P.{g.page}</small>
                </details>
              ))}
            </section>
          )}
          {!!article.notes.length && (
            <details className="panel ted-original-glossary">
              <summary>原文附注与未配对文字</summary>
              {article.notes.map((n, i) => (
                <div key={i}>
                  <small>P.{n.page}</small>
                  <p>{n.text}</p>
                </div>
              ))}
            </details>
          )}
        </div>
        <aside className="ted-listening-column">
          {summary?.hasAudio ? (
            <TedPlayer
              key={article.id}
              id={article.id}
              duration={summary.duration}
              progress={study.model.tedProgress[article.id] ?? 0}
              loops={study.model.tedLoops}
              paragraphId={paragraphId}
              onActive={setActiveParagraph}
              onStart={onStartAudio}
              onSave={(id, loop) =>
                study.append(
                  "ted_loop",
                  id,
                  loop === null ? null : JSON.stringify(loop),
                )
              }
              onProgress={(time) =>
                study.append("ted_progress", article.id, time)
              }
            />
          ) : (
            <section className="panel">
              <h2>音频尚未就绪</h2>
              <p>可以先阅读，稍后重新打开文章。</p>
            </section>
          )}
        </aside>
      </div>
      <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogContent className="ted-word-dialog">
          <DialogHeader>
            <DialogTitle>词语与原句</DialogTitle>
            <DialogDescription>
              查看读音、候选词义和当前文章中的用法。
            </DialogDescription>
          </DialogHeader>
          {wordDetails()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
