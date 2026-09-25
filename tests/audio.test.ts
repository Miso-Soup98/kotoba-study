import test from "node:test";
import assert from "node:assert/strict";
import { FileAudio } from "../lib/study/file-audio.ts";
import { audioRoute } from "../lib/study/voice-pack.ts";
import corpus from "../public/data/grammar.json" with { type: "json" };
import manifest from "../public/audio/voices/manifest.json" with { type: "json" };
import { eventSchema } from "../lib/study/validation.ts";
import type { Entry } from "../lib/study/types.ts";
const entry = corpus.entries.find((e) => e.id === "N5-001") as Entry;
class FakeMedia {
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onplaying: (() => void) | null = null;
  onwaiting: (() => void) | null = null;
  src = "";
  playbackRate = 1;
  preservesPitch = false;
  paused = true;
  plays = 0;
  play() {
    this.paused = false;
    this.plays++;
    this.onplaying?.();
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
}
function setup(timeout = 15000) {
  const media = new FakeMedia();
  return {
    media,
    player: new FileAudio(() => media as unknown as HTMLAudioElement, timeout),
  };
}
test("all 104 voice clips match the unmodified textbook and unique entry/voice/index", () => {
  assert.equal(manifest.clips.length, 104);
  assert.equal(
    new Set(
      manifest.clips.map((c) => `${c.entryId}/${c.voice}/${c.exampleIndex}`),
    ).size,
    104,
  );
  for (const clip of manifest.clips) {
    const source = corpus.entries.find((e) => e.id === clip.entryId)!;
    assert.equal(clip.text, source.examples[clip.exampleIndex].japanese);
    assert.equal(clip.pdfPage, source.pdf_page);
    assert.ok(clip.durationSeconds > 0.5);
  }
});
test("recording choice honors voice, kana mode, uncovered sentences and changed text", () => {
  assert.match(audioRoute(entry, 0, {}).clip!.src, /nanami/);
  assert.match(
    audioRoute(entry, 0, { audioSource: "keita" }).clip!.src,
    /keita/,
  );
  assert.equal(audioRoute(entry, 0, { useReadings: true }).clip, undefined);
  assert.equal(
    audioRoute(entry, 0, { audioSource: "browser" }).clip,
    undefined,
  );
  assert.equal(audioRoute({ ...entry, id: "N2-001" }, 0, {}).clip, undefined);
  const edited = {
    ...entry,
    examples: [{ ...entry.examples[0], japanese: "新しい文章。" }],
  };
  assert.equal(audioRoute(edited, 0, {}).clip, undefined);
});
test("pause/resume, pitch-preserving slow playback and stop settle the active clip", async () => {
  const { media, player } = setup();
  const done = player.play("/one.mp3", 0.8);
  assert.equal(media.playbackRate, 0.8);
  assert.equal(media.preservesPitch, true);
  player.pause();
  assert.equal(media.paused, true);
  player.resume();
  assert.equal(media.paused, false);
  player.stop();
  await done;
  assert.equal(media.paused, true);
});
test("switching clips settles the old run; stale completion cannot stop a new clip", async () => {
  const { media, player } = setup();
  const first = player.play("/one.mp3", 1);
  const oldEnd = media.onended;
  const second = player.play("/two.mp3", 1);
  await first;
  oldEnd?.();
  assert.equal(media.src, "/two.mp3");
  assert.equal(media.paused, false);
  media.onended?.();
  await second;
});
test("failed or stalled audio terminates playback instead of silently using another voice", async () => {
  const { media, player } = setup(15);
  const failed = player.play("/missing.mp3", 1);
  media.onerror?.();
  await assert.rejects(failed, /无法加载/);
  const stalled = player.play("/slow.mp3", 1);
  media.onwaiting?.();
  await assert.rejects(stalled, /超时/);
  assert.equal(media.paused, true);
});
test("a delayed rejection from an old play request cannot terminate the next clip", async () => {
  const { media, player } = setup();
  let reject!: (reason: Error) => void;
  media.play = () =>
    new Promise((_, no) => {
      reject = no;
    });
  const first = player.play("/old.mp3", 1);
  media.play = () => Promise.resolve();
  const second = player.play("/new.mp3", 1);
  reject(Error("old abort"));
  await first;
  media.onended?.();
  await second;
});
test("voice choice can sync, arbitrary source URLs cannot", () => {
  const event = {
    id: "69b29eb1-f6d3-46be-a189-1604686af9a1",
    kind: "setting",
    entity: "audioSource",
    value: "keita",
    at: Date.now(),
  };
  assert.equal(eventSchema.safeParse(event).success, true);
  assert.equal(
    eventSchema.safeParse({ ...event, value: "https://external.test/" })
      .success,
    false,
  );
});

test("pause then resume ignores a delayed AbortError from the initial play on the same clip", async () => {
  const { media, player } = setup();
  let reject!: (reason: Error) => void;
  media.play = () =>
    new Promise((_, no) => {
      reject = no;
    });
  const done = player.play("/one.mp3", 1);
  player.pause();
  media.play = () => {
    media.paused = false;
    return Promise.resolve();
  };
  player.resume();
  const error = new Error("interrupted by pause");
  error.name = "AbortError";
  reject(error);
  await Promise.resolve();
  assert.equal(media.paused, false);
  assert.ok(media.onended);
  media.onended?.();
  await done;
});
