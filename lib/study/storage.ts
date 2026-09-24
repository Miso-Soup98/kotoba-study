import type { Cache } from "./types";
const empty = (): Cache => ({ events: [], pending: [], cursor: 0 });
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open("kotoba-study-v1", 1);
    let expired = false;
    const fail = (error: unknown) => {
      expired = true;
      clearTimeout(timer);
      reject(error);
    };
    const timer = setTimeout(() => fail(new Error("本机存储响应超时")), 8000);
    r.onupgradeneeded = () => r.result.createObjectStore("accounts");
    r.onsuccess = () => {
      clearTimeout(timer);
      if (expired) r.result.close();
      else resolve(r.result);
    };
    r.onerror = () => fail(r.error);
    r.onblocked = () =>
      fail(new Error("本机存储被其他标签页占用，请关闭旧标签后重试"));
  });
}
export async function updateCache(
  userId: string,
  update: (current: Cache) => Cache,
): Promise<Cache> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("accounts", "readwrite");
    const timer = setTimeout(() => tx.abort(), 8000);
    const store = tx.objectStore("accounts");
    const r = store.get(userId);
    let next: Cache;
    r.onsuccess = () => {
      try {
        const current = r.result ?? empty();
        next = update(current);
        if (next !== current) store.put(next, userId);
      } catch (error) {
        tx.abort();
        reject(error);
      }
    };
    tx.oncomplete = () => {
      clearTimeout(timer);
      db.close();
      resolve(next);
    };
    tx.onerror = () => {
      clearTimeout(timer);
      db.close();
      reject(tx.error);
    };
    tx.onabort = () => {
      clearTimeout(timer);
      db.close();
      reject(tx.error ?? new Error("存储已取消"));
    };
  });
}
export async function readCache(userId: string): Promise<Cache> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("accounts");
    const r = tx.objectStore("accounts").get(userId);
    const timer = setTimeout(() => tx.abort(), 8000);
    tx.onabort = () => {
      clearTimeout(timer);
      db.close();
      reject(tx.error ?? new Error("读取本机记录已超时或取消"));
    };
    r.onsuccess = () => {
      clearTimeout(timer);
      db.close();
      resolve(r.result ?? empty());
    };
    r.onerror = () => {
      clearTimeout(timer);
      db.close();
      reject(r.error);
    };
  });
}
