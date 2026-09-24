import { env } from "cloudflare:workers";
import { limitedBody, tedReply } from "@/lib/ted/server";
import { tedId } from "@/lib/ted/validation";
import { z } from "zod";
export const dynamic = "force-dynamic";
const articleSchema = z
  .object({
    id: tedId,
    title: z.string().min(1).max(500),
    collection: z.enum(["new", "old"]),
    number: z.number().int().positive(),
    pages: z.number().int().positive(),
    paragraphs: z
      .array(
        z
          .object({
            id: z.string(),
            page: z.number(),
            japanese: z.string(),
            chinese: z.string(),
          })
          .passthrough(),
      )
      .min(1),
    glossary: z.array(z.unknown()),
    warnings: z.array(z.string()),
    durationSeconds: z.number().finite().min(0).max(86400),
  })
  .passthrough();
async function allowed(request: Request) {
  const expected = env.TED_IMPORT_SECRET;
  if (!expected || expected.length < 32) return false;
  const actual =
    request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  const digest = async (value: string) =>
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    );
  const [a, b] = await Promise.all([digest(actual), digest(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
export async function PUT(request: Request) {
  if (!(await allowed(request))) return tedReply({ error: "导入未授权" }, 401);
  if (!env.DB || !env.BUCKET) return tedReply({ error: "存储暂不可用" }, 503);
  const url = new URL(request.url),
    id = tedId.safeParse(url.searchParams.get("id")),
    kind = url.searchParams.get("kind");
  if (!id.success || !["article", "audio", "pdf"].includes(kind ?? ""))
    return tedReply({ error: "参数无效" }, 400);
  try {
    const bytes = await limitedBody(
      request,
      kind === "article" ? 6_000_000 : 48_000_000,
    );
    const hash = [
      ...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    ]
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("");
    if (request.headers.get("x-content-sha256") !== hash)
      return tedReply({ error: "文件校验不符" }, 400);
    const mime =
      kind === "article"
        ? "application/json"
        : kind === "pdf"
          ? "application/pdf"
          : request.headers.get("content-type");
    if (
      ![
        "application/json",
        "application/pdf",
        "audio/mpeg",
        "audio/wav",
      ].includes(mime ?? "")
    )
      return tedReply({ error: "格式不支持" }, 415);
    const ext =
      kind === "article"
        ? "json"
        : kind === "pdf"
          ? "pdf"
          : mime === "audio/wav"
            ? "wav"
            : "mp3";
    const key = `ted/${id.data}/${kind}.${ext}`;
    if (kind === "article") {
      const parsed = articleSchema.safeParse(
        JSON.parse(new TextDecoder().decode(bytes)),
      );
      if (!parsed.success || parsed.data.id !== id.data)
        return tedReply({ error: "文章格式无效" }, 400);
      const a = parsed.data;
      await env.BUCKET.put(key, bytes, {
        httpMetadata: { contentType: mime! },
        customMetadata: { sha256: hash },
      });
      const audioKey = `ted/${id.data}/audio.mp3`,
        pdfKey = `ted/${id.data}/pdf.pdf`;
      const [audio, pdf] = await Promise.all([
        env.BUCKET.head(audioKey),
        env.BUCKET.head(pdfKey),
      ]);
      await env.DB.prepare(
        "INSERT INTO ted_articles (id,title,collection,number,pages,paragraph_count,duration,content_key,warnings,audio_key,pdf_key) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,collection=excluded.collection,number=excluded.number,pages=excluded.pages,paragraph_count=excluded.paragraph_count,duration=excluded.duration,content_key=excluded.content_key,warnings=excluded.warnings,audio_key=COALESCE(excluded.audio_key,ted_articles.audio_key),pdf_key=COALESCE(excluded.pdf_key,ted_articles.pdf_key)",
      )
        .bind(
          a.id,
          a.title,
          a.collection,
          a.number,
          a.pages,
          a.paragraphs.length,
          Math.round(a.durationSeconds),
          key,
          JSON.stringify(a.warnings),
          audio ? audioKey : null,
          pdf ? pdfKey : null,
        )
        .run();
    } else {
      await env.BUCKET.put(key, bytes, {
        httpMetadata: { contentType: mime! },
        customMetadata: { sha256: hash },
      });
      await env.DB.prepare(
        kind === "audio"
          ? "UPDATE ted_articles SET audio_key=? WHERE id=?"
          : "UPDATE ted_articles SET pdf_key=? WHERE id=?",
      )
        .bind(key, id.data)
        .run();
    }
    return tedReply({
      ok: true,
      id: id.data,
      kind,
      sha256: hash,
      size: bytes.length,
    });
  } catch (error) {
    return tedReply(
      {
        error:
          error instanceof Error && error.message === "size"
            ? "文件过大"
            : "导入失败，请重试",
      },
      400,
    );
  }
}
export async function GET(request: Request) {
  if (!(await allowed(request))) return tedReply({ error: "导入未授权" }, 401);
  if (!env.BUCKET || !env.DB) return tedReply({ error: "存储暂不可用" }, 503);
  const id = tedId.safeParse(new URL(request.url).searchParams.get("id"));
  if (!id.success) return tedReply({ error: "编号无效" }, 400);
  const files: Record<string, unknown> = {};
  for (const [kind, file] of [
    ["article", "article.json"],
    ["audio", "audio.mp3"],
    ["pdf", "pdf.pdf"],
  ]) {
    const object = await env.BUCKET.head(`ted/${id.data}/${file}`);
    files[kind] = object
      ? { sha256: object.customMetadata?.sha256, size: object.size }
      : null;
  }
  return tedReply({ id: id.data, files });
}
