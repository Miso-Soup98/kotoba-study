"use client";
import { useEffect, useRef, useState } from "react";
import type { Entry } from "./types";
export function useAudio(settings: Record<string, unknown>) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [playing, setPlaying] = useState("");
  const [paused, setPaused] = useState(false);
  const run = useRef(0),
    hold = useRef(false),
    finish = useRef<(() => void) | null>(null);
  const refresh = () => {
    if ("speechSynthesis" in window)
      setVoices(window.speechSynthesis.getVoices());
  };
  useEffect(() => {
    refresh();
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.addEventListener("voiceschanged", refresh);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", refresh);
      run.current++;
      window.speechSynthesis.cancel();
      finish.current?.();
    };
  }, []);
  function stop() {
    run.current++;
    hold.current = false;
    setPaused(false);
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    finish.current?.();
    finish.current = null;
    setPlaying("");
  }
  function pause() {
    if (!("speechSynthesis" in window)) return;
    hold.current = !hold.current;
    setPaused(hold.current);
    if (hold.current) window.speechSynthesis.pause();
    else window.speechSynthesis.resume();
  }
  async function say(
    text: string,
    lang: "ja" | "zh",
    rate: number,
    token: number,
  ) {
    if (token !== run.current) return;
    if (!("speechSynthesis" in window))
      throw Error("这个浏览器暂不支持点读，请使用已生成的音频样例。");
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
    await new Promise<void>((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.voice = voice;
      utterance.lang = voice.lang;
      utterance.rate = rate;
      finish.current = resolve;
      utterance.onend = () => {
        finish.current = null;
        resolve();
      };
      utterance.onerror = (e) => {
        finish.current = null;
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
  async function gap(token: number) {
    let remaining = Number(settings.gap ?? 4) * 1000;
    while (remaining > 0 && token === run.current) {
      await new Promise((r) => setTimeout(r, 100));
      if (!hold.current) remaining -= 100;
    }
  }
  async function play(entries: Entry[], single?: number) {
    stop();
    const token = run.current;
    const speed = Number(settings.speed ?? 1);
    try {
      for (const entry of entries) {
        for (let i = 0; i < entry.examples.length; i++) {
          if (single !== undefined && i !== single) continue;
          if (token !== run.current) return;
          const ex = entry.examples[i];
          const jp = settings.useReadings ? ex.japanese_reading : ex.japanese;
          setPlaying(`${entry.id} · 例句 ${i + 1}`);
          await say(jp, "ja", speed, token);
          if (single !== undefined) continue;
          if (settings.withChinese !== false)
            await say(ex.chinese, "zh", 1, token);
          if (settings.audioMode !== "review")
            await say(jp, "ja", speed * 0.8, token);
          await gap(token);
          if (settings.audioMode !== "review")
            await say(jp, "ja", speed, token);
        }
      }
    } finally {
      if (token === run.current) {
        setPlaying("");
        setPaused(false);
      }
    }
  }
  async function word(text: string) {
    stop();
    const token = run.current;
    setPlaying(text);
    try {
      await say(text, "ja", Number(settings.speed ?? 1), token);
    } finally {
      if (token === run.current) setPlaying("");
    }
  }
  return { voices, playing, paused, play, stop, pause, word, refresh };
}
