"use client";
import { useEffect, useRef, useState } from "react";
import type { Entry } from "./types";
import { FileAudio } from "./file-audio";
import { audioRoute, type VoiceId } from "./voice-pack";

export function useAudio(
  settings: Record<string, unknown>,
  beforePlay?: () => void,
) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [playing, setPlaying] = useState("");
  const [source, setSource] = useState("");
  const [paused, setPaused] = useState(false);
  const run = useRef(0),
    hold = useRef(false);
  const finish = useRef<(() => void) | null>(null);
  const files = useRef<FileAudio | null>(null);
  if (!files.current) files.current = new FileAudio();
  const refresh = () => {
    if ("speechSynthesis" in window)
      setVoices(window.speechSynthesis.getVoices());
  };
  useEffect(() => {
    refresh();
    if ("speechSynthesis" in window)
      window.speechSynthesis.addEventListener("voiceschanged", refresh);
    return () => {
      run.current++;
      files.current?.stop();
      if ("speechSynthesis" in window) {
        window.speechSynthesis.removeEventListener("voiceschanged", refresh);
        window.speechSynthesis.cancel();
      }
      finish.current?.();
    };
  }, []);
  function stop() {
    run.current++;
    hold.current = false;
    setPaused(false);
    files.current?.stop();
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      window.speechSynthesis.resume();
    }
    finish.current?.();
    finish.current = null;
    setPlaying("");
    setSource("");
  }
  function pause() {
    hold.current = !hold.current;
    setPaused(hold.current);
    if (hold.current) files.current?.pause();
    else files.current?.resume();
    if ("speechSynthesis" in window) {
      if (hold.current) window.speechSynthesis.pause();
      else window.speechSynthesis.resume();
    }
  }
  async function waitWhilePaused(token: number) {
    while (hold.current && token === run.current)
      await new Promise((resolve) => setTimeout(resolve, 100));
  }
  async function say(
    text: string,
    lang: "ja" | "zh",
    rate: number,
    token: number,
    label: string,
  ) {
    if (hold.current) await waitWhilePaused(token);
    if (token !== run.current) return;
    if (!("speechSynthesis" in window))
      throw Error(
        "这个浏览器暂不支持系统朗读。请播放已有的日语音频，或关闭中文译文朗读。",
      );
    const available = window.speechSynthesis
      .getVoices()
      .filter((v) => v.lang.toLowerCase().startsWith(lang));
    const voice =
      available.find((v) => v.voiceURI === settings[lang + "Voice"]) ??
      available[0];
    if (!voice)
      throw Error(
        `没有可用的${lang === "ja" ? "日语" : "中文"}声音。请在系统中安装对应语音后刷新声音列表。`,
      );
    setSource(`${label} · ${voice.name}`);
    await new Promise<void>((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.voice = voice;
      utterance.lang = voice.lang;
      utterance.rate = rate;
      const done = () => {
        if (finish.current === done) finish.current = null;
        resolve();
      };
      finish.current = done;
      utterance.onend = done;
      utterance.onerror = (e) => {
        if (finish.current === done) finish.current = null;
        if (
          token !== run.current ||
          ["canceled", "interrupted"].includes(e.error)
        )
          resolve();
        else reject(Error("朗读中断，请检查声音设置后重试。"));
      };
      window.speechSynthesis.speak(utterance);
    });
  }
  async function japanese(
    entry: Entry,
    index: number,
    rate: number,
    token: number,
    preferences: Record<string, unknown>,
  ) {
    if (hold.current) await waitWhilePaused(token);
    if (token !== run.current) return;
    const route = audioRoute(entry, index, preferences);
    setSource(route.label);
    if (route.clip) await files.current!.play(route.clip.src, rate);
    else {
      const example = entry.examples[index];
      await say(
        preferences.useReadings ? example.japanese_reading : example.japanese,
        "ja",
        rate,
        token,
        route.label,
      );
    }
  }
  async function gap(token: number) {
    let remaining = Number(settings.gap ?? 4) * 1000;
    if (token === run.current) setSource("跟读留白");
    while (remaining > 0 && token === run.current) {
      await new Promise((r) => setTimeout(r, 100));
      if (!hold.current) remaining -= 100;
    }
  }
  async function play(
    entries: Entry[],
    single?: number,
    previewVoice?: VoiceId,
  ) {
    beforePlay?.();
    stop();
    const token = run.current;
    const speed = previewVoice ? 1 : Number(settings.speed ?? 1);
    const preferences = previewVoice
      ? { audioSource: previewVoice, useReadings: false }
      : settings;
    try {
      for (const entry of entries) {
        for (let i = 0; i < entry.examples.length; i++) {
          if (single !== undefined && i !== single) continue;
          if (token !== run.current) return;
          setPlaying(`${entry.id} · 例句 ${i + 1}`);
          await japanese(entry, i, speed, token, preferences);
          if (single !== undefined) continue;
          if (settings.withChinese !== false)
            await say(
              entry.examples[i].chinese,
              "zh",
              1,
              token,
              "中文浏览器声音",
            );
          if (settings.audioMode !== "review")
            await japanese(entry, i, speed * 0.8, token, preferences);
          await gap(token);
          if (settings.audioMode !== "review")
            await japanese(entry, i, speed, token, preferences);
        }
      }
    } finally {
      if (token === run.current) {
        setPlaying("");
        setSource("");
        setPaused(false);
      }
    }
  }
  async function word(text: string) {
    beforePlay?.();
    stop();
    const token = run.current;
    setPlaying(text);
    try {
      await say(
        text,
        "ja",
        Number(settings.speed ?? 1),
        token,
        "生词 · 浏览器声音",
      );
    } finally {
      if (token === run.current) {
        setPlaying("");
        setSource("");
        setPaused(false);
      }
    }
  }
  return { voices, playing, source, paused, play, stop, pause, word, refresh };
}
