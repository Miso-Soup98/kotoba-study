// @ts-nocheck
/**
 * Exercise the real useStudy hook and event model with simulated React hooks,
 * IndexedDB structured clones, timers, and the sync endpoint. No browser,
 * network requests, or real learning records are used.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import vm from "node:vm";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const requireApp = createRequire(resolve(appRoot, "package.json"));
const ts = requireApp("typescript");
const modelModule = await import(
  pathToFileURL(resolve(appRoot, "lib/study/model.ts")).href
);
const sessionModule = await import(
  pathToFileURL(resolve(appRoot, "lib/study/session.ts")).href
);
const validationModule = await import(
  pathToFileURL(resolve(appRoot, "lib/study/validation.ts")).href
);
const compiled = ts.transpileModule(
  readFileSync(resolve(appRoot, "lib/study/use-study.ts"), "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;

const enrollment = {
  id: "00000000-0000-4000-8000-000000000001",
  kind: "enroll",
  entity: "N4-001",
  value: true,
  at: 1750000000000,
  seq: 1,
};
const review = {
  id: "00000000-0000-4000-8000-000000000002",
  kind: "review",
  entity: "N4-001",
  value: 3,
  base: null,
  at: 1750000001000,
  seq: 2,
};
const bookmark = {
  id: "00000000-0000-4000-8000-000000000003",
  kind: "bookmark",
  entity: "N4-002",
  value: true,
  at: 1750000002000,
};

const tedLoop = {
  id: "00000000-0000-4000-8000-000000000004",
  kind: "ted_loop",
  entity: "tedloop:00000000-0000-4000-8000-000000000005",
  // parsedLoop also supports this existing object representation in stored events.
  value: {
    articleId: "ted-new-001",
    label: "复听",
    color: 1,
    start: 10,
    end: 20,
  },
  at: 1750000003000,
  seq: 3,
};

async function makeStudy({ withTed = false } = {}) {
  const slots = [],
    effects = [],
    channels = new Set();
  const timeouts = new Map(),
    intervals = new Map(),
    listeners = new Map();
  const identity = new Map(),
    requests = [];
  const user = { userId: "test-memory-user", displayName: "Test" };
  let database = {
    events: withTed ? [enrollment, review, tedLoop] : [enrollment, review],
    pending: [],
    cursor: withTed ? 3 : 2,
  };
  let cursor = 0,
    timerId = 0,
    dirty = true,
    value,
    rebuilds = 0;
  let response = (request) => ({
    userId: user.userId,
    events: [],
    cursor: request.cursor,
    hasMore: false,
  });
  const dependenciesChanged = (before, after) =>
    !before ||
    !after ||
    before.length !== after.length ||
    after.some((item, index) => !Object.is(item, before[index]));
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) {
        const state = {
          value: typeof initial === "function" ? initial() : initial,
        };
        state.set = (update) => {
          const next =
            typeof update === "function" ? update(state.value) : update;
          if (!Object.is(next, state.value)) {
            state.value = next;
            dirty = true;
          }
        };
        slots[index] = state;
      }
      return [slots[index].value, slots[index].set];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useMemo(callback, dependencies) {
      const index = cursor++;
      if (
        !slots[index] ||
        dependenciesChanged(slots[index].dependencies, dependencies)
      ) {
        slots[index] = { dependencies, value: callback() };
      }
      return slots[index].value;
    },
    useCallback(callback, dependencies) {
      return hooks.useMemo(() => callback, dependencies);
    },
    useEffect(callback, dependencies) {
      const index = cursor++,
        previous = slots[index];
      if (
        !previous ||
        dependenciesChanged(previous.dependencies, dependencies)
      ) {
        effects.push(() => {
          previous?.cleanup?.();
          slots[index] = { dependencies, cleanup: callback() };
        });
      }
    },
  };
  class Channel {
    constructor(name) {
      this.name = name;
      channels.add(this);
    }
    postMessage() {}
    close() {
      channels.delete(this);
    }
  }
  const sandbox = {
    exports: {},
    require(id) {
      if (id === "react") return hooks;
      if (id === "./model")
        return {
          ...modelModule,
          rebuild(events) {
            rebuilds++;
            return modelModule.rebuild(events);
          },
        };
      if (id === "./storage")
        return {
          async readCache() {
            return structuredClone(database);
          },
          async updateCache(_userId, update) {
            const next = update(structuredClone(database));
            database = structuredClone(next);
            return next;
          },
        };
      if (id === "./session")
        return {
          ...sessionModule,
          async fetchJSON() {
            return user;
          },
        };
      if (id === "./validation") return validationModule;
      throw Error(`Unexpected dependency: ${id}`);
    },
    async fetch(url, options) {
      assert.equal(url, "/api/sync");
      const request = JSON.parse(options.body);
      requests.push(request);
      const data = await response(request);
      return {
        ok: true,
        status: 200,
        async json() {
          return structuredClone(data);
        },
      };
    },
    setTimeout(callback) {
      const id = ++timerId;
      timeouts.set(id, callback);
      return id;
    },
    clearTimeout(id) {
      timeouts.delete(id);
    },
    setInterval(callback) {
      const id = ++timerId;
      intervals.set(id, callback);
      return id;
    },
    clearInterval(id) {
      intervals.delete(id);
    },
    navigator: { onLine: true },
    document: {
      visibilityState: "visible",
      addEventListener(name, callback) {
        if (!listeners.has(name)) listeners.set(name, new Set());
        listeners.get(name).add(callback);
      },
      removeEventListener(name, callback) {
        listeners.get(name)?.delete(callback);
      },
    },
    window: {
      BroadcastChannel: Channel,
      addEventListener(name, callback) {
        if (!listeners.has(name)) listeners.set(name, new Set());
        listeners.get(name).add(callback);
      },
      removeEventListener(name, callback) {
        listeners.get(name)?.delete(callback);
      },
    },
    BroadcastChannel: Channel,
    localStorage: {
      getItem(key) {
        return identity.get(key) ?? null;
      },
      setItem(key, entry) {
        identity.set(key, entry);
      },
      removeItem(key) {
        identity.delete(key);
      },
    },
    location: { href: "" },
    crypto,
  };
  vm.runInNewContext(compiled, sandbox, { filename: "use-study.compiled.cjs" });
  async function flush() {
    for (let pass = 0; pass < 20; pass++) {
      if (dirty) {
        dirty = false;
        cursor = 0;
        value = sandbox.exports.useStudy();
        while (effects.length) effects.shift()();
      }
      await new Promise((resolve) => setImmediate(resolve));
      if (!dirty) return;
    }
    assert.fail("The hook did not settle after 20 simulated renders");
  }
  await flush();
  assert.equal(value.ready, true);
  assert.equal(
    value.model.reviews.length,
    1,
    "The fixture exercises real FSRS replay",
  );
  return {
    get study() {
      return value;
    },
    get rebuilds() {
      return rebuilds;
    },
    requests,
    setResponse(callback) {
      response = callback;
    },
    writeFromAnotherTab(update) {
      database = structuredClone(update(database));
    },
    async broadcast() {
      for (const channel of channels) channel.onmessage?.({ data: "change" });
      await flush();
    },
    async sync() {
      await value.sync();
      await flush();
    },
    async poll() {
      for (const callback of intervals.values()) callback();
      await flush();
    },
    async setVisibility(state) {
      sandbox.document.visibilityState = state;
      for (const callback of listeners.get("visibilitychange") ?? [])
        callback();
      await flush();
    },
    unmount() {
      for (const slot of slots) slot?.cleanup?.();
    },
  };
}

test("unchanged sync responses preserve the model across fresh IndexedDB clones", async (t) => {
  const app = await makeStudy({ withTed: true });
  t.after(() => app.unmount());
  const before = app.study.model,
    rebuilds = app.rebuilds;
  for (let pass = 0; pass < 3; pass++) await app.sync();
  assert.equal(app.requests.length, 3);
  assert.equal(app.study.status, "已同步");
  assert.equal(app.study.model.tedLoops[tedLoop.entity].label, "复听");
  assert.equal(app.study.model, before);
  assert.equal(
    app.rebuilds,
    rebuilds,
    "Idle polls must not replay the full review history",
  );
});

test("new remote events still rebuild and appear in the learning model", async (t) => {
  const app = await makeStudy();
  t.after(() => app.unmount());
  const before = app.study.model,
    rebuilds = app.rebuilds;
  app.setResponse(() => ({
    userId: "test-memory-user",
    events: [{ ...bookmark, seq: 3 }],
    cursor: 3,
    hasMore: false,
  }));
  await app.sync();
  assert.notEqual(app.study.model, before);
  assert.equal(app.study.model.bookmarks[bookmark.entity], true);
  assert.equal(app.study.cache.cursor, 3);
  assert.equal(app.rebuilds, rebuilds + 1);
});

test("cross-tab pending changes are applied, while repeated unchanged broadcasts do not replay history", async (t) => {
  const app = await makeStudy();
  t.after(() => app.unmount());
  const rebuilds = app.rebuilds;
  app.writeFromAnotherTab((cache) => ({ ...cache, pending: [bookmark] }));
  await app.broadcast();
  assert.equal(app.study.model.bookmarks[bookmark.entity], true);
  assert.equal(app.study.cache.pending.length, 1);
  assert.equal(app.rebuilds, rebuilds + 1);
  const changedModel = app.study.model;
  await app.broadcast();
  assert.equal(app.study.model, changedModel);
  assert.equal(app.rebuilds, rebuilds + 1);
});

test("an empty response does not discard another tab's write made during the request", async (t) => {
  const app = await makeStudy();
  t.after(() => app.unmount());
  let responses = 0;
  app.setResponse((request) => {
    if (responses++ === 0) {
      app.writeFromAnotherTab((cache) => ({ ...cache, pending: [bookmark] }));
      return {
        userId: "test-memory-user",
        events: [],
        cursor: 2,
        hasMore: false,
      };
    }
    assert.equal(request.events.length, 1);
    assert.equal(request.events[0].id, bookmark.id);
    return {
      userId: "test-memory-user",
      events: [{ ...bookmark, seq: 3 }],
      cursor: 3,
      hasMore: false,
    };
  });
  await app.sync();
  assert.equal(
    responses,
    2,
    "The concurrent pending event must be uploaded on the next page",
  );
  assert.equal(app.study.model.bookmarks[bookmark.entity], true);
  assert.equal(app.study.cache.pending.length, 0);
  assert.equal(app.study.cache.events.at(-1).id, bookmark.id);
  assert.equal(app.study.status, "已同步");
});

test("hidden tabs suspend idle polling and immediately sync when visible again", async (t) => {
  const app = await makeStudy();
  t.after(() => app.unmount());
  await app.setVisibility("hidden");
  await app.poll();
  await app.poll();
  assert.equal(app.requests.length, 0);
  await app.setVisibility("visible");
  assert.equal(app.requests.length, 1);
  assert.equal(app.study.status, "已同步");
  await app.poll();
  assert.equal(app.requests.length, 2);
});
