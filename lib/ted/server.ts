import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
export const tedReply = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
export async function tedAccess() {
  if (!(await getChatGPTUser()))
    return tedReply({ error: "请先登录后阅读私人资料" }, 401);
  if (!env.DB || !env.BUCKET)
    return tedReply({ error: "资料服务暂不可用，请稍后重试" }, 503);
  return { db: env.DB, bucket: env.BUCKET };
}
export async function limitedBody(request: Request, limit: number) {
  const expected = Number(request.headers.get("content-length"));
  if (expected > limit) throw Error("size");
  const reader = request.body?.getReader();
  if (!reader) throw Error("empty");
  // Known-length uploads avoid keeping a second complete copy of large PDFs.
  if (Number.isSafeInteger(expected) && expected > 0) {
    const bytes = new Uint8Array(expected);
    let offset = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (offset + value.length > expected) {
        await reader.cancel();
        throw Error("size");
      }
      bytes.set(value, offset);
      offset += value.length;
    }
    if (offset !== expected) throw Error("truncated");
    return bytes;
  }
  const parts: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > limit) {
      await reader.cancel();
      throw Error("size");
    }
    parts.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return bytes;
}
