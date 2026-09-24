import { tedAccess, tedReply } from "@/lib/ted/server";
import { byteRange, tedId } from "@/lib/ted/validation";
export const dynamic = "force-dynamic";
async function serve(request: Request, head = false) {
  try {
    const access = await tedAccess();
    if (access instanceof Response) return access;
    const url = new URL(request.url),
      id = tedId.safeParse(url.searchParams.get("id")),
      kind = url.searchParams.get("kind");
    if (!id.success || !["audio", "pdf"].includes(kind ?? ""))
      return tedReply({ error: "文件请求无效" }, 400);
    const record = await access.db
      .prepare("SELECT audio_key,pdf_key FROM ted_articles WHERE id=?")
      .bind(id.data)
      .first<{ audio_key: string | null; pdf_key: string | null }>();
    const key = kind === "audio" ? record?.audio_key : record?.pdf_key;
    const meta = key && (await access.bucket.head(key));
    if (!meta || !key) return tedReply({ error: "文件尚未导入" }, 404);
    const range = byteRange(request.headers.get("range"), meta.size);
    if (range === "invalid")
      return new Response(null, {
        status: 416,
        headers: {
          "Content-Range": `bytes */${meta.size}`,
          "Cache-Control": "no-store",
        },
      });
    const headers = new Headers({
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, no-store",
      ETag: meta.httpEtag,
      "X-Content-Type-Options": "nosniff",
    });
    meta.writeHttpMetadata(headers);
    headers.set("Content-Length", String(range?.length ?? meta.size));
    headers.set(
      "Content-Disposition",
      `inline; filename="${id.data}.${kind === "pdf" ? "pdf" : key.endsWith(".wav") ? "wav" : "mp3"}"`,
    );
    if (range)
      headers.set(
        "Content-Range",
        `bytes ${range.offset}-${range.offset + range.length - 1}/${meta.size}`,
      );
    if (head) return new Response(null, { status: range ? 206 : 200, headers });
    const object = await access.bucket.get(key, range ? { range } : undefined);
    if (!object || !("body" in object))
      return tedReply({ error: "文件暂时不可用" }, 503);
    return new Response(object.body, { status: range ? 206 : 200, headers });
  } catch {
    return tedReply({ error: "音频或PDF加载失败，请重试" }, 503);
  }
}
export const GET = (request: Request) => serve(request);
export const HEAD = (request: Request) => serve(request, true);
