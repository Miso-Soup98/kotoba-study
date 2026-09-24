"use client";
import { useEffect, useRef, useState } from "react";
type Note = { text: string; revision: string };
type Draft = { text: string; base: string | null; dirty: boolean };
export function useNoteDraft(
  account: string | undefined,
  key: string,
  remote: Note | undefined,
) {
  const storageKey = account ? `kotoba-draft:${account}:${key}` : "";
  const [draft, setDraft] = useState<Draft>({
    text: "",
    base: null,
    dirty: false,
  });
  const loaded = useRef("");
  useEffect(() => {
    if (loaded.current !== storageKey) {
      loaded.current = storageKey;
      let saved: Draft | null = null;
      try {
        saved = storageKey
          ? JSON.parse(localStorage.getItem(storageKey) || "null")
          : null;
      } catch {}
      setDraft(
        saved ?? {
          text: remote?.text ?? "",
          base: remote?.revision ?? null,
          dirty: false,
        },
      );
    } else
      setDraft((old) =>
        old.dirty
          ? old
          : {
              text: remote?.text ?? "",
              base: remote?.revision ?? null,
              dirty: false,
            },
      );
  }, [storageKey, remote?.revision, remote?.text]);
  function setText(text: string) {
    setDraft((old) => {
      const next = { ...old, text, dirty: true };
      try {
        if (storageKey) localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* The in-memory draft remains editable when storage is full. */
      }
      return next;
    });
  }
  function saved(id: string) {
    const finish = (old: Draft): Draft =>
      old.base !== draft.base
        ? old
        : { ...old, base: id, dirty: old.text !== draft.text };
    const persist = (next: Draft) => {
      try {
        if (!storageKey) return;
        if (next.dirty) localStorage.setItem(storageKey, JSON.stringify(next));
        else localStorage.removeItem(storageKey);
      } catch {}
    };
    if (loaded.current !== storageKey) {
      try {
        const stored = JSON.parse(
          localStorage.getItem(storageKey) || "null",
        ) as Draft | null;
        if (stored) persist(finish(stored));
      } catch {}
      return;
    }
    setDraft((old) => {
      const next = finish(old);
      persist(next);
      return next;
    });
  }
  return {
    text: storageKey === loaded.current ? draft.text : "",
    base: draft.base,
    setText,
    saved,
    dirty: draft.dirty,
    remoteChanged: draft.dirty && (remote?.revision ?? null) !== draft.base,
  };
}
