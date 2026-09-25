// ---------- Offline support for the installed app (PWA) ----------
// Page files: network first, so every visit gets the newest version, with the
// saved copy as the fallback when there is no connection.
// Sound recordings: saved the first time they play, then served from the device.
const VERSION = 'v2';
const SHELL = 'shell-' + VERSION;
const MEDIA = 'media-v1';
const FILES = [
  './', 'index.html', 'install.html', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png',
  'js/i18n.js', 'js/clock.js', 'js/astro.js', 'js/look.js', 'js/sounds.js', 'js/tasks.js', 'js/views.js',
  'js/notes.js', 'js/cards.js', 'js/adhkar-data.js', 'js/adhkar.js', 'js/habits.js', 'js/focus-plus.js',
  'js/prayer-alerts.js', 'js/report.js', 'js/focus-mode.js', 'js/config.js', 'js/vendor/supabase.js',
  'js/sync-core.js', 'js/sync.js', 'js/native.js', 'js/app.js',
  'fonts/Amiri-400-arabic.woff2',
  'fonts/Amiri-400-latin-ext.woff2',
  'fonts/Amiri-400-latin.woff2',
  'fonts/Amiri-700-arabic.woff2',
  'fonts/Amiri-700-latin-ext.woff2',
  'fonts/Amiri-700-latin.woff2',
  'fonts/IBMPlexSansArabic-400-arabic.woff2',
  'fonts/IBMPlexSansArabic-400-latin-ext.woff2',
  'fonts/IBMPlexSansArabic-400-latin.woff2',
  'fonts/IBMPlexSansArabic-500-arabic.woff2',
  'fonts/IBMPlexSansArabic-500-latin-ext.woff2',
  'fonts/IBMPlexSansArabic-500-latin.woff2',
  'fonts/IBMPlexSansArabic-600-arabic.woff2',
  'fonts/IBMPlexSansArabic-600-latin-ext.woff2',
  'fonts/IBMPlexSansArabic-600-latin.woff2',
  'fonts/IBMPlexSansArabic-700-arabic.woff2',
  'fonts/IBMPlexSansArabic-700-latin-ext.woff2',
  'fonts/IBMPlexSansArabic-700-latin.woff2',
  'fonts/fonts.css'
];

self.addEventListener('install', (ev) => {
  ev.waitUntil(caches.open(SHELL).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (ev) => {
  ev.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== SHELL && k !== MEDIA) await caches.delete(k);
    await self.clients.claim();
  })());
});

const isMedia = (url) => /\.(mp3|wav|ogg|m4a)$/i.test(url.pathname) || url.hostname === 'fonts.gstatic.com';
const isFontCss = (url) => url.hostname === 'fonts.googleapis.com';

self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (isMedia(url)) { ev.respondWith(media(req)); return; }
  if (isFontCss(url)) { ev.respondWith(networkFirst(req, MEDIA)); return; }
  if (url.origin !== location.origin) return; // time servers, Supabase, CDNs: straight to the network
  ev.respondWith(networkFirst(req, SHELL));
});

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok && res.type !== 'opaque') cache.put(stripSearch(req), res.clone());
    return res;
  } catch (e) {
    const hit = await cache.match(stripSearch(req)) || (req.mode === 'navigate' && await cache.match('./'));
    if (hit) return hit;
    throw e;
  }
}
// "?lang=en" and the like open the same page, so they share one saved copy.
function stripSearch(req) {
  const url = new URL(req.url);
  if (url.origin !== location.origin || !url.search) return req;
  url.search = '';
  return new Request(url.href);
}

// Recordings: the <audio> element asks for byte ranges, Web Audio for the whole file.
// Whole files are saved; ranges are cut from a saved file when there is one.
async function media(req) {
  const cache = await caches.open(MEDIA);
  const key = req.url;
  const range = req.headers.get('range');
  const hit = await cache.match(key);
  if (hit) return range ? slice(hit, range) : hit;
  if (range) return fetch(req);
  const res = await fetch(req);
  if (res.ok && res.status === 200) cache.put(key, res.clone());
  return res;
}
async function slice(res, range) {
  const blob = await res.blob();
  const m = /bytes=(\d*)-(\d*)/.exec(range) || [];
  const size = blob.size;
  let start = m[1] ? Number(m[1]) : 0;
  let end = m[2] ? Number(m[2]) : size - 1;
  if (!m[1] && m[2]) { start = Math.max(0, size - Number(m[2])); end = size - 1; }
  end = Math.min(end, size - 1);
  if (start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  return new Response(blob.slice(start, end + 1), {
    status: 206,
    headers: {
      'Content-Type': res.headers.get('Content-Type') || 'audio/mpeg',
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes'
    }
  });
}
