/* SAMVAAD service worker.
 *
 * What it caches (and nothing else):
 *   1. the PUBLIC field-mode shell (/field): an HTML page with no user data in it (records live in IndexedDB, not in HTML),
 *   2. immutable, content-hashed static files under /_next/static/ and /icons/,
 *   3. a tiny static offline page.
 * What it never caches or touches: /api/* (every API call, including authenticated ones), React Server Component requests,
 * non-GET requests, other origins, and every authenticated page (dashboard, visits, reports, ...). Those always go to the
 * network; when offline they show the offline page, which links to field mode.
 *
 * Updates: a new worker waits until the app asks it to take over (SKIP_WAITING after the user chooses "Update"), so an update
 * never reloads the page in the middle of someone's work. Local records are in IndexedDB and are not touched by updates.
 */
const VERSION = "v1";
const STATIC_CACHE = `samvaad-static-${VERSION}`;
const SHELL_CACHE = `samvaad-shell-${VERSION}`;
const SHELL_URL = "/field";
const OFFLINE_URL = "/offline.html";
const SHELL_TIMEOUT_MS = 4000;

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const shell = await caches.open(SHELL_CACHE);
    try {
      const res = await fetch(SHELL_URL, { cache: "reload", credentials: "omit" });
      if (res.ok && !res.redirected && res.type === "basic") await shell.put(SHELL_URL, res);
    } catch { /* installed while offline: the shell is cached the next time the page loads online */ }
    const stat = await caches.open(STATIC_CACHE);
    await Promise.all([OFFLINE_URL, "/icons/icon-192.png"].map((u) => stat.add(u).catch(() => undefined)));
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keep = new Set([STATIC_CACHE, SHELL_CACHE]);
    for (const k of await caches.keys()) if (k.startsWith("samvaad-") && !keep.has(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "SKIP_WAITING") { self.skipWaiting(); return; }
  if (data.type === "CACHE_URLS" && Array.isArray(data.urls)) {
    event.waitUntil((async () => {
      const stat = await caches.open(STATIC_CACHE);
      const shell = await caches.open(SHELL_CACHE);
      for (const raw of data.urls.slice(0, 200)) {
        try {
          const u = new URL(raw, self.location.origin);
          if (u.origin !== self.location.origin) continue;
          if (u.pathname.startsWith("/_next/static/")) { if (!(await stat.match(u.pathname + u.search))) await stat.add(u.pathname + u.search); }
          else if (u.pathname === SHELL_URL) { const res = await fetch(SHELL_URL, { credentials: "omit" }); if (res.ok && !res.redirected) await shell.put(SHELL_URL, res); }
        } catch { /* skip files that cannot be fetched right now */ }
      }
    })());
  }
});

async function cacheFirst(req) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && res.type === "basic") cache.put(req, res.clone());
  return res;
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

async function offlinePage() {
  return (await caches.match(OFFLINE_URL)) || new Response("Offline. Open /field when you are back online.", { status: 503, headers: { "content-type": "text/plain" } });
}

async function shellNetworkFirst(req) {
  const shell = await caches.open(SHELL_CACHE);
  try {
    const res = await withTimeout(fetch(req), SHELL_TIMEOUT_MS);
    if (res.ok && !res.redirected && res.type === "basic") shell.put(SHELL_URL, res.clone());
    return res;
  } catch {
    return (await shell.match(SHELL_URL)) || offlinePage();
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // never cached
  if (req.headers.get("RSC") || url.searchParams.has("_rsc")) return; // server-component payloads are never cached
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(cacheFirst(req));
    return;
  }
  if (req.mode === "navigate") {
    if (url.pathname === SHELL_URL || url.pathname.startsWith(SHELL_URL + "/")) event.respondWith(shellNetworkFirst(req));
    else event.respondWith(fetch(req).catch(() => offlinePage()));
  }
});
