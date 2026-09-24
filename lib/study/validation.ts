import { z } from "zod";
import { parsedLoop, tedId, tedWordSchema } from "../ted/validation.ts";
const jsonValue = z.union([
  z.string().max(12000),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);
export const eventSchema = z
  .object({
    id: z.string().uuid(),
    kind: z.enum([
      "enroll",
      "bookmark",
      "note",
      "review",
      "task",
      "position",
      "setting",
      "ted_loop",
      "ted_word",
      "ted_progress",
    ]),
    entity: z.string().min(1).max(200),
    value: jsonValue,
    at: z.number().int().min(0).max(4102444800000),
    base: z.string().uuid().nullable().optional(),
    resolves: z.array(z.string().uuid()).max(100).optional(),
  })
  .strict()
  .superRefine((e, ctx) => {
    if (
      e.kind === "ted_loop" &&
      (!/^tedloop:[0-9a-f-]{36}$/.test(e.entity) ||
        (e.value !== null && !parsedLoop(e.value).success))
    )
      ctx.addIssue({ code: "custom", message: "循环区域无效" });
    if (
      e.kind === "ted_progress" &&
      (!tedId.safeParse(e.entity).success ||
        typeof e.value !== "number" ||
        e.value < 0 ||
        e.value > 86400)
    )
      ctx.addIssue({ code: "custom", message: "播放位置无效" });
    if (e.kind === "ted_word") {
      try {
        const word = tedWordSchema.parse(JSON.parse(String(e.value)));
        if (word.id !== e.entity) throw Error();
      } catch {
        ctx.addIssue({ code: "custom", message: "TED生词无效" });
      }
    }
    if (
      ["enroll", "bookmark", "task"].includes(e.kind) &&
      typeof e.value !== "boolean"
    )
      ctx.addIssue({ code: "custom", message: "状态必须为布尔值" });
    if (
      e.kind === "review" &&
      (![1, 2, 3, 4].includes(Number(e.value)) ||
        typeof e.value !== "number" ||
        e.base === undefined)
    )
      ctx.addIssue({ code: "custom", message: "复习记录无效" });
    if (["note", "position"].includes(e.kind) && typeof e.value !== "string")
      ctx.addIssue({ code: "custom", message: "文本记录无效" });
    if (e.kind === "setting") {
      const allowed: Record<string, (v: unknown) => boolean> = {
        newLimit: (v) =>
          typeof v === "number" && [0, 5, 10, 15, 20].includes(v),
        speed: (v) =>
          typeof v === "number" && [0.65, 0.8, 1, 1.15, 1.25].includes(v),
        gap: (v) => typeof v === "number" && [1, 2, 4, 6, 8].includes(v),
        jaVoice: (v) => typeof v === "string",
        audioSource: (v) => ["nanami", "keita", "browser"].includes(String(v)),
        zhVoice: (v) => typeof v === "string",
        audioMode: (v) => v === "study" || v === "review",
        ruby: (v) => typeof v === "boolean",
        translation: (v) => typeof v === "boolean",
        withChinese: (v) => typeof v === "boolean",
        useReadings: (v) => typeof v === "boolean",
      };
      if (!allowed[e.entity]?.(e.value))
        ctx.addIssue({ code: "custom", message: "设置值无效" });
    }
  });
export const syncSchema = z
  .object({
    accountId: z.string().min(1).max(200),
    events: z.array(eventSchema).max(100),
    cursor: z.number().int().min(0),
  })
  .strict();
