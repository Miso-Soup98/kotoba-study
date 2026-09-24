import manifest from "../../public/audio/voices/manifest.json" with { type: "json" };
import type { Entry } from "./types.ts";

export type VoiceId = "nanami" | "keita";
export const voiceOptions: { id: VoiceId; label: string }[] = [
  { id: "nanami", label: "Nanami · 女声" },
  { id: "keita", label: "Keita · 男声" },
];
export const sampleEntryIds = [
  ...new Set(manifest.clips.map((clip) => clip.entryId)),
];
export function chosenVoice(
  settings: Record<string, unknown>,
): VoiceId | "browser" {
  return settings.audioSource === "browser"
    ? "browser"
    : settings.audioSource === "keita"
      ? "keita"
      : "nanami";
}
export function voiceClip(entry: Entry, index: number, voice: VoiceId) {
  // A changed teaching sentence must never play an outdated recording.
  return manifest.clips.find(
    (clip) =>
      clip.entryId === entry.id &&
      clip.exampleIndex === index &&
      clip.voice === voice &&
      clip.text === entry.examples[index]?.japanese,
  );
}
export function audioRoute(
  entry: Entry,
  index: number,
  settings: Record<string, unknown>,
) {
  const voice = chosenVoice(settings);
  if (settings.useReadings)
    return { label: "浏览器声音 · 假名稿", clip: undefined };
  if (voice === "browser") return { label: "浏览器声音", clip: undefined };
  const clip = voiceClip(entry, index, voice);
  return {
    clip,
    label: clip
      ? `${voiceOptions.find((v) => v.id === voice)!.label} · MP3`
      : "浏览器声音 · 本句尚无音频",
  };
}
