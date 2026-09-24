import type { Session } from "./types";

type IdentityStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function identity(value: unknown): Session | null {
  if (value === null) return null;
  if (
    typeof value === "object" &&
    value !== null &&
    "userId" in value &&
    typeof value.userId === "string" &&
    value.userId &&
    "displayName" in value &&
    typeof value.displayName === "string"
  )
    return { userId: value.userId, displayName: value.displayName };
  throw Error("登录状态无效");
}

export async function resolveSession(
  remote: () => Promise<unknown>,
  storage: IdentityStore,
) {
  let user: Session | null;
  try {
    user = identity(await remote());
  } catch {
    let remembered: Session | null = null;
    try {
      remembered = identity(
        JSON.parse(storage.getItem("kotoba-account") || "null"),
      );
    } catch {}
    return { user: remembered, offline: true, storageFailed: false };
  }
  // A failed offline-cache write must never replace a verified online identity.
  let storageFailed = false;
  try {
    if (user) storage.setItem("kotoba-account", JSON.stringify(user));
    else storage.removeItem("kotoba-account");
  } catch {
    storageFailed = true;
  }
  return { user, offline: false, storageFailed };
}

export async function fetchJSON<T>(
  url: string,
  timeoutMs = 12000,
  signal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) cancel();
  else signal?.addEventListener("abort", cancel, { once: true });
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) throw Error(`请求失败 (${response.status})`);
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", cancel);
  }
}
