import { eventBatch } from "./model.ts";
import type { Cache, StudyEvent } from "./types.ts";

export type SyncResponse = {
  userId: string;
  events: StudyEvent[];
  cursor: number;
  hasMore: boolean;
  error?: string;
};

// Bound the complete request, including reading a stalled response body.
export async function requestSync(
  userId: string,
  cache: Cache,
  signal: AbortSignal,
  timeoutMs = 20000,
) {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal.aborted) cancel();
  else signal.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(cancel, timeoutMs);
  try {
    const response = await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        accountId: userId,
        cursor: cache.cursor,
        events: eventBatch(cache.pending),
      }),
    });
    const data = (await response.json()) as SyncResponse;
    return { status: response.status, ok: response.ok, data };
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", cancel);
  }
}
