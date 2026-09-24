import { getChatGPTUser } from "../../chatgpt-auth";
export const dynamic = "force-dynamic";
export async function GET() {
  const user = await getChatGPTUser();
  return Response.json(
    user
      ? { userId: user.userId, displayName: user.fullName || "学习者" }
      : null,
    { headers: { "Cache-Control": "no-store" } },
  );
}
