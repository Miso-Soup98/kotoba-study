const CACHE = "kotoba-shell-v1";
const ASSETS = [
  "/",
  "/data/grammar.json",
  "/manifest.webmanifest",
  "/favicon.svg",
  "/icon-192.png",
  "/icon-512.png",
];
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const response = await fetch("/precache.json", { cache: "no-store" });
      if (!response.ok) throw Error("应用资源清单不可用");
      const files = await response.json();
      const cache = await caches.open(CACHE);
      await cache.addAll([...ASSETS, ...files]);
    })(),
  );
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("kotoba-shell-") && k !== CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (event) => {
  const request = event.request,
    url = new URL(request.url);
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/") ||
    url.pathname.includes("chatgpt") ||
    url.pathname === "/callback"
  )
    return;
  if (request.mode === "navigate" && url.pathname === "/") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (
            response.ok &&
            !response.redirected &&
            response.headers.get("content-type")?.includes("text/html")
          ) {
            const copy = response.clone();
            void caches.open(CACHE).then((c) => c.put("/", copy));
          }
          return response;
        })
        .catch(() => caches.match("/")),
    );
    return;
  }
  if (
    ASSETS.includes(url.pathname) ||
    url.pathname.startsWith("/_next/static/")
  )
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              void caches.open(CACHE).then((c) => c.put(request, copy));
            }
            return response;
          }),
      ),
    );
});
