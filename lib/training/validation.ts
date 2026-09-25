import { z } from "zod";
export const practiceSchema = z
  .object({
    questionId: z.string().regex(/^n2-[a-z0-9-]{1,70}$/),
    choice: z.number().int().min(0).max(3),
    correct: z.boolean(),
    category: z.enum(["grammar", "vocabulary", "reading", "listening"]),
    elapsedSeconds: z.number().int().min(0).max(3600),
    mode: z.enum(["practice", "timed", "mistakes"]),
  })
  .strict();
export function parsedPractice(value: unknown) {
  try {
    return practiceSchema.safeParse(JSON.parse(String(value)));
  } catch {
    return practiceSchema.safeParse(null);
  }
}
