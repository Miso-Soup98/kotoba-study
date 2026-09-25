import test from "node:test";
import assert from "node:assert/strict";
import { requestSync } from "../lib/study/sync-request.ts";
const cache = { events: [], pending: [], cursor: 0 };
function stalled(signal: AbortSignal) {
  return new Promise<never>((_, reject) => {
    const abort = () => reject(new DOMException("Aborted", "AbortError"));
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  });
}
test("sync deadline covers a stalled response body and a later retry succeeds", async (t) => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  globalThis.fetch = async (_url, options) => {
    const response = Response.json({});
    response.json = () => stalled(options!.signal!);
    return response;
  };
  await assert.rejects(
    requestSync("test", cache, new AbortController().signal, 15),
    { name: "AbortError" },
  );
  const data = { userId: "test", events: [], cursor: 0, hasMore: false };
  globalThis.fetch = async () => Response.json(data);
  assert.deepEqual(
    (await requestSync("test", cache, new AbortController().signal, 100)).data,
    data,
  );
});
test("account cancellation aborts a pending fetch", async (t) => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  globalThis.fetch = async (_url, options) => stalled(options!.signal!);
  const controller = new AbortController();
  const request = requestSync("test", cache, controller.signal, 1000);
  controller.abort();
  await assert.rejects(request, { name: "AbortError" });
});
