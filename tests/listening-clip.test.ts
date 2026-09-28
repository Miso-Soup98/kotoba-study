// @ts-nocheck
/**
 * Regression checks against the real ListeningClip TSX implementation.
 * Copy this file into app/tests before running it with the project's guarded
 * test command. This draft has only been inspected statically, not executed.
 *
 * React hooks, media events and timers are simulated. No browser, network,
 * audio decoding or wall-clock waits are used. This does not establish Safari
 * compatibility, decoder memory use or actual playback/pronunciation quality.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import vm from "node:vm";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const requireApp = createRequire(resolve(appRoot, "package.json"));
const ts = requireApp("typescript");
const compiled = ts.transpileModule(
  readFileSync(resolve(appRoot, "components/listening-card.tsx"), "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;

function makeClip() {
  const slots = [];
  const pendingEffects = [];
  const nativeEvents = [];
  const intervals = new Map();
  const listeners = new Map();
  let cursor = 0;
  let nextTimer = 0;
  let tree;
  let mediaNode;
  let mounted = true;
  let startCalls = 0;

  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots))
        slots[index] = typeof initial === "function" ? initial() : initial;
      return [slots[index], (value) => {
        slots[index] = typeof value === "function" ? value(slots[index]) : value;
      }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useEffect(callback, dependencies) {
      const index = cursor++;
      const previous = slots[index];
      if (!previous || !dependencies ||
          dependencies.length !== previous.dependencies?.length ||
          dependencies.some((value, i) => !Object.is(value, previous.dependencies[i]))) {
        pendingEffects.push(() => {
          previous?.cleanup?.();
          slots[index] = { dependencies, callback, cleanup: callback() };
        });
      }
    },
  };
  const jsx = (type, props) => ({ type, props });
  const sandbox = {
    exports: {},
    require(id) {
      if (id === "react") return hooks;
      if (id === "react/jsx-runtime")
        return { jsx, jsxs: jsx, Fragment: "Fragment" };
      if (id.includes("ui/dialog"))
        return new Proxy({}, { get: (_, key) => key });
      if (id === "sonner") return { toast: { error() {}, success() {} } };
      if (id.includes("study/listening-card"))
        return { listeningCardSchema: { parse() {
          throw Error("ListeningClip must not invoke dialog persistence");
        } } };
      if (id.includes("ted/types")) return { formatTime: String };
      if (id.includes("ted/paragraph")) return { visibleParagraph() {
        throw Error("ListeningClip must not resolve dialog paragraphs");
      } };
      throw Error(`Unexpected dependency: ${id}`);
    },
    setInterval(callback, delay) {
      const id = ++nextTimer;
      intervals.set(id, { callback, delay });
      return id;
    },
    clearInterval(id) { intervals.delete(id); },
    window: {
      addEventListener(name, callback) {
        if (!listeners.has(name)) listeners.set(name, new Set());
        listeners.get(name).add(callback);
      },
      removeEventListener(name, callback) {
        const handlers = listeners.get(name);
        handlers?.delete(callback);
        if (handlers?.size === 0) listeners.delete(name);
      },
    },
  };
  vm.runInNewContext(compiled, sandbox, {
    filename: "listening-card.compiled.cjs",
  });

  const props = {
    card: {
      id: "listen:00000000-0000-4000-8000-000000000001",
      articleId: "ted-new-001",
      articleTitle: "测试资料",
      label: "测试片段",
      start: 10,
      end: 20,
      japanese: "これはテストです。",
      chinese: "这是测试。",
      sourceLoopId: "tedloop:00000000-0000-4000-8000-000000000002",
    },
    onStart() { startCalls++; },
  };
  const expectedSrc = "/api/ted/media?id=ted-new-001&kind=audio";
  const audio = {
    // React applies the src attribute on the initial host commit. A subsequent
    // render with the same prop must not silently repair a removed attribute.
    src: expectedSrc,
    loads: 0,
    playCalls: 0,
    pauseTransitions: 0,
    readyState: 0,
    duration: Number.NaN,
    currentTime: 0,
    paused: true,
    getAttribute(name) { return name === "src" ? this.src : null; },
    removeAttribute(name) { if (name === "src") this.src = null; },
    load() {
      this.loads++;
      this.paused = true;
      this.readyState = 0;
      this.duration = Number.NaN;
      this.currentTime = 0;
    },
    pause() {
      if (!this.paused) {
        this.paused = true;
        this.pauseTransitions++;
        nativeEvents.push(() => mediaNode.props.onPause());
      }
    },
    async play() {
      this.playCalls++;
      if (!this.src) throw Error("No media source");
      if (this.paused) {
        this.paused = false;
        nativeEvents.push(() => mediaNode.props.onPlay());
      }
    },
  };

  function nodes(value = tree, found = []) {
    if (value && typeof value === "object") {
      if (value.type) found.push(value);
      for (const child of [value.props?.children].flat(Infinity))
        if (child !== undefined && child !== null) nodes(child, found);
    }
    return found;
  }
  function render() {
    assert.equal(mounted, true, "The harness must not render after unmount");
    cursor = 0;
    tree = sandbox.exports.ListeningClip(props);
    mediaNode = nodes().find(node => node.type === "audio");
    assert.ok(mediaNode, "The real component must render its media element");
    mediaNode.props.ref.current = audio;
    while (pendingEffects.length) pendingEffects.shift()();
  }
  function flush() {
    render();
    let events = 0;
    while (nativeEvents.length) {
      assert.ok(++events <= 30, "Media events must settle without an event loop");
      nativeEvents.shift()();
      render();
    }
  }
  async function act(callback) {
    await callback();
    flush();
  }
  function playButton() {
    const button = nodes().find(node => node.type === "button");
    assert.ok(button, "Expected the actual clip play/pause button");
    return button;
  }
  async function clickPlayPause() {
    // The real handler intentionally returns void; awaiting one microtask then
    // draining media events mirrors the existing ted-player harness.
    await act(() => playButton().props.onClick());
  }
  async function metadata(duration) {
    await act(() => {
      audio.readyState = 1;
      audio.duration = duration;
      mediaNode.props.onLoadedMetadata();
    });
  }
  async function advance(position, trigger) {
    await act(() => {
      audio.currentTime = position;
      if (trigger === "timeupdate") mediaNode.props.onTimeUpdate();
      else {
        assert.equal(intervals.size, 1, "Playback should have one boundary clock");
        for (const timer of [...intervals.values()]) {
          assert.equal(timer.delay, 40);
          timer.callback();
        }
      }
    });
  }
  async function dispatchStop() {
    await act(() => {
      for (const callback of [...(listeners.get("kotoba:stop-ted") ?? [])])
        callback();
    });
  }
  function alertText() {
    return nodes().find(node => node.props.role === "alert")?.props.children;
  }
  function listenerCount() {
    return [...listeners.values()].reduce((total, handlers) => total + handlers.size, 0);
  }
  function replayEffects() {
    // Strict Mode retains the same host node and replays cleanup/setup. Do not
    // call render here: that could conceal a missing source restoration.
    for (const slot of slots) slot?.cleanup?.();
    for (const slot of slots)
      if (slot?.callback) slot.cleanup = slot.callback();
  }
  function unmount() {
    // React detaches the host ref before passive cleanup. Captured elements
    // still need to be paused and released, even though ref.current is null.
    mediaNode.props.ref.current = null;
    for (const slot of slots) slot?.cleanup?.();
    mounted = false;
    nativeEvents.length = 0;
  }

  render();
  return {
    audio, expectedSrc, intervals, listenerCount, replayEffects, unmount,
    clickPlayPause, metadata, advance, dispatchStop, alertText,
    buttonText: () => playButton().props.children,
    startCalls: () => startCalls,
  };
}

test("ListeningClip restores the same audio source after Strict Mode effect replay", async () => {
  const clip = makeClip();
  assert.equal(clip.intervals.size, 0, "An idle card must not poll");
  assert.equal(clip.listenerCount(), 1);
  clip.replayEffects();
  assert.equal(clip.audio.loads, 1);
  assert.equal(clip.audio.src, clip.expectedSrc);
  assert.equal(clip.listenerCount(), 1, "Replay must replace, not duplicate, its stop listener");
  assert.equal(clip.intervals.size, 0);
  await clip.metadata(120);
  await clip.clickPlayPause();
  assert.equal(clip.audio.paused, false, "Restored source must remain playable");
  assert.equal(clip.audio.currentTime, 10);
  assert.equal(clip.intervals.size, 1);
  clip.unmount();
});

for (const trigger of ["interval", "timeupdate"]) {
  test(`ListeningClip stops at B through ${trigger} and releases its boundary clock`, async () => {
    const clip = makeClip();
    await clip.metadata(120);
    await clip.clickPlayPause();
    assert.equal(clip.audio.currentTime, 10, "Every requested pass begins at A");
    await clip.advance(19.9, trigger);
    assert.equal(clip.audio.paused, false, "The clip must not stop before B");
    await clip.advance(20, trigger);
    assert.equal(clip.audio.paused, true);
    assert.equal(clip.intervals.size, 0);
    assert.equal(clip.buttonText(), "听原声片段");
    clip.unmount();
  });
}

test("ListeningClip manual pause and another player's stop event both clear its clock", async () => {
  const clip = makeClip();
  await clip.metadata(120);
  await clip.clickPlayPause();
  assert.equal(clip.intervals.size, 1);
  await clip.clickPlayPause();
  assert.equal(clip.audio.paused, true);
  assert.equal(clip.intervals.size, 0);
  assert.equal(clip.buttonText(), "听原声片段");
  await clip.clickPlayPause();
  assert.equal(clip.intervals.size, 1);
  await clip.dispatchStop();
  assert.equal(clip.audio.paused, true);
  assert.equal(clip.intervals.size, 0);
  assert.equal(clip.listenerCount(), 1, "The mounted card still responds to a future stop");
  clip.unmount();
});

test("ListeningClip unmount releases playing media and listeners after the ref is detached", async () => {
  const clip = makeClip();
  await clip.metadata(120);
  await clip.clickPlayPause();
  assert.equal(clip.audio.paused, false);
  assert.equal(clip.intervals.size, 1);
  clip.unmount();
  assert.equal(clip.audio.paused, true);
  assert.equal(clip.audio.src, null);
  assert.equal(clip.audio.loads, 1, "load() releases the old source and buffer");
  assert.equal(clip.intervals.size, 0);
  assert.equal(clip.listenerCount(), 0);
});

test("ListeningClip cannot replay an out-of-range card after metadata rejects its first play", async () => {
  const clip = makeClip();
  // preload=none permits the user's first click before the duration is known.
  await clip.clickPlayPause();
  assert.equal(clip.audio.playCalls, 1);
  assert.equal(clip.audio.paused, false);
  await clip.metadata(15); // Saved B=20 exceeds the actual duration.
  assert.equal(clip.audio.paused, true);
  assert.equal(clip.intervals.size, 0);
  assert.match(clip.alertText(), /片段超出音频长度/);
  const startsBeforeRetry = clip.startCalls();
  await clip.clickPlayPause();
  assert.equal(clip.audio.playCalls, 1, "Retry must not reach media.play()");
  assert.equal(clip.startCalls(), startsBeforeRetry, "Invalid retry must not stop other media");
  assert.equal(clip.audio.paused, true);
  assert.equal(clip.intervals.size, 0);
  assert.match(clip.alertText(), /片段超出音频长度/);
  clip.unmount();
});
