import { z } from "zod";
export const tedId = z.string().regex(/^ted-(new|old)-\d{3}$/);
export const tedWordSchema = z
  .object({
    id: z.string().max(200),
    text: z.string().min(1).max(100),
    reading: z.string().max(200),
    meaning: z.string().max(3000),
    source: tedId,
    original: z.string().max(2000),
    usage: z.string().max(3000).optional(),
    example: z
      .object({
        japanese: z.string().max(2500),
        japanese_annotated: z.string().max(2500),
        japanese_reading: z.string().max(2500),
        chinese: z.string().max(2500),
      })
      .optional(),
  })
  .strict()
  .refine((w) => w.id.startsWith(`tedword:${w.source}:`))
  .refine((w) => JSON.stringify(w).length <= 12000, "生词记录过长");
export const tedLoopSchema = z
  .object({
    articleId: tedId,
    label: z.string().trim().min(1).max(80),
    color: z.number().int().min(0).max(5),
    start: z.number().finite().min(0).max(86400),
    end: z.number().finite().min(0).max(86400),
    paragraphId: z.string().max(80).optional(),
  })
  .strict()
  .refine((value) => value.end - value.start >= 0.25, "循环至少需要0.25秒");
export function parsedLoop(value: unknown) {
  try {
    return tedLoopSchema.safeParse(
      typeof value === "string" ? JSON.parse(value) : value,
    );
  } catch {
    return tedLoopSchema.safeParse(null);
  }
}
export function byteRange(
  header: string | null,
  size: number,
): { offset: number; length: number } | null | "invalid" {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2]) || size <= 0) return "invalid";
  let start: number, end: number;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return "invalid";
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  }
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    start >= size ||
    end < start
  )
    return "invalid";
  return { offset: start, length: end - start + 1 };
}
