/**
 * Ani-Tech AI — Service Worker v5
 * Enables PWA install + offline shell caching
 *
 * v5 fix: app shell (html/css/js) now uses NETWORK-FIRST instead of
 * cache-first. Cache-first was serving a stale app.js forever, which is
 * why key/code updates didn't take effect even after redeploying.
 * Cache name bumped to v5 so every existing installed copy of this SW
 * purges its old (stale) cache on activate.
 */
const CACHE  = "anitechai-v5";
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

  // Pass API calls straight to network — never cache/intercept these
  if (
    url.hostname.includes("groq.com") ||
    url.hostname.includes("x.ai") ||
    url.hostname.includes("jsonbin.io") ||
    url.hostname.includes("googleapis.com") ||
    url.hostname.includes("pollinations.ai") ||
    url.hostname.includes("allorigins.win") ||
    url.hostname.includes("duckduckgo.com")
  ) return;

  if (e.request.method !== "GET") return;

  // Network-first for the app shell: always try to get the latest
  // index.html/app.js/style.css first. Only fall back to cache if the
  // network is unavailable (offline). This means deployed code changes
  // show up on next reload instead of being stuck behind an old cache.
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(e.request).then(cached => cached || caches.match("./index.html"))
      )
  );
});
