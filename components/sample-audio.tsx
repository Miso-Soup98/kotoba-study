"use client";
import { useEffect, useRef, type RefObject } from "react";

export function SampleAudio({ id, tracks, onPlay }: {
  id: string;
  tracks: RefObject<Map<string, HTMLAudioElement>>;
  onPlay: () => void;
}) {
  const media = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const element = media.current;
    if (!element) return;
    // Restore the source when React replays effects in development.
    if (!element.getAttribute("src")) element.src = `/audio/${id}.mp3`;
    const registered = tracks.current;
    registered.set(id, element);
    return () => {
      if (registered.get(id) === element) registered.delete(id);
      element.pause();
      element.removeAttribute("src");
      element.load();
    };
  }, [id, tracks]);
  return <audio ref={media} controls preload="none" src={`/audio/${id}.mp3`}
    aria-label={`${id} 听读样例`} onPlay={onPlay} />;
}
