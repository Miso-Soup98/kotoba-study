"use client";
import { Fragment } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { LessonMatch } from "@/lib/ted/lessons";
import type { TedParagraph } from "@/lib/ted/types";
export function LessonText({
  text,
  matches,
  onSelect,
}: {
  text: string;
  matches: LessonMatch[];
  onSelect: (match: LessonMatch) => void;
}) {
  let offset = 0;
  const parts = matches.map((match) => {
    const before = text.slice(offset, match.start);
    offset = match.end;
    return (
      <Fragment key={`${match.start}:${match.lesson.id}`}>
        {before}
        <button
          className={`ted-expression ${match.lesson.kind}`}
          aria-label={`讲解 ${match.lesson.title}`}
          title={`${match.lesson.title}：${match.lesson.meaning}`}
          onClick={() => onSelect(match)}
        >
          {match.surface}
        </button>
      </Fragment>
    );
  });
  return (
    <>
      {parts}
      {text.slice(offset)}
    </>
  );
}
export function LessonDialog({
  selection,
  onClose,
  onSave,
  onGrammar,
  saving,
}: {
  selection: { match: LessonMatch; paragraph: TedParagraph } | null;
  onClose: () => void;
  onSave: () => void;
  onGrammar: (id: string) => void;
  saving: boolean;
}) {
  const item = selection?.match.lesson;
  return (
    <Dialog
      open={!!selection}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="ted-word-dialog">
        <DialogHeader>
          <DialogTitle>{item?.title ?? "表达讲解"}</DialogTitle>
          <DialogDescription>
            {item?.kind === "grammar" ? "语法" : "词组"} ·
            根据正文识别，结合完整句子判断用法
          </DialogDescription>
        </DialogHeader>
        {selection && item && (
          <div className="ted-word-detail">
            <p lang="ja" className="ted-word-reading">
              {item.reading}
            </p>
            <h3>意思与接续</h3>
            <p>{item.meaning}</p>
            <p>{item.connection}</p>
            <h3>怎么用</h3>
            <p>{item.usage}</p>
            {item.caution && (
              <div className="caution">
                <span>容易混淆的地方</span>
                <p>{item.caution}</p>
              </div>
            )}
            <h3>在这篇文章里</h3>
            <p className="ted-word-example" lang="ja">
              {selection.paragraph.japanese.slice(0, selection.match.start)}
              <mark>{selection.match.surface}</mark>
              {selection.paragraph.japanese.slice(selection.match.end)}
            </p>
            <p>{selection.paragraph.chinese || "本段译文待核对"}</p>
            <h3>换一个例句</h3>
            <p lang="ja">{item.example.japanese}</p>
            <p>{item.example.chinese}</p>
            <button className="primary" onClick={onSave} disabled={saving}>
              {saving ? "正在保存…" : "加入生词本与复习"}
            </button>
            {item.grammarIds.length > 0 && (
              <div className="button-row">
                {item.grammarIds.map((id) => (
                  <button
                    key={id}
                    className="text-button"
                    onClick={() => onGrammar(id)}
                  >
                    打开教材 {id}
                  </button>
                ))}
              </div>
            )}
            <details className="lesson-references">
              <summary>参考与说明</summary>
              <p>
                讲解和补充例句由本应用编写，自动匹配仅提示候选表达，不代表整篇内容已审校。
              </p>
              {item.references.map((reference) => (
                <p key={reference.url}>
                  <a href={reference.url} target="_blank" rel="noreferrer">
                    {reference.title}
                  </a>
                </p>
              ))}
            </details>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
