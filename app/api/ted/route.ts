import { tedAccess, tedReply } from "@/lib/ted/server";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const access = await tedAccess();
    if (access instanceof Response) return access;
    const rows = await access.db
      .prepare(
        "SELECT id,title,collection,number,pages,paragraph_count AS paragraphCount,duration,audio_key AS audioKey,pdf_key AS pdfKey,warnings FROM ted_articles ORDER BY collection,number",
      )
      .all<Record<string, unknown>>();
    return tedReply({
      articles: rows.results.map(({ audioKey, pdfKey, warnings, ...row }) => ({
        ...row,
        hasAudio: !!audioKey,
        hasPdf: !!pdfKey,
        warnings: JSON.parse(String(warnings)),
      })),
    });
  } catch {
    return tedReply({ error: "资料目录暂时无法打开，请重试" }, 503);
  }
}
