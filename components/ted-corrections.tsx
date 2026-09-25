import type { TedArticle } from "@/lib/ted/types";

export function TedCorrections({ article }: { article: TedArticle }) {
  if (!article.corrections?.length) return null;
  return (
    <details className="ted-source-notes ted-corrections">
      <summary>已订正 {article.corrections.length} 处 · 查看原文与依据</summary>
      <p>
        正文和词卡优先显示订正内容。保留以下原始识别稿及原
        PDF，方便核对；未列出的内容不代表已经审校。
      </p>
      {article.corrections.map((item) => (
        <section key={item.id}>
          <h3>
            {item.kind === "paragraph"
              ? `正文 ${item.paragraphId}`
              : item.correctedTerm || item.term}
          </h3>
          <p>
            <strong>原内容：</strong>
            {[
              item.original.japanese,
              item.original.chinese,
              item.original.meaning,
            ]
              .filter(Boolean)
              .join(" / ") || "扫描时遗漏"}
          </p>
          <p>
            <strong>订正：</strong>
            {[item.japanese, item.chinese, item.correctedMeaning]
              .filter(Boolean)
              .join(" / ")}
          </p>
          <p>
            <strong>依据：</strong>
            {item.reason}
          </p>
          {item.reference.url ? (
            <a href={item.reference.url} target="_blank" rel="noreferrer">
              {item.reference.title}
            </a>
          ) : (
            <a
              href={`/api/ted/media?id=${article.id}&kind=pdf#page=${item.reference.page || item.original.page || 1}`}
              target="_blank"
              rel="noreferrer"
            >
              {item.reference.title}
            </a>
          )}
        </section>
      ))}
    </details>
  );
}
