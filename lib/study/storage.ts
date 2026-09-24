import type { Cache } from "./types";
const empty = (): Cache => ({ events: [], pending: [], cursor: 0 });
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open("kotoba-study-v1", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("accounts");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export async function updateCache(
  userId: string,
  update: (current: Cache) => Cache,
): Promise<Cache> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("accounts", "readwrite");
    const store = tx.objectStore("accounts");
    const r = store.get(userId);
    let next: Cache;
    r.onsuccess = () => {
      try {
        next = update(r.result ?? empty());
        store.put(next, userId);
      } catch (error) {
        tx.abort();
        reject(error);
      }
    };
    tx.oncomplete = () => {
      db.close();
      resolve(next);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error ?? new Error("存储已取消"));
    };
  });
}
export async function readCache(userId: string): Promise<Cache> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const r = db.transaction("accounts").objectStore("accounts").get(userId);
    r.onsuccess = () => {
      db.close();
      resolve(r.result ?? empty());
    };
    r.onerror = () => {
      db.close();
      reject(r.error);
    };
  });
}
