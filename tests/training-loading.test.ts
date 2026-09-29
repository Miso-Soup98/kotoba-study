// @ts-nocheck
/**
 * Real Training + LearningRoute TSX with simulated hooks and fetch results.
 * Copy into app/tests before using the project's guarded test runner.
 * Draft inspected statically only: no browser, network or actual timers used.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import vm from "node:vm";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const requireApp = createRequire(resolve(appRoot, "package.json"));
const ts = requireApp("typescript");
const load = path => import(pathToFileURL(resolve(appRoot, path)).href);
const modelModule = await load("lib/study/model.ts");
const sessionModule = await load("lib/training/session.ts");
const plannerModule = await load("lib/training/planner.ts");
const typesModule = await load("lib/training/types.ts");
const contentModule = await load("lib/study/content.ts");
const compile = path => ts.transpileModule(readFileSync(resolve(appRoot, path), "utf8"), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const trainingCode = compile("components/training.tsx");
const routeCode = compile("components/learning-route.tsx");
const NOW = Date.UTC(2026, 8, 29, 3);
const OLD_VERSION = "n2-test-archive";
const archivedQuestion = {
  id: "n2-test-archived-001", category: "grammar", title: "旧版练习题",
  prompt: "旧版题干：雨が降っても、予定どおり出発します。",
  options: ["因为下雨取消", "即使下雨也出发", "出发后才下雨", "希望不要下雨"],
  answerIndex: 1, explanation: "旧版解析：「ても」表示即使某条件成立，结果仍不变。",
  grammarIds: ["N3-001"], level: "N3", skill: "条件", purpose: "practice",
};
const curriculum = {
  title: "测试周课", startDate: "2026-09-28", endDate: "2026-10-04",
  weeks: [{
    id: "week-01", weekNumber: 1, startDate: "2026-09-28", endDate: "2026-10-04",
    phase: "bridge", theme: "独立加载的课程", goals: ["本周学习条件表达"],
    grammarIds: ["N3-001"], newGrammarIds: ["N3-001"], prerequisiteGrammarIds: [],
    tedArticleIds: [], assessmentId: "baseline", dailyPlans: [],
  }],
};

function deferred() {
  let resolvePromise;
  const promise = new Promise(resolve => { resolvePromise = resolve; });
  return { promise, resolve: resolvePromise };
}

async function makeTraining() {
  const frames = new Map(), effects = [], intervals = new Map();
  const requests = [], saved = [], opened = [], errors = [];
  const archive = deferred();
  let currentFrame, cursor = 0, dirty = true, tree, mounted = true, timerId = 0;
  let activeFrames = new Set();
  const session = {
    id: randomUUID(), mode: "practice", contentVersion: OLD_VERSION,
    questionIds: [archivedQuestion.id], startedAt: NOW - 60000, deadline: 0, category: "all",
  };
  const events = [{
    id: randomUUID(), kind: "training_session", entity: `session:${session.id}`,
    value: JSON.stringify(session), at: session.startedAt, seq: 1,
  }];
  const study = {
    session: { userId: "test-user", displayName: "Test" },
    model: modelModule.rebuild(events),
    async append(kind, entity, value) {
      const event = { id: randomUUID(), kind, entity, value, at: NOW, seq: events.length + 1 };
      events.push(event); saved.push(event);
      study.model = modelModule.rebuild(events); dirty = true;
      return event;
    },
    async appendBatch(inputs) {
      const batch = inputs.map((input, index) => ({
        ...input, id: randomUUID(), at: NOW, seq: events.length + index + 1,
      }));
      events.push(...batch); saved.push(...batch);
      study.model = modelModule.rebuild(events); dirty = true;
      return batch;
    },
  };
  const changed = (previous, next) => !previous || !next ||
    previous.length !== next.length || next.some((value, index) => !Object.is(value, previous[index]));
  const hooks = {
    useState(initial) {
      const slots = currentFrame.slots, index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
      return [slots[index], value => {
        const next = typeof value === "function" ? value(slots[index]) : value;
        if (!Object.is(next, slots[index])) { slots[index] = next; dirty = true; }
      }];
    },
    useRef(initial) {
      const slots = currentFrame.slots, index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useMemo(callback, dependencies) {
      const slots = currentFrame.slots, index = cursor++;
      if (!slots[index] || changed(slots[index].dependencies, dependencies))
        slots[index] = { dependencies, value: callback() };
      return slots[index].value;
    },
    useEffect(callback, dependencies) {
      const frame = currentFrame, index = cursor++, previous = frame.slots[index];
      if (!previous || changed(previous.dependencies, dependencies)) {
        effects.push(() => {
          previous?.cleanup?.();
          const slot = { dependencies, cleanup: undefined };
          frame.slots[index] = slot;
          slot.cleanup = callback();
        });
      }
    },
  };
  const jsx = (type, props) => ({ type, props });
  const fetchJSON = (url, _timeout, signal) => {
    requests.push({ url, signal });
    if (url === `/data/question-sets/${sessionModule.QUESTION_SET_VERSION}.json`)
      return Promise.reject(Error("Simulated current question-set failure"));
    if (url === `/data/question-sets/${OLD_VERSION}.json`) return archive.promise;
    if (url === "/data/n2-weekly-curriculum.json") return Promise.resolve(curriculum);
    throw Error(`Unexpected request: ${url}`);
  };
  let routeModule;
  function evaluate(code, filename) {
    const sandbox = {
      exports: {}, AbortController,
      Date: class extends Date { static now() { return NOW; } },
      crypto: { randomUUID },
      setInterval(callback, delay) { const id = ++timerId; intervals.set(id, { callback, delay }); return id; },
      clearInterval(id) { intervals.delete(id); },
      require(id) {
        if (id === "react") return hooks;
        if (id === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
        if (id === "@/lib/study/session") return { fetchJSON };
        if (id === "@/lib/study/content") return contentModule;
        if (id === "@/lib/training/types") return typesModule;
        if (id === "@/lib/training/planner") return plannerModule;
        if (id === "@/lib/training/session") return sessionModule;
        if (id === "./learning-route") return routeModule;
        if (id === "sonner") return { toast: { error(message) { errors.push(message); }, success() {} } };
        throw Error(`Unexpected dependency: ${id}`);
      },
    };
    vm.runInNewContext(code, sandbox, { filename });
    return sandbox.exports;
  }
  routeModule = evaluate(routeCode, "learning-route.compiled.cjs");
  const trainingModule = evaluate(trainingCode, "training.compiled.cjs");

  function cleanup(frame) {
    for (const slot of frame.slots) slot?.cleanup?.();
  }
  function expand(value, path) {
    if (Array.isArray(value)) return value.map((child, index) => expand(child, `${path}.${index}`));
    if (!value || typeof value !== "object") return value;
    if (typeof value.type === "function") {
      let frame = frames.get(path);
      if (frame && frame.type !== value.type) { cleanup(frame); frame = undefined; }
      if (!frame) { frame = { type: value.type, slots: [] }; frames.set(path, frame); }
      activeFrames.add(path); currentFrame = frame; cursor = 0;
      return expand(value.type(value.props), `${path}.rendered`);
    }
    return { ...value, props: { ...value.props, children: expand(value.props?.children, `${path}.children`) } };
  }
  function render() {
    assert.equal(mounted, true);
    dirty = false; activeFrames = new Set();
    tree = expand(jsx(trainingModule.Training, {
      study, entries: [{ id: "N3-001", title: "课程中的条件表达" }],
      onGrammar(id) { opened.push(id); }, onStartAudio() {},
    }), "root");
    for (const [path, frame] of frames) {
      if (!activeFrames.has(path)) { cleanup(frame); frames.delete(path); }
    }
    while (effects.length) effects.shift()();
  }
  async function settle() {
    // Bounded microtask turns settle fetch.then.catch and void async handlers.
    // An unresolved archive request remains pending until the test resolves it.
    for (let i = 0; i < 16; i++) {
      if (dirty) render();
      await Promise.resolve();
    }
    assert.equal(dirty, false, "Component state must settle without an update loop");
  }
  function nodes(value = tree, found = []) {
    // Defaults belong only to the public entry point. Recursing through an
    // absent children prop must stop, not substitute the whole root tree.
    function visit(child) {
      if (Array.isArray(child)) child.forEach(visit);
      else if (child && typeof child === "object") {
        found.push(child); visit(child.props?.children);
      }
    }
    visit(value);
    return found;
  }
  function text(value = tree) {
    function read(child) {
      if (Array.isArray(child)) return child.map(read).join("");
      if (child && typeof child === "object") return read(child.props?.children);
      return child === null || child === undefined || typeof child === "boolean" ? "" : String(child);
    }
    return read(value);
  }
  function button(label) {
    const node = nodes().find(item => item.type === "button" && text(item) === label);
    assert.ok(node, `Missing visible button: ${label}`);
    return node;
  }
  async function click(label) {
    const node = button(label);
    assert.ok(!node.props.disabled, `Button should be enabled: ${label}`);
    await node.props.onClick(); await settle();
  }
  function unmount() {
    for (const frame of frames.values()) cleanup(frame);
    frames.clear(); mounted = false;
    assert.equal(intervals.size, 0, "No interval may survive unmount");
  }
  await settle();
  return {
    study, session, requests, saved, opened, errors, nodes, text, button, click, settle, unmount,
    async resolveArchive() { archive.resolve([archivedQuestion]); await settle(); },
    async choose(index) {
      const input = nodes().filter(node => node.type === "input" && node.props.type === "radio")[index];
      assert.ok(input, `Missing answer option ${index}`);
      input.props.onChange(); await settle();
    },
  };
}

test("Training keeps the real weekly course and history usable when the current question set fails", async t => {
  const app = await makeTraining(); t.after(app.unmount);
  assert.match(app.text(), /练习内容未能加载/);
  assert.match(app.text(), /每周知道学什么/);
  assert.match(app.text(), /独立加载的课程/);
  assert.ok(app.nodes().some(node => node.type === "summary" && /训练记录（1组）/.test(app.text(node))));
  assert.equal(app.button("开始起点测评").props.disabled, true);
  assert.ok(!app.button("继续").props.disabled, "The saved history remains actionable");
  const lesson = app.nodes().find(node => node.type === "button" && app.text(node).includes("课程中的条件表达"));
  assert.ok(lesson && !lesson.props.disabled);
  lesson.props.onClick(); await app.settle();
  assert.deepEqual(app.opened, ["N3-001"]);
  await app.click("已学并加入复习");
  assert.match(app.text(), /已学 · 可撤回/);
  assert.equal(app.study.model.tasks["course:N3-001"], true);
  assert.equal(app.study.model.cards["N3-001"].enrolled, true);
  assert.ok(app.requests.some(request => request.url === "/data/n2-weekly-curriculum.json"));
  assert.deepEqual(app.errors, []);
});

test("Training resumes and finishes an archived session despite a failed current question set", async t => {
  const app = await makeTraining(); t.after(app.unmount);
  await app.click("继续");
  assert.match(app.text(), /这组题目的内容还未完整加载/);
  assert.ok(app.requests.some(request => request.url === `/data/question-sets/${OLD_VERSION}.json`));
  await app.resolveArchive();
  assert.match(app.text(), /练习内容未能加载/, "The current-set error remains present during the test");
  assert.ok(app.text().includes(archivedQuestion.prompt), "The archived question is visible");
  assert.equal(app.button("提交答案").props.disabled, true);
  await app.choose(archivedQuestion.answerIndex);
  await app.click("提交答案");
  assert.match(app.text(), /答对了/);
  assert.ok(app.text().includes(archivedQuestion.explanation));
  const answer = app.study.model.practice.find(item => item.sessionId === app.session.id);
  assert.equal(answer?.questionId, archivedQuestion.id);
  assert.equal(answer?.correct, true);
  await app.click("查看本组结果");
  assert.match(app.text(), /本组学习结果/);
  assert.match(app.text(), /已提交\s*1\/1\s*题，答对\s*1\s*题/);
  assert.ok(app.text().includes("正确答案：2. 即使下雨也出发"));
  assert.equal(app.study.model.trainingSessions[app.session.id].contentVersion, OLD_VERSION);
  assert.equal(app.study.model.trainingSessions[app.session.id].finishReason, "finished");
  assert.deepEqual(app.errors, []);
});
