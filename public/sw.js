/**
 * WHY THIS FILE EXISTS
 * --------------------
 * NES Tetris has ZERO runtime network calls — the board is code-drawn on a canvas and every sound is
 * synthesised with the Web Audio API, so once the page loads it already runs offline. This service
 * worker adds the missing piece — INSTALLABILITY: it caches the app shell (the HTML + the hashed JS
 * bundle + the icons) so the game launches with NO network. "Add to Home Screen" then opens it
 * offline and chromeless/fullscreen on iOS. Strategy: cache-first with runtime population — the first
 * online visit caches what it fetches; every later visit serves from the cache and works fully
 * offline. No tracking, no accounts, no server.
 *
 * It deliberately does NOT skipWaiting()/claim(), so it never takes over the page that's already open
 * — it controls the NEXT load (e.g. the home-screen launch), which keeps it inert to the current
 * session (and any headless verification). Relative scope ('./') so it works at '/' and under any
 * deploy sub-path.
 */
/* global self, caches, fetch, Response, URL */
const CACHE = 'nes-tetris-v1';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

// Precache the app shell AND the hashed JS/CSS bundle Vite injected into index.html. The bundle's
// filename carries a content hash we can't hard-code here, so we read index.html at install time and
// extract its asset URLs. Caching the bundle during install (not lazily on first SW-controlled fetch)
// is what makes the VERY FIRST offline launch work — e.g. "Add to Home Screen", then open with no
// network — without needing a prior controlled visit.
async function precache() {
  const c = await caches.open(CACHE);
  await Promise.allSettled(SHELL.map((u) => c.add(u)));
  try {
    const html = await (await fetch('./index.html', { cache: 'no-cache' })).text();
    const assets = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css)(?:\?[^"]*)?)"/g)].map(
      (m) => new URL(m[1], self.registration.scope).href,
    );
    await Promise.allSettled(assets.map((u) => c.add(u)));
  } catch {
    // Offline or unparseable HTML at install: the shell is still cached; the bundle falls back to
    // runtime caching on the next controlled fetch.
  }
}

self.addEventListener('install', (e) => {
  e.waitUntil(precache());
});

self.addEventListener('activate', (e) => {
  // Drop caches from older versions when CACHE is bumped.
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req)
          .then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
            return res;
          })
          // Offline + uncached: serve the shell for a navigation, else a clean network error.
          .catch(() => (req.mode === 'navigate' ? caches.match('./index.html') : Response.error())),
    ),
  );
});
