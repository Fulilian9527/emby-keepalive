const CACHE = "emby-keepalive-v1";
const ASSETS = [
  "/",
  "/index.html",
  "/icons.js",
  "/manifest.json",
  "/logo.png",
  "/emby.png",
  "/senplayer.png",
  "/eplayerx.png",
  "/forward.png",
  "/hills.png",
  "/rodelplayer.png",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // API 请求不缓存，直接走网络
  if (url.pathname.startsWith("/api/")) return;

  // 静态资源：缓存优先，失败回退网络
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request).then((res) => {
        if (res.ok && e.request.method === "GET") {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, clone));
        }
        return res;
      });
    })
  );
});