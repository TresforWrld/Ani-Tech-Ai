/**
 * Ani-Tech AI — Service Worker v3
 * Enables PWA install + offline shell caching
 */

const CACHE  = "anitechai-v3";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.webmanifest"
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  // Pass API calls straight to network
  if (
    url.hostname.includes("groq.com") ||
    url.hostname.includes("jsonbin.io") ||
    url.hostname.includes("googleapis.com") ||
    url.hostname.includes("pollinations.ai") ||
    url.hostname.includes("allorigins.win") ||
    url.hostname.includes("duckduckgo.com")
  ) return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res && res.status === 200 && e.request.method === "GET") {
          caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        }
        return res;
      }).catch(() => caches.match("./index.html"));
    })
  );
});
