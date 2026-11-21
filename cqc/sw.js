/* CQC Loop service worker (scope cqc/). Keeps the game's files on the device so a slow or flaky link only costs the
 * first start (and a retry after a dropped download only fetches what is missing).
 *
 *  - Static files (vendor, models, models/lite, sounds, textures, fonts, xbox/): cache first. A cached file is checked
 *    against the server at most every REVAL hours in the background with a conditional request (If-None-Match /
 *    If-Modified-Since: a 304 costs a few hundred bytes); a changed file is stored for the next start.
 *  - The page (index.html, any query) and net-config.json: network first, also conditional (a 304 = the cached copy),
 *    the cached copy when the network fails or has not answered within PAGE_WAIT (the download then goes on in the
 *    background and is kept for next time).
 *  - Only whole, ok (200, same-origin, not ranged) responses are stored: the body is read in full and its length
 *    checked against Content-Length before cache.put, so a cut download is never served.
 *  - BUILD: bump it when this file's logic changes. The old cache's entries are carried into the new one marked
 *    "check now" (cheap 304s), not thrown away, so a bump never re-downloads the game on a slow link.
 *  - ?sw=off on the page unregisters it.
 */
const BUILD = '2026-11-21a';
const CACHE = 'cqc-' + BUILD;
const REVAL = 6 * 3600 * 1000;   // ms between background checks of one file
const PAGE_WAIT = 6000;          // ms the page request waits for the network before the cached page is used
const SCOPE = new URL('./', self.location).href;
const STATIC = /^(vendor|models|sounds|textures|xbox)\//;
const FRESH = /^(index\.html|net-config\.json|)$/;

self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const names = (await caches.keys()).filter((n) => n.startsWith('cqc-') && n !== CACHE);
    if (names.length) {
      const dst = await caches.open(CACHE);
      for (const n of names) {
        const src = await caches.open(n);
        for (const req of await src.keys()) {
          if (await dst.match(req)) continue;
          const r = await src.match(req); if (!r) continue;
          await dst.put(req, stamp(r, 0, await r.blob()));   // carried over, checked against the server on first use
        }
        await caches.delete(n);
      }
    }
    await self.clients.claim();
  })());
});

function keyOf(req) {
  const u = new URL(req.url);
  if (!u.href.startsWith(SCOPE)) return null;
  let rel = u.pathname.slice(new URL(SCOPE).pathname.length);
  if (req.mode === 'navigate' || rel === '' || rel === 'index.html') rel = 'index.html';
  else if (u.search) return null;   // tools / tests with a query: plain network
  if (!FRESH.test(rel) && !STATIC.test(rel)) return null;
  return { rel, url: SCOPE + rel };
}
function stamp(r, t, body) {
  const h = new Headers(r.headers); h.set('x-sw-t', String(t));
  return new Response(body, { status: 200, statusText: r.statusText || 'OK', headers: h });
}
async function readWhole(r) {   // the full body, or a throw when it was cut short
  const b = await r.blob(), len = +(r.headers.get('content-length') || 0);
  if (len && !r.headers.get('content-encoding') && b.size !== len) throw new Error('short body');
  return b;
}
const busy = new Map();   // url -> promise of a store in progress (never two downloads of one file)
async function store(url, r) {
  if (!r || r.status !== 200 || r.type === 'opaque' || r.headers.get('content-range')) return null;
  const b = await readWhole(r);
  const c = await caches.open(CACHE);
  await c.put(url, stamp(r, Date.now(), b));
  return c.match(url);
}
function cond(old) {   // conditional request headers from a cached copy
  const h = {};
  if (old) { const et = old.headers.get('etag'), lm = old.headers.get('last-modified'); if (et) h['If-None-Match'] = et; if (lm) h['If-Modified-Since'] = lm; }
  return h;
}
async function refresh(url, old) {   // conditional fetch; 304 = keep (re-stamped), 200 = store the new copy
  if (busy.has(url)) return busy.get(url);
  const p = (async () => {
    const r = await fetch(url, { headers: cond(old), cache: 'no-store' });
    if (r.status === 304 && old) {
      const c = await caches.open(CACHE); await c.put(url, stamp(old, Date.now(), await old.clone().blob()));
      return c.match(url);
    }
    if (r.ok) return store(url, r);
    return null;
  })().finally(() => busy.delete(url));
  busy.set(url, p);
  return p;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || req.headers.get('range')) return;
  const k = keyOf(req);
  if (!k) return;
  e.respondWith(FRESH.test(k.rel) ? fresh(k.url, e) : cached(k.url, req, e));
});

async function cached(url, req, e) {
  const c = await caches.open(CACHE), hit = await c.match(url);
  if (hit) {
    const t = +(hit.headers.get('x-sw-t') || 0);
    if (Date.now() - t > REVAL) e.waitUntil(refresh(url, hit).catch(() => { /* offline: keep it */ }));
    return hit;
  }
  if (busy.has(url)) { try { await busy.get(url); const r = await c.match(url); if (r) return r; } catch (x) { /* fetch it ourselves */ } }
  const r = await fetch(req);
  if (r.status === 200) {
    const copy = r.clone();
    e.waitUntil(store(url, copy).catch(() => { /* a cut download is not kept */ }));
  }
  return r;
}

async function fresh(url, e) {
  const c = await caches.open(CACHE), old = await c.match(url);
  if (!old) {   // nothing kept yet: stream it straight through (the page shows its loading line while it arrives), keep a copy
    const r = await fetch(url, { cache: 'no-store' });
    if (r.status === 200) e.waitUntil(store(url, r.clone()).catch(() => { /* cut: not kept */ }));
    return r;
  }
  const net = refresh(url, old);
  e.waitUntil(net.catch(() => { /* offline */ }));
  const late = new Promise((res) => setTimeout(() => res(null), PAGE_WAIT));
  try { const r = await Promise.race([net, late]); if (r) return r; } catch (x) { /* offline: the cached copy */ }
  return old;
}

// The page hands over the files its load used (swPrecache): stored in the background, 2 at a time, from the HTTP
// cache when it still has them.
self.addEventListener('message', (e) => {
  const d = e.data;
  if (!d || d.type !== 'precache' || !Array.isArray(d.urls)) return;
  e.waitUntil((async () => {
    const c = await caches.open(CACHE), list = [];
    for (const u of d.urls) { const k = keyOf({ url: u, mode: 'no-cors' }); if (k && !FRESH.test(k.rel) && !(await c.match(k.url))) list.push(k.url); }
    const run = async () => {
      while (list.length) {
        const u = list.shift();
        if (busy.has(u)) continue;
        try { const p = fetch(u, { cache: 'force-cache' }).then((r) => store(u, r)); busy.set(u, p); await p; } catch (x) { /* next time */ } finally { busy.delete(u); }
      }
    };
    await Promise.all([run(), run()]);
    const k = keyOf({ url: SCOPE + 'index.html', mode: 'navigate' });
    if (k && !(await c.match(k.url))) { try { await refresh(k.url, null); } catch (x) { /* next time */ } }
  })());
});
