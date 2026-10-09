"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Bookmark, Check, ChevronLeft, ChevronRight, Search, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { fetchJSON } from "@/lib/study/session";
import type { useStudy } from "@/lib/study/use-study";
import { LEVELS, VOCABULARY_VERSION, matchesVocabulary, vocabularyChanges, vocabularyWordSchema,
  type VocabularyCatalog, type VocabularyIndex, type VocabularyWord } from "@/lib/vocabulary/schema";

const PAGE_SIZE = 24;
const POS: Record<string, string> = { n: "名词", pn: "代词", adv: "副词", "adv-to": "と型副词", exp: "表达", int: "感叹词",
  "adj-i": "い形容词", "adj-na": "な形容词", "adj-no": "の修饰", "adj-pn": "连体词", conj: "接续词", prt: "助词",
  pref: "前缀", suf: "后缀", num: "数词", ctr: "量词", vi: "自动词", vt: "他动词", v1: "一段动词", vk: "来る动词",
  vs: "する动词", "vs-i": "する动词", "vs-s": "する动词" };
export function VocabularyNotes({ word }: { word: VocabularyWord }) {
  return <div className="vocabulary-notes">
    {word.meaningZh && <p className="vocabulary-english" lang="en"><span>EN</span> {word.meaningEn.join("; ")}</p>}
    {word.contentNote && <p className="footnote">内容备注：{word.contentNote}</p>}
    <p className="footnote">{word.chineseStatus === "machine-assisted" ? "中文为辅助翻译稿，尚未逐词人工审校。"
      : word.chineseStatus === "dictionary-candidate" ? "中文来自词典匹配，具体义项请结合例句核对。" : "中文释义待补充，当前保留英文原义。"}</p>
    {!!word.pos.length && <p className="muted">{word.pos.map(p => POS[p] ?? (p.startsWith("v5") ? "五段动词" : p)).join(" · ")}</p>}
    {word.chineseSenses.length > 1 && <details><summary>其他中文义项</summary><ul>{word.chineseSenses.slice(1).map((s, i) => <li key={i}>{s}</li>)}</ul></details>}
    {word.sentences.map((s, i) => <blockquote key={i} className="vocabulary-example"><p lang="ja">{s.japanese}</p>
      <p className="muted" lang="en">{s.english}</p><p className="footnote">
        <a href={s.sourceUrl} target="_blank" rel="noreferrer">日文</a> · <a href={s.japaneseAuthorUrl} target="_blank" rel="noreferrer">{s.japaneseAuthor}</a>
        {" / "}<a href={s.englishSourceUrl} target="_blank" rel="noreferrer">英文</a> · <a href={s.englishAuthorUrl} target="_blank" rel="noreferrer">{s.englishAuthor}</a>
        {" · "}<a href={s.licenseUrl} target="_blank" rel="noreferrer">CC BY 2.0 FR</a></p></blockquote>)}
    {!word.sentences.length && <p className="footnote">本词暂未收录例句。</p>}
    <details><summary>词典来源与分级说明</summary>
      <ul>{word.sourceUrls.map((url, i) => <li key={url}><a href={url} target="_blank" rel="noreferrer">来源 {i + 1} · {new URL(url).hostname}</a></li>)}</ul>
      <p className="footnote">参考分级来自 OpenJLPT，非官方完整考纲。内容版本 {word.version}；保存后保留当时的词条。</p>
    </details>
  </div>;
}

export function VocabularyLibrary({ study, initialId, onReview, onSpeak }: {
  study: ReturnType<typeof useStudy>; initialId?: string; onReview: () => void; onSpeak: (reading: string) => Promise<void>;
}) {
  const { model } = study;
  const [catalog, setCatalog] = useState<VocabularyCatalog | null>(null), [error, setError] = useState("");
  const [level, setLevel] = useState("N3"), [query, setQuery] = useState(""), [filter, setFilter] = useState("all");
  const [page, setPage] = useState(0), [retry, setRetry] = useState(0), [selectedId, setSelectedId] = useState(initialId ?? "");
  const [word, setWord] = useState<VocabularyWord | null>(null), [wordError, setWordError] = useState("");
  const [hidden, setHidden] = useState(false), [busy, setBusy] = useState(false);
  const saving = useRef(false);
  // One small index is loaded only while this section is open. No global dictionary cache.
  useEffect(() => {
    const request = new AbortController(); setError("");
    fetchJSON<VocabularyCatalog>(`/data/vocabulary/${VOCABULARY_VERSION}/index.json`, 20000, request.signal).then(data => {
      if (data.version !== VOCABULARY_VERSION || !Array.isArray(data.words) || data.words.length > 20000) throw Error();
      setCatalog(data);
      const initial = data.words.find(w => w.id === initialId);
      if (initial) setLevel(initial.level);
    }).catch(() => { if (!request.signal.aborted) setError("单词目录未能加载，请联网重试。已保存的单词仍可在复习中使用。"); });
    return () => request.abort();
  }, [retry, initialId]);
  useEffect(() => {
    setWord(null); setWordError("");
    if (!selectedId) return;
    const saved = model.vocabularyWords[selectedId];
    if (saved) { setWord(saved); return; }
    const item = catalog?.words.find(w => w.id === selectedId);
    if (!item) return;
    if (!/^N[1-5]-\d{3}\.json$/.test(item.shard)) { setWordError("词条地址无效。"); return; }
    const request = new AbortController();
    fetchJSON<VocabularyWord[]>(`/data/vocabulary/${VOCABULARY_VERSION}/${item.shard}`, 15000, request.signal)
      .then(data => {
        const parsed = vocabularyWordSchema.parse(data.find(w => w.id === selectedId));
        if (!request.signal.aborted) setWord(parsed);
      }).catch(() => { if (!request.signal.aborted) setWordError("本词详情未能加载，请联网重试。"); });
    return () => request.abort();
  }, [selectedId, catalog, model.vocabularyWords, retry]);
  useEffect(() => setPage(0), [level, query, filter]);
  const rows = useMemo(() => catalog?.words.filter(w => (level === "ALL" || w.level === level) && matchesVocabulary(w, query) &&
    (filter === "all" || (filter === "new" && w.learningStatus === "ready" && !model.cards[w.id]?.enrolled && !model.vocabularyKnown[w.id]) ||
      (filter === "learning" && model.cards[w.id]?.enrolled) || (filter === "known" && model.vocabularyKnown[w.id]) ||
      (filter === "saved" && model.bookmarks[w.id]))) ?? [],
  [catalog, level, query, filter, model.cards, model.vocabularyKnown, model.bookmarks]);
  const maxPage = Math.max(0, Math.ceil(rows.length / PAGE_SIZE) - 1), currentPage = Math.min(page, maxPage);
  const visible = rows.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const levelRows = catalog?.words.filter(w => level === "ALL" || w.level === level) ?? [];
  const learning = levelRows.filter(w => model.cards[w.id]?.enrolled).length;
  const known = levelRows.filter(w => model.vocabularyKnown[w.id]).length;
  async function change(intent: "enroll" | "bookmark" | "known") {
    if (!word || saving.current) return;
    saving.current = true; setBusy(true);
    try {
      await study.appendBatch(vocabularyChanges(word, intent, model));
      toast.success(intent === "known" ? "跳过状态已保存，可随时重新学习" : intent === "bookmark" ? "收藏已更新" : "复习计划已更新");
    } catch (e) { toast.error(e instanceof Error ? e.message : "保存失败，请重试"); }
    finally { saving.current = false; setBusy(false); }
  }
  async function speak(value: string) {
    try { await onSpeak(value); } catch (e) { toast.error(e instanceof Error ? e.message : "设备日语语音暂不可用"); }
  }
  function nextWord() {
    const index = rows.findIndex(w => w.id === selectedId);
    const next = rows[index + 1] ?? rows[0];
    if (next) setSelectedId(next.id); else setSelectedId("");
  }
  function label(item: VocabularyIndex) { return item.learningStatus !== "ready" ? "待核对" : model.vocabularyKnown[item.id] ? "已跳过" : model.cards[item.id]?.enrolled ? "学习中" : "未开始"; }
  return <>
    <div className="page-heading"><div><div className="eyebrow">WORDS, ONE DAY AT A TIME</div><h1>把单词，学进日常。</h1>
      <p>N5 → N1 分级学习。先补 N4，再把重心放在 N3 / N2。</p></div>
      <button className="primary" onClick={onReview}>去到期复习 <ArrowRight size={16}/></button></div>
    <div className="vocabulary-levels" aria-label="单词参考等级">{[...LEVELS, "ALL"].map(l => <button key={l} className={level === l ? "active" : ""}
      aria-pressed={level === l} onClick={() => setLevel(l)}><strong>{l === "ALL" ? "全部" : l}</strong>
      <span>{catalog ? (l === "ALL" ? catalog.words.length : catalog.counts[l]) : "—"} 词</span></button>)}</div>
    <section className="panel vocabulary-plan"><div><h2>{level === "ALL" ? "所有等级" : level} · 学习进度</h2>
      <p>学习中 {learning} · 已认识并跳过 {known} · 共 {levelRows.length} 词</p>
      <p className="footnote">跳过是你的自评，可随时撤销。单词、语法与听力卡共享每天 {Number(model.settings.newLimit ?? 10)} 张新卡额度；先复习，再学新词。</p></div>
      <button className="secondary" disabled={!rows.length} onClick={() => { const next = rows.find(w => w.learningStatus === "ready" && !model.cards[w.id]?.enrolled && !model.vocabularyKnown[w.id]);
        if (next) setSelectedId(next.id); else toast.info("当前筛选下没有未开始的词，可以切换等级或筛选。"); }}>继续学习</button></section>
    <div className="vocabulary-toolbar"><label className="search-field"><Search size={18}/><input aria-label="搜索分级单词" value={query}
      onChange={e => setQuery(e.target.value)} placeholder="日文、假名、中文或英文" /></label>
      <label>状态 <select aria-label="单词学习状态" value={filter} onChange={e => setFilter(e.target.value)}>
        <option value="all">全部</option><option value="new">未开始</option><option value="learning">学习中</option><option value="known">已跳过</option><option value="saved">已收藏</option>
      </select></label><label><input type="checkbox" checked={hidden} onChange={e => setHidden(e.target.checked)}/> 隐藏读音与释义</label></div>
    {error ? <div className="empty-state" role="alert"><p>{error}</p><button className="secondary" onClick={() => setRetry(v => v + 1)}>重新加载词库</button></div>
      : !catalog ? <p role="status">正在加载单词目录…</p> : <>
        <div className="vocabulary-grid">{visible.map(item => <button className="panel vocabulary-tile" key={item.id}
          onClick={() => setSelectedId(item.id)} aria-label={`打开单词 ${item.text}`}>
          <span className="vocabulary-meta"><span>{item.level} · {label(item)}</span>{model.bookmarks[item.id] && <Bookmark size={14}/>}</span>
          <strong lang="ja">{item.text}</strong><span lang="ja" className="reading">{hidden ? "点开后核对读音" : item.reading}</span>
          <span className="vocabulary-gloss">{hidden ? "回忆意思，再打开词卡" : item.meaning}</span>
          {!hidden && !item.meaning.startsWith("英文：") && <span className="vocabulary-gloss vocabulary-english" lang="en">{item.meaningEn.join("; ")}</span>}</button>)}</div>
        {!rows.length && <div className="empty-state"><p>没有符合条件的词。可以试试其他等级或搜索条件。</p></div>}
        <div className="vocabulary-pagination"><button className="secondary" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={16}/> 上一页</button>
          <span>{rows.length} 词 · {currentPage + 1} / {maxPage + 1} 页</span><button className="secondary" disabled={currentPage >= maxPage} onClick={() => setPage(currentPage + 1)}>下一页 <ChevronRight size={16}/></button></div>
      </>}
    <p className="footnote vocabulary-attribution">等级为 OpenJLPT 的学习参考，不是官方完整考纲。中文来源与核对状态见每张词卡；例句保留日文及英文对照。
      <a href="/data/vocabulary/THIRD_PARTY_NOTICES.md" target="_blank" rel="noreferrer"> 数据来源与许可</a></p>
    <Dialog open={!!selectedId} onOpenChange={open => { if (!open) setSelectedId(""); }}>
      <DialogContent className="vocabulary-dialog"><DialogHeader><DialogTitle>{word?.text ?? "单词详情"}</DialogTitle>
        <DialogDescription>{word ? `${word.level} 参考词汇 · ${word.reading}` : "正在读取词条"}</DialogDescription></DialogHeader>
        {wordError ? <div role="alert"><p>{wordError}</p><button className="secondary" onClick={() => setRetry(v => v + 1)}>重试详情</button></div>
          : word ? <><p className="answer-meaning">{word.meaning}</p>
            <div className="vocabulary-actions"><button className="secondary" onClick={() => void speak(word.reading)}><Volume2 size={16}/> 读音 · 设备语音</button>
              <button className="secondary" disabled={busy} onClick={() => void change("bookmark")}><Bookmark size={16}/>{model.bookmarks[word.id] ? "取消收藏" : "收藏"}</button></div>
            <VocabularyNotes word={word}/><div className="vocabulary-actions vocabulary-actions-bottom">
              <button className="primary" disabled={busy || word.learningStatus !== "ready"} onClick={() => void change("enroll")}>{word.learningStatus !== "ready" ? "待核对，暂缓背诵" : model.cards[word.id]?.enrolled ? "暂停复习" : "加入复习"}</button>
              <button className="secondary" disabled={busy} onClick={() => void change("known")}><Check size={16}/>{model.vocabularyKnown[word.id] ? "撤销跳过" : "已认识，跳过"}</button>
              <button className="text-button" disabled={busy} onClick={nextWord}>下一个词 <ArrowRight size={16}/></button></div>
          </> : <p role="status">正在加载词条…</p>}
      </DialogContent>
    </Dialog>
  </>;
}
