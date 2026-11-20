// ---------- Offline support for the installed app (PWA) ----------
// Page files: network first, so every visit gets the newest version, with the
// saved copy as the fallback when there is no connection.
// Sound recordings: saved the first time they play, then served from the device.
const VERSION = 'v58';
const SHELL = 'shell-' + VERSION;
const MEDIA = 'media-v1';
const QURAN = 'quran-v1'; // the Mushaf texts: large and fixed, so kept once fetched
const LIBRARY = 'library-v1'; // hadith chapters, tafsirs and the full books (books/), kept once read
const SAVED = 'saved-v1'; // the parts of books kept whole (js/book-reader.js): never trimmed
const LISTEN = 'listen-v1'; // the station and reciter lists, kept by js/listen.js itself
const OURS = /^(shell|media|quran|library|saved|listen|sounds)-v\d+$/; // every cache name this app uses
const FILES = [
  './', 'index.html', 'en/', 'install.html', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png',
  'js/i18n.js', 'js/lang/en.js', 'js/lang/ur.js', 'js/lang/id.js', 'js/lang/tr.js', 'js/lang/es.js', 'js/lang/surah-names.js', 'js/clock.js', 'js/astro.js', 'js/look.js', 'js/sounds.js', 'js/tasks.js', 'js/views.js',
  'js/notes.js', 'js/cards.js', 'js/adhkar-data.js', 'js/adhkar-i18n.js', 'js/adhkar.js', 'js/habits.js', 'js/focus-plus.js',
  'js/prayer-alerts.js', 'js/report.js', 'js/focus-mode.js', 'js/config.js', 'js/vendor/supabase.js',
  'js/sync-core.js', 'js/sync.js', 'js/native.js', 'js/app.js',
  'js/quran-meta.js', 'js/quran.js', 'js/sunnah-data.js', 'js/sunnah.js', 'js/qibla.js',
  'js/remind-card.js', 'js/library-meta.js', 'js/salah-data.js', 'js/library.js', 'js/book-reader.js',
  'js/extras-data.js', 'js/tools.js', 'js/prayers.js', 'js/listen.js', 'js/settings.js', 'js/device.js', 'js/today.js', 'js/nav.js', 'js/hifz.js', 'js/khatma.js', 'js/challenge.js', 'js/a11y.js', 'js/clock-core.js', 'js/reminders-core.js', 'js/reminders.js',
  'js/tajweed-core.js', 'js/tajweed-rules.js', 'js/mushaf-core.js', 'js/mushaf-book.js', 'js/library-books.js', 'js/library-local.js', 'js/shamela.js',
  'js/wmm-data.js', 'js/compass-core.js', 'js/today-core.js', 'js/vendor/page-flip.browser.js', 'js/flipbook.js',
  'fonts/AmiriQuran-400-arabic.woff2',
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
  'fonts/fonts.css', 'fonts/extra.css'
];

self.addEventListener('install', (ev) => {
  ev.waitUntil(caches.open(SHELL).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (ev) => {
  ev.waitUntil((async () => {
    // Only this app's own old caches go. Other sites on micro4tricks-ai.github.io share this
    // origin's cache storage (e.g. learn-n8n-english's site-*), so their caches are left alone.
    const KEEP = [SHELL, MEDIA, QURAN, LIBRARY, SAVED, LISTEN, 'sounds-v1']; // sounds-v1: js/sounds.js
    for (const k of await caches.keys()) if (OURS.test(k) && !KEEP.includes(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

// Recitations from cdn.islamic.network and mp3quran.net stream; they are too many to keep.
const isMedia = (url) => (/\.(mp3|wav|ogg|m4a)$/i.test(url.pathname) && url.hostname !== 'cdn.islamic.network' && !/mp3quran\.net$/.test(url.hostname)) || url.hostname === 'fonts.gstatic.com';
const isFontCss = (url) => url.hostname === 'fonts.googleapis.com';
// Hadith books and tafsirs never change once published.
// hadith-json comes from GitHub itself: jsDelivr stopped serving it (the repository passed its 50 MB limit).
const isLibrary = (url) => (url.hostname === 'raw.githubusercontent.com' && url.pathname.startsWith('/AhmedBaset/hadith-json/'))
  || (url.hostname === 'cdn.jsdelivr.net' && /\/gh\/(fawazahmed0\/hadith-api|spa5k\/tafsir_api|AhmedBaset\/hadith-json)@/.test(url.pathname))
  || (url.hostname === 'api.alquran.cloud' && /^\/v1\/(ayah|surah)\//.test(url.pathname))
  || (url.hostname === 'api.quran.com' && url.pathname.startsWith('/api/v4/verses/'));

self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (isMedia(url)) { ev.respondWith(media(req)); return; }
  if (isFontCss(url)) { ev.respondWith(networkFirst(req, MEDIA)); return; }
  if (isLibrary(url)) { ev.respondWith(cacheFirst(req, LIBRARY)); return; }
  if (url.origin !== location.origin) return; // time servers, Supabase, CDNs: straight to the network
  if (url.pathname.endsWith('.apk')) return; // the Android app download is never kept offline
  if (/\/quran\/[a-z]+\.json$/.test(url.pathname)) { ev.respondWith(cacheFirst(req, QURAN)); return; }
  // Translated Mushafs (js/flipbook.js): covers kept once seen; pages straight from the network
  // (a book kept for offline reading has its own cache, flipbook-v1, read by the page itself).
  if (/\/mushafs\/[^/]+\/p\d+\.webp$/.test(url.pathname)) return;
  if (/\/mushafs\/[^/]+\/cover\.webp$/.test(url.pathname)) { ev.respondWith(cacheFirst(req, LIBRARY)); return; }
  if (/\/books\/.+\.json\.gz$/.test(url.pathname)) { ev.respondWith(cacheFirst(req, LIBRARY)); return; } // the books never change once built
  ev.respondWith(networkFirst(req, SHELL));
});

// Browsing copies only: a book kept whole also sits in SAVED, which is never trimmed.
const LIBRARY_MAX = 3000;
async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req) || (cacheName === LIBRARY && await (await caches.open(SAVED)).match(req));
  if (hit) return hit;
  const res = await fetch(req);
  // Whole answers only: never an opaque one, a partial (206) or an error page.
  if (res.status === 200) {
    await cache.put(req, res.clone());
    if (cacheName === LIBRARY) {
      const keys = await cache.keys();
      for (const k of keys.slice(0, Math.max(0, keys.length - LIBRARY_MAX))) await cache.delete(k);
    }
  }
  return res;
}
// The network, unless it takes over 4 s and a saved copy exists: then the copy, while the
// download still goes on and refreshes it for next time.
async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const key = stripSearch(req);
  const saved = () => cache.match(key).then(async (hit) => hit
    || (req.mode === 'navigate' && (/\/en\//.test(new URL(req.url).pathname) && await cache.match('./en/') || cache.match('./'))));
  const net = fetch(req).then((res) => {
    if (res.ok && res.type !== 'opaque') cache.put(key, res.clone());
    return res;
  });
  const slow = new Promise((resolve) => setTimeout(resolve, 4000)).then(saved).then((hit) => hit || net);
  try {
    return await Promise.race([net, slow]);
  } catch (e) {
    const hit = await saved();
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
