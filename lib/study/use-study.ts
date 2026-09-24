"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Cache, EventKind, Session, StudyEvent } from "./types";
import { readCache, updateCache } from "./storage";
import { combineEvents, mergeCache, rebuild, eventBatch } from "./model";
const EMPTY: Cache = { events: [], pending: [], cursor: 0 };
export function useStudy() {
  const [session, setSession] = useState<Session | null>(null);
  const [cache, setCache] = useState<Cache>(EMPTY);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState("连接中");
  const [error, setError] = useState("");
  const syncing = useRef(false);
  const active = useRef<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    async function boot() {
      let user: Session | null = null;
      try {
        const r = await fetch("/api/session", { cache: "no-store" });
        if (!r.ok) throw Error();
        user = await r.json();
        if (user) localStorage.setItem("kotoba-account", JSON.stringify(user));
        else localStorage.removeItem("kotoba-account");
      } catch {
        try {
          user = JSON.parse(localStorage.getItem("kotoba-account") || "null");
        } catch {}
        setStatus("离线，等待同步");
      }
      if (cancelled) return;
      active.current = user?.userId ?? null;
      setSession(user);
      if (user) {
        try {
          const c = await readCache(user.userId);
          if (!cancelled && active.current === user.userId) setCache(c);
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
  }, []);
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
          const remembered = JSON.parse(
            localStorage.getItem("kotoba-account") || "null",
          );
          if (remembered?.userId === uid)
            localStorage.removeItem("kotoba-account");
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
        setCache(next);
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
  }, [session]);
  useEffect(() => {
    if (!ready || !session) return;
    const t = setTimeout(() => void sync(), 400);
    return () => clearTimeout(t);
  }, [ready, session, cache.pending.length, sync]);
  useEffect(() => {
    const onFocus = () => void sync();
    window.addEventListener("online", onFocus);
    window.addEventListener("focus", onFocus);
    const timer = setInterval(onFocus, 20000);
    return () => {
      window.removeEventListener("online", onFocus);
      window.removeEventListener("focus", onFocus);
      clearInterval(timer);
    };
  }, [sync]);
  useEffect(() => {
    if (!session || !("BroadcastChannel" in window)) return;
    const channel = new BroadcastChannel("kotoba:" + session.userId);
    channel.onmessage = () => {
      void readCache(session.userId).then((next) => {
        if (active.current === session.userId) setCache(next);
      });
    };
    return () => channel.close();
  }, [session]);
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
      const next = await updateCache(session.userId, (c) => ({
        ...c,
        pending: [...c.pending, event],
      }));
      if (active.current === session.userId) setCache(next);
      if ("BroadcastChannel" in window) {
        const channel = new BroadcastChannel("kotoba:" + session.userId);
        channel.postMessage("change");
        channel.close();
      }
      return event;
    },
    [session],
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
      if (active.current === session.userId) setCache(next);
    },
    [session],
  );
  const model = useMemo(
    () => rebuild(combineEvents(cache.events, cache.pending)),
    [cache],
  );
  async function signout() {
    active.current = null;
    setSession(null);
    setCache(EMPTY);
    localStorage.removeItem("kotoba-account");
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
