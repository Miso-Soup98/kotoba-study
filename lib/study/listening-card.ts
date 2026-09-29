import { z } from "zod";
import { tedId } from "../ted/validation.ts";

export const listeningCardSchema = z.object({
  id: z.string().regex(/^listen:[0-9a-f-]{36}$/),
  articleId: tedId,
  articleTitle: z.string().min(1).max(500),
  label: z.string().trim().min(1).max(80),
  start: z.number().finite().min(0).max(86400),
  end: z.number().finite().min(0).max(86400),
  japanese: z.string().trim().min(1).max(2000),
  chinese: z.string().trim().min(1).max(2000),
  sourceLoopId: z.string().regex(/^tedloop:[0-9a-f-]{36}$/),
  paragraphId: z.string().max(80).optional(),
}).strict().refine(c => c.end - c.start >= 0.25 && c.end - c.start <= 600,
  "听力卡需要0.25秒至10分钟的片段");
export type ListeningCard = z.infer<typeof listeningCardSchema>;
export function parseListeningCard(value: unknown) {
  try { return listeningCardSchema.safeParse(JSON.parse(String(value))); }
  catch { return listeningCardSchema.safeParse(null); }
}
