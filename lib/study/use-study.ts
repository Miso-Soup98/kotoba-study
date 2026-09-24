"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Cache, EventKind, Session, StudyEvent } from "./types";
import { readCache, updateCache } from "./storage";
import {
  combineEvents,
  mergeCache,
  rebuild,
  eventBatch,
  sameCache,
} from "./model";
import { fetchJSON, resolveSession } from "./session";
import { eventSchema } from "./validation";
const EMPTY: Cache = { events: [], pending: [], cursor: 0 };
export function useStudy() {
  const [session, setSession] = useState<Session | null>(null);
  const [cache, setCache] = useState<Cache>(EMPTY);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState("连接中");
  const [error, setError] = useState("");
  const syncing = useRef(false);
  const active = useRef<string | null>(null);
  // IndexedDB returns fresh clones, even when no learning data changed.
  const publishCache = useCallback((next: Cache) => {
    setCache((previous) => (sameCache(previous, next) ? previous : next));
  }, []);
  useEffect(() => {
    let cancelled = false;
    async function boot() {
      const result = await resolveSession(() => fetchJSON("/api/session"), {
        getItem: (key) => localStorage.getItem(key),
        setItem: (key, value) => localStorage.setItem(key, value),
        removeItem: (key) => localStorage.removeItem(key),
      });
      if (cancelled) return;
      const user = result.user;
      if (result.offline) {
        setStatus("离线，等待同步");
        setError(
          "登录状态暂时无法确认，你可以继续阅读教材；联网后请刷新重试。",
        );
      }
      if (result.storageFailed)
        setError(
          "登录已成功，但浏览器无法保存离线身份。请检查此网站的存储权限或可用空间。",
        );
      active.current = user?.userId ?? null;
      setSession(user);
      if (user) {
        try {
          const c = await readCache(user.userId);
          if (!cancelled && active.current === user.userId) publishCache(c);
        } catch {
          setError("本机存储不可用，请允许浏览器保存网站数据。");
        }
      } else setStatus("登录后开启同步");
      setReady(true);
    }
    void boot();
    return () => {
      cancelled = true;
      active.current = null;
    };
  }, [publishCache]);
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "kotoba-account") {
        let id: string | null = null;
        try {
          id = JSON.parse(e.newValue || "null")?.userId ?? null;
        } catch {}
        if (id !== active.current) {
          active.current = null;
          setSession(null);
          setCache(EMPTY);
          setStatus("账号已切换，请刷新");
        }
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  const sync = useCallback(async () => {
    const uid = session?.userId;
    if (!uid || active.current !== uid || syncing.current) return;
    if (!navigator.onLine) {
      setStatus("离线，等待同步");
      return;
    }
    syncing.current = true;
    setStatus("正在同步");
    try {
      let more = true;
      let pages = 0;
      while (more && pages++ < 30) {
        if (active.current !== uid) return;
        const current = await readCache(uid);
        const r = await fetch("/api/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accountId: uid,
            cursor: current.cursor,
            events: eventBatch(current.pending),
          }),
        });
        if (active.current !== uid) return;
        if (r.status === 401 || r.status === 409) {
          try {
            const remembered = JSON.parse(
              localStorage.getItem("kotoba-account") || "null",
            );
            if (remembered?.userId === uid)
              localStorage.removeItem("kotoba-account");
          } catch {
            /* Identity invalidation must work even when storage is blocked. */
          }
          active.current = null;
          setSession(null);
          setCache(EMPTY);
          throw Error(
            "账号已切换或登录已过期，请刷新后重新登录；未同步记录仍保存在原账号的本机缓存。",
          );
        }
        if (!r.ok) {
          const data = (await r.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw Error(data?.error || "同步失败，记录仍保存在本机");
        }
        const data = (await r.json()) as {
          userId: string;
          events: StudyEvent[];
          cursor: number;
          hasMore: boolean;
        };
        if (data.userId !== uid)
          throw Error("同步账号不匹配，已停止合并。请刷新页面。");
        if (active.current !== uid) return;
        const next = await updateCache(uid, (c) =>
          mergeCache(c, data.events, data.cursor),
        );
        if (active.current !== uid) return;
        publishCache(next);
        more = data.hasMore || next.pending.length > 0;
      }
      setStatus(more ? "继续同步中" : "已同步");
      setError("");
    } catch (e) {
      setStatus("等待同步");
      setError(e instanceof Error ? e.message : "同步暂不可用");
    } finally {
      syncing.current = false;
    }
  }, [session, publishCache]);
  useEffect(() => {
    if (!ready || !session) return;
    const t = setTimeout(() => void sync(), 400);
    return () => clearTimeout(t);
  }, [ready, session, cache.pending.length, sync]);
  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState !== "hidden") void sync();
    };
    window.addEventListener("online", onFocus);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    const timer = setInterval(onFocus, 20000);
    return () => {
      window.removeEventListener("online", onFocus);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      clearInterval(timer);
    };
  }, [sync]);
  useEffect(() => {
    if (!session || !("BroadcastChannel" in window)) return;
    const channel = new BroadcastChannel("kotoba:" + session.userId);
    channel.onmessage = () => {
      void readCache(session.userId).then((next) => {
        if (active.current === session.userId) publishCache(next);
      });
    };
    return () => channel.close();
  }, [session, publishCache]);
  const append = useCallback(
    async (
      kind: EventKind,
      entity: string,
      value: unknown,
      base?: string | null,
      resolves?: string[],
    ) => {
      if (!session || active.current !== session.userId)
        throw Error("请先登录，再保存学习记录");
      const event: StudyEvent = {
        id: crypto.randomUUID(),
        kind,
        entity,
        value,
        at: Date.now(),
        ...(base !== undefined ? { base } : {}),
        ...(resolves?.length ? { resolves } : {}),
      };
      if (!eventSchema.safeParse(event).success)
        throw Error("记录格式无效或内容过长，未保存，请缩短后重试");
      const next = await updateCache(session.userId, (c) => ({
        ...c,
        pending: [...c.pending, event],
      }));
      if (active.current === session.userId) publishCache(next);
      if ("BroadcastChannel" in window) {
        const channel = new BroadcastChannel("kotoba:" + session.userId);
        channel.postMessage("change");
        channel.close();
      }
      return event;
    },
    [session, publishCache],
  );
  const importEvents = useCallback(
    async (events: StudyEvent[]) => {
      if (!session || active.current !== session.userId)
        throw Error("请先登录");
      const next = await updateCache(session.userId, (c) => {
        const ids = new Set(
          combineEvents(c.events, c.pending).map((e) => e.id),
        );
        return {
          ...c,
          pending: [...c.pending, ...events.filter((e) => !ids.has(e.id))],
        };
      });
      if (active.current === session.userId) publishCache(next);
    },
    [session, publishCache],
  );
  const model = useMemo(
    () => rebuild(combineEvents(cache.events, cache.pending)),
    [cache],
  );
  async function signout() {
    active.current = null;
    setSession(null);
    setCache(EMPTY);
    try {
      localStorage.removeItem("kotoba-account");
    } catch {}
    location.href = "/signout-with-chatgpt?return_to=%2F";
  }
  return {
    session,
    ready,
    cache,
    model,
    status,
    error,
    sync,
    append,
    importEvents,
    signout,
  };
}
