import { tedAccess, tedReply } from "@/lib/ted/server";
import { tedId } from "@/lib/ted/validation";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const access = await tedAccess();
    if (access instanceof Response) return access;
    const id = tedId.safeParse(new URL(request.url).searchParams.get("id"));
    if (!id.success) return tedReply({ error: "文章编号无效" }, 400);
    const record = await access.db
      .prepare("SELECT content_key FROM ted_articles WHERE id=?")
      .bind(id.data)
      .first<{ content_key: string }>();
    const content = record && (await access.bucket.get(record.content_key));
    if (!content) return tedReply({ error: "这篇资料尚未导入" }, 404);
    return new Response(content.body, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return tedReply({ error: "文章暂时无法打开，请重试" }, 503);
  }
}
