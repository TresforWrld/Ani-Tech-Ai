/**
 * Ani-Tech AI — Service Worker
 * Enables PWA install + basic offline shell caching
 */

const CACHE   = "anitechai-v2";
const ASSETS  = ["/", "/index.html", "/style.css", "/app.js", "/manifest.json"];

// Install: cache shell assets
self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

// Activate: clear old caches
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: cache-first for shell, network-first for API calls
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);

  // Always go network for API calls
  if (url.hostname.includes("groq.com") || url.hostname.includes("jsonbin.io") || url.hostname.includes("googleapis")) {
    return; // let browser handle natively
  }

  // Cache-first for app shell
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res && res.status === 200 && e.request.method === "GET") {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => caches.match("/index.html"));
    })
  );
});
