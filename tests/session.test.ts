import test from "node:test";
import assert from "node:assert/strict";
import { resolveSession, fetchJSON } from "../lib/study/session.ts";

const user = { userId: "current-account", displayName: "学习者" };
const old = { userId: "previous-account", displayName: "以前的账号" };
const failingStorage = {
  getItem: () => JSON.stringify(old),
  setItem: () => {
    throw Error("QuotaExceededError");
  },
  removeItem: () => {
    throw Error("SecurityError");
  },
};

test("successful online sign-in survives a failed offline identity write", async () => {
  const result = await resolveSession(async () => user, failingStorage);
  assert.deepEqual(result, { user, offline: false, storageFailed: true });
});
test("online signed-out result cannot restore a previous account when removal fails", async () => {
  const result = await resolveSession(async () => null, failingStorage);
  assert.equal(result.user, null);
  assert.equal(result.offline, false);
});
test("only failed online verification falls back to an offline identity", async () => {
  const result = await resolveSession(async () => {
    throw Error("offline");
  }, failingStorage);
  assert.deepEqual(result.user, old);
  assert.equal(result.offline, true);
});
test("unavailable or corrupted offline storage does not prevent opening the app", async () => {
  const result = await resolveSession(
    async () => {
      throw Error("offline");
    },
    {
      ...failingStorage,
      getItem: () => "not-json",
    },
  );
  assert.equal(result.user, null);
});
test("a stalled session request times out instead of blocking startup forever", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    (_url: unknown, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener(
          "abort",
          () => reject(new DOMException("Timed out", "AbortError")),
          { once: true },
        );
      }),
  );
  await assert.rejects(fetchJSON("/api/session", 10), { name: "AbortError" });
});

test("a superseded article request cancels immediately without waiting for its timeout", async (t) => {
  const request = new AbortController();
  let fetchSignal: AbortSignal | null | undefined;
  t.mock.method(
    globalThis,
    "fetch",
    (_url: unknown, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        fetchSignal = init.signal;
        init.signal?.addEventListener(
          "abort",
          () => reject(new DOMException("Cancelled", "AbortError")),
          { once: true },
        );
      }),
  );
  const removed = t.mock.method(request.signal, "removeEventListener");
  const pending = fetchJSON(
    "/api/ted/article?id=ted-new-001",
    20000,
    request.signal,
  );
  request.abort();
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(fetchSignal?.aborted, true);
  assert.equal(removed.mock.callCount(), 1);
});

test("a successful cancellable request detaches its external abort listener", async (t) => {
  const request = new AbortController();
  const removed = t.mock.method(request.signal, "removeEventListener");
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ articles: [] }),
  );
  assert.deepEqual(await fetchJSON("/api/ted", 12000, request.signal), {
    articles: [],
  });
  assert.equal(removed.mock.callCount(), 1);
});

test("cancellable article requests still enforce their own timeout", async (t) => {
  const request = new AbortController();
  t.mock.method(
    globalThis,
    "fetch",
    (_url: unknown, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener(
          "abort",
          () => reject(new DOMException("Timed out", "AbortError")),
          { once: true },
        );
      }),
  );
  await assert.rejects(
    fetchJSON("/api/ted/article?id=ted-new-001", 10, request.signal),
    { name: "AbortError" },
  );
  assert.equal(request.signal.aborted, false);
});
