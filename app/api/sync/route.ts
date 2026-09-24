import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../chatgpt-auth";
import { syncSchema } from "@/lib/study/validation";
export const dynamic = "force-dynamic";
const reply = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return reply({ error: "请先登录" }, 401);
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return reply({ error: "请求来源无效" }, 403);
  if (!request.headers.get("content-type")?.includes("application/json"))
    return reply({ error: "仅接受JSON" }, 415);
  if (Number(request.headers.get("content-length") || 0) > 300000)
    return reply({ error: "数据过大" }, 413);
  try {
    const raw = await request.text();
    if (raw.length > 300000) return reply({ error: "数据过大" }, 413);
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return reply({ error: "JSON格式无效" }, 400);
    }
    const parsed = syncSchema.safeParse(body);
    if (!parsed.success) return reply({ error: "学习记录格式无效" }, 400);
    const { events, cursor, accountId } = parsed.data;
    if (accountId !== user.userId)
      return reply(
        {
          error:
            "账号已切换，请刷新页面后继续。原账号的待同步记录仍保存在本机。",
          code: "account_changed",
        },
        409,
      );
    if (events.some((e) => e.at > Date.now() + 300000))
      return reply({ error: "设备时间偏快，请校准系统时间后重试" }, 400);
    if (!env.DB) return reply({ error: "同步服务暂不可用" }, 503);
    const db = env.DB;
    if (events.length)
      await db.batch(
        events.map((e) =>
          db
            .prepare(
              "INSERT INTO study_events (user_id,event_id,payload,received_at) VALUES (?,?,?,?) ON CONFLICT(user_id,event_id) DO NOTHING",
            )
            .bind(user.userId, e.id, JSON.stringify(e), Date.now()),
        ),
      );
    const rows = await db
      .prepare(
        "SELECT sequence,payload FROM study_events WHERE user_id=? AND sequence>? ORDER BY sequence LIMIT 501",
      )
      .bind(user.userId, cursor)
      .all<{ sequence: number; payload: string }>();
    const page = rows.results.slice(0, 500);
    return reply({
      userId: user.userId,
      events: page.map((r) => ({ ...JSON.parse(r.payload), seq: r.sequence })),
      cursor: page.at(-1)?.sequence ?? cursor,
      hasMore: rows.results.length > 500,
      ack: events.map((e) => e.id),
    });
  } catch (error) {
    console.error(
      "study-sync-failed",
      error instanceof Error ? error.name : "unknown",
    );
    return reply({ error: "同步暂时失败，本机记录已保留，请稍后重试" }, 503);
  }
}
