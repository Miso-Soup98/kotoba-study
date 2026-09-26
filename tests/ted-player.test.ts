// @ts-nocheck
/**
 * Read-only TED player regression checks against the real TSX source.
 * Run from the app directory:
 *   node --experimental-strip-types --test tests/ted-player.test.ts
 * No browser, network, application changes, or real audio are used.
 * HTMLMediaElement events and React hooks are simulated; this does not
 * replace browser playback/accessibility tests or listening verification.
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
const { tedLoopSchema } = await import(
  pathToFileURL(resolve(appRoot, "lib/ted/validation.ts")).href
);
const compiled = ts.transpileModule(
  readFileSync(resolve(appRoot, "components/ted-player.tsx"), "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;

function makePlayer() {
  const slots = [],
    pendingEffects = [],
    nativeEvents = [];
  const intervals = new Map(),
    timeouts = new Map(),
    savedProgress = [];
  let cursor = 0,
    nextTimer = 0,
    tree,
    mediaNode;
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [
        slots[index],
        (value) => {
          slots[index] =
            typeof value === "function" ? value(slots[index]) : value;
        },
      ];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useEffect(callback, dependencies) {
      const index = cursor++,
        previous = slots[index];
      if (
        !previous ||
        !dependencies ||
        dependencies.some((v, i) => !Object.is(v, previous.dependencies[i]))
      ) {
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
      if (id === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (id === "lucide-react") return new Proxy({}, { get: (_, key) => key });
      if (id.includes("ui/slider")) return { Slider: "Slider" };
      if (id.includes("ui/select"))
        return new Proxy({}, { get: (_, key) => key });
      if (id.includes("ted/types"))
        return {
          LOOP_COLORS: ["a", "b", "c", "d", "e", "f"],
          formatTime: String,
        };
      if (id.includes("ted/validation")) return { tedLoopSchema };
      if (id === "sonner") return { toast: { error() {}, success() {} } };
      throw Error(`Unexpected dependency: ${id}`);
    },
    setInterval(callback) {
      const id = ++nextTimer;
      intervals.set(id, callback);
      return id;
    },
    clearInterval(id) {
      intervals.delete(id);
    },
    setTimeout(callback, delay) {
      const id = ++nextTimer;
      timeouts.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id) {
      timeouts.delete(id);
    },
    document: {
      visibilityState: "visible",
      addEventListener() {},
      removeEventListener() {},
    },
    window: { addEventListener() {}, removeEventListener() {} },
    crypto,
  };
  vm.runInNewContext(compiled, sandbox, {
    filename: "ted-player.compiled.cjs",
  });
  const props = {
    id: "ted-new-001",
    duration: 120,
    progress: 0,
    loops: {
      loop: {
        articleId: "ted-new-001",
        label: "测试循环",
        color: 0,
        start: 10,
        end: 20,
      },
    },
    onSave: async () => {},
    onProgress: async (value) => {
      savedProgress.push(value);
    },
    onStart() {},
    onActive() {},
  };
  const audio = {
    src: "/api/ted/media?id=ted-new-001&kind=audio",
    loads: 0,
    duration: 120,
    currentTime: 0,
    paused: true,
    playbackRate: 1,
    preservesPitch: true,
    getAttribute(name) {
      return name === "src" ? this.src : null;
    },
    removeAttribute(name) {
      if (name === "src") this.src = null;
    },
    load() {
      this.loads++;
      this.paused = true;
    },
    pause() {
      if (!this.paused) {
        this.paused = true;
        nativeEvents.push(() => mediaNode.props.onPause());
      }
    },
    async play() {
      if (this.paused) {
        this.paused = false;
        nativeEvents.push(() => mediaNode.props.onPlay());
      }
    },
  };
  function nodes(value = tree, found = []) {
    if (value && typeof value === "object") {
      if (value.type) found.push(value);
      for (const child of [value.props?.children].flat(Infinity)) {
        if (child !== undefined && child !== null) nodes(child, found);
      }
    }
    return found;
  }
  function render() {
    cursor = 0;
    tree = sandbox.exports.TedPlayer(props);
    mediaNode = nodes().find((node) => node.type === "audio");
    mediaNode.props.ref.current = audio;
    while (pendingEffects.length) pendingEffects.shift()();
  }
  function flush() {
    render();
    while (nativeEvents.length) {
      nativeEvents.shift()();
      render();
    }
  }
  async function act(callback) {
    await callback();
    flush();
  }
  function byLabel(label) {
    return nodes().find((node) => node.props["aria-label"] === label);
  }
  async function click(label) {
    assert.ok(byLabel(label), `Expected button: ${label}`);
    await act(() => byLabel(label).props.onClick());
  }
  async function finishPass() {
    assert.equal(
      audio.paused,
      false,
      "An actual pass must be playing before it ends",
    );
    await act(() => {
      audio.currentTime = 20;
      mediaNode.props.onTimeUpdate();
      for (const callback of intervals.values()) callback();
    });
  }
  function completed() {
    return nodes()
      .map((node) => node.props.children)
      .find(
        (children) => Array.isArray(children) && children[0] === "已完成 ",
      )?.[1];
  }
  async function startLoop() {
    await act(() => mediaNode.props.onLoadedMetadata());
    async function choose(label, value) {
      const native = byLabel(label);
      if (native.props.onChange) {
        await act(() => native.props.onChange({ target: { value } }));
      } else {
        const select = nodes().find(
          (node) =>
            node.type === "Select" &&
            nodes(node).some((child) => child.props["aria-label"] === label),
        );
        assert.ok(select, `Expected select: ${label}`);
        await act(() => select.props.onValueChange(value));
      }
    }
    await choose("循环次数", "3");
    await choose("循环留白", "2");
    await act(() =>
      nodes()
        .find((node) => node.props.className === "ted-loop-play")
        .props.onClick(),
    );
    assert.equal(audio.currentTime, 10);
    assert.equal(audio.paused, false);
  }
  async function completeGap() {
    assert.equal(timeouts.size, 1);
    await act(() => {
      const [id, timer] = [...timeouts.entries()][0];
      assert.equal(timer.delay, 2000);
      timeouts.delete(id);
      timer.callback();
    });
  }
  async function seek(mode) {
    if (mode === "slider") {
      await act(() => byLabel("音频播放进度").props.onValueChange([15]));
    } else {
      await act(() =>
        nodes()
          .find(
            (node) =>
              node.type === "button" && node.props.children === "退 5 秒",
          )
          .props.onClick(),
      );
    }
  }
  function unmount() {
    // React detaches host refs before running passive effect cleanup.
    mediaNode.props.ref.current = null;
    for (const slot of slots) slot?.cleanup?.();
  }
  function replayEffects() {
    // Strict Mode replays effects while retaining the actual media element.
    for (const slot of slots) slot?.cleanup?.();
    for (const slot of slots) {
      if (slot?.callback) slot.cleanup = slot.callback();
    }
  }
  render();
  return {
    audio,
    byLabel,
    click,
    startLoop,
    finishPass,
    completed,
    completeGap,
    seek,
    timeouts,
    intervals,
    savedProgress,
    unmount,
    replayEffects,
  };
}

test("pausing during a repeat gap resumes at A without consuming another repetition", async () => {
  const player = makePlayer();
  await player.startLoop();
  await player.finishPass();
  assert.equal(player.completed(), 1);
  assert.equal(player.timeouts.size, 1);
  assert.equal(player.audio.paused, true);
  await player.click("暂停音频");
  assert.equal(player.timeouts.size, 0);
  await player.click("播放音频");
  assert.equal(
    player.audio.currentTime,
    10,
    "Resume must start the next real pass at A",
  );
  assert.equal(player.audio.paused, false);
  assert.equal(
    player.completed(),
    1,
    "Resume must not count the gap as a completed pass",
  );
  await player.finishPass();
  assert.equal(player.completed(), 2);
  await player.completeGap();
  assert.equal(player.audio.currentTime, 10);
  await player.finishPass();
  assert.equal(
    player.audio.paused,
    true,
    "Exactly three real passes must finish the loop",
  );
  assert.equal(player.timeouts.size, 0);
  assert.ok(player.byLabel("播放音频"));
});

for (const mode of ["slider", "back-five-seconds"]) {
  for (const explicitlyPaused of [false, true]) {
    test(`${mode} during a gap exits looping and ${explicitlyPaused ? "preserves explicit pause" : "continues active playback"}`, async () => {
      const player = makePlayer();
      await player.startLoop();
      await player.finishPass();
      if (explicitlyPaused) await player.click("暂停音频");
      await player.seek(mode);
      assert.equal(player.audio.currentTime, 15);
      assert.equal(
        player.timeouts.size,
        0,
        "Seeking cancels the old scheduled repeat",
      );
      assert.equal(player.completed(), undefined, "Seeking exits the loop");
      assert.equal(
        player.audio.paused,
        explicitlyPaused,
        "UI and media playback state must agree",
      );
      assert.ok(player.byLabel(explicitlyPaused ? "播放音频" : "暂停音频"));
    });
  }
}

test("unmount releases the playing media after React clears the ref and saves its final position", async () => {
  const player = makePlayer();
  await player.startLoop();
  player.audio.currentTime = 17.5;
  player.unmount();
  assert.equal(player.audio.paused, true);
  assert.equal(player.audio.src, null);
  assert.equal(
    player.audio.loads,
    1,
    "load() releases the previous source and buffered media",
  );
  assert.equal(player.savedProgress.at(-1), 17.5);
  assert.equal(player.intervals.size, 0);
  assert.equal(player.timeouts.size, 0);
});

test("unmount during a repeat gap cancels the scheduled restart and releases the source", async () => {
  const player = makePlayer();
  await player.startLoop();
  await player.finishPass();
  assert.equal(player.timeouts.size, 1);
  player.unmount();
  assert.equal(player.timeouts.size, 0);
  assert.equal(player.intervals.size, 0);
  assert.equal(player.audio.src, null);
  assert.equal(player.audio.loads, 1);
});

test("effect replay restores the same article source after disposing the previous media", () => {
  const player = makePlayer();
  player.replayEffects();
  assert.equal(player.audio.loads, 1);
  assert.equal(player.audio.src, "/api/ted/media?id=ted-new-001&kind=audio");
  assert.equal(player.intervals.size, 0, "idle replay must not start a polling timer");
});


test("the loop clock runs only for active playback and stops on pause, loop exit, and completion", async () => {
  const player = makePlayer();
  assert.equal(player.intervals.size, 0, "opening a TED article does not start an idle clock");
  await player.startLoop();
  assert.equal(player.intervals.size, 1);
  await player.click("暂停音频");
  assert.equal(player.intervals.size, 0);
  await player.click("播放音频");
  assert.equal(player.intervals.size, 1, "resume restores one clock");
  await player.seek("slider");
  assert.equal(player.audio.paused, false);
  assert.equal(player.intervals.size, 0, "ordinary playback needs no loop clock");
  await player.startLoop();
  assert.equal(player.intervals.size, 1);
  await player.finishPass();
  await player.completeGap();
  await player.finishPass();
  await player.completeGap();
  await player.finishPass();
  assert.equal(player.audio.paused, true);
  assert.equal(player.intervals.size, 0, "the final repetition releases the clock");
  player.unmount();
});
