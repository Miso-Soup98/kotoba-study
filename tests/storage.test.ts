import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { updateCache } from "../lib/study/storage.ts";
import { mergeCache } from "../lib/study/model.ts";
import type { Cache } from "../lib/study/types.ts";

/** Minimal transaction harness; real browser IndexedDB supplies cloned values. */
function indexedDBHarness(t: TestContext, initial?: Cache) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");
  let stored = initial;
  let writes = 0;
  let closes = 0;
  const db = {
    close() {
      closes++;
    },
    transaction() {
      const tx = {
        oncomplete: null as (() => void) | null,
        onerror: null as (() => void) | null,
        onabort: null as (() => void) | null,
        error: null,
        objectStore() {
          return {
            get() {
              const request = {
                result: structuredClone(stored),
                onsuccess: null as (() => void) | null,
              };
              queueMicrotask(() => {
                request.onsuccess?.();
                queueMicrotask(() => tx.oncomplete?.());
              });
              return request;
            },
            put(value: Cache) {
              writes++;
              stored = structuredClone(value);
            },
          };
        },
        abort() {
          tx.onabort?.();
        },
      };
      return tx;
    },
  };
  Object.defineProperty(globalThis, "indexedDB", {
    configurable: true,
    value: {
      open() {
        const request = {
          result: db,
          onsuccess: null as (() => void) | null,
        };
        queueMicrotask(() => request.onsuccess?.());
        return request;
      },
    },
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, "indexedDB", previous);
    else Reflect.deleteProperty(globalThis, "indexedDB");
  });
  return {
    get writes() {
      return writes;
    },
    get closes() {
      return closes;
    },
    get stored() {
      return stored;
    },
  };
}

test("idle synchronization completes and closes IndexedDB without rewriting the log", async (t) => {
  const initial = { events: [], pending: [], cursor: 4 };
  const db = indexedDBHarness(t, initial);
  const result = await updateCache("test-user", (cache) =>
    mergeCache(cache, [], 4),
  );
  assert.deepEqual(result, initial);
  assert.equal(db.writes, 0);
  assert.equal(db.closes, 1);
});

test("a changed synchronization cursor is persisted exactly once", async (t) => {
  const db = indexedDBHarness(t, { events: [], pending: [], cursor: 4 });
  const result = await updateCache("test-user", (cache) =>
    mergeCache(cache, [], 5),
  );
  assert.equal(result.cursor, 5);
  assert.deepEqual(db.stored, result);
  assert.equal(db.writes, 1);
  assert.equal(db.closes, 1);
});

test("a no-op for a missing account does not create an empty database record", async (t) => {
  const db = indexedDBHarness(t);
  const result = await updateCache("test-user", (cache) => cache);
  assert.deepEqual(result, { events: [], pending: [], cursor: 0 });
  assert.equal(db.stored, undefined);
  assert.equal(db.writes, 0);
  assert.equal(db.closes, 1);
});
