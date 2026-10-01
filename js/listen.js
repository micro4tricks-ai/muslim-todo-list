// ---------- Listen: Quran radio, live TV, whole-surah recitations and audio tafsir ----------
// The lists come from the open API of mp3quran.net on every visit (so their fixes arrive by
// themselves) and are kept on the device for when there is no connection. live.json on the
// website adds the TV channels and backup links, so a dead link is fixed there without an app
// update. One player bar serves the audio and keeps playing while other tabs are open.
(() => {
  'use strict';
  const { T, I, $, el, button, load, store, toast } = window.noonUI;
  const M = window.NOON_QURAN_META;
  const API = 'https://www.mp3quran.net/api/v3/';
  const KEY = 'noon-sweep-listen';
  const root = $('view-listen');
  let S = Object.assign({ tab: 'radio', cat: 'all', riwaya: 0, fav: [], favRec: [], last: null }, load(KEY, {}));
  const save = () => { S.updatedAt = Date.now(); store(KEY, S); };
  const pad3 = (n) => String(n).padStart(3, '0');
  const surahName = (k) => (I.isEn ? M.surahs[k][1] : M.surahs[k][0].replace(/^سُورَةُ\s*/, ''));
  const norm = (s) => String(s).toLowerCase().replace(/[ؐ-ًؚ-ٰٟۖ-ۭـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/\s+/g, ' ').trim();
  const clean = (s) => String(s || '').replace(/^[\s*\-–—]+|[\s*\-–—]+$/g, '').replace(/\s+/g, ' ');

  // Constant icons only.
  const ICONS = {
    play: '<path d="M8 5.5v13l11-6.5z" fill="currentColor"/>',
    pause: '<path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor"/>',
    next: '<path d="M6 6v12l8.5-6zM16 6h2.2v12H16z" fill="currentColor"/>',
    prev: '<path d="M18 6v12l-8.5-6zM8 6H5.8v12H8z" fill="currentColor"/>',
    close: '<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    moon: '<path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
    star: '<path d="M12 3.8l2.5 5.2 5.7.7-4.2 3.9 1.1 5.6-5.1-2.8-5.1 2.8 1.1-5.6-4.2-3.9 5.7-.7z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>',
    radio: '<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3.5" y="9" width="17" height="11" rx="2.5"/><path d="M7 9l9-5"/><circle cx="15.5" cy="14.5" r="2.5"/><path d="M7 13h3M7 16h3"/></g>'
  };
  function icon(name, cls) {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true');
    if (cls) s.setAttribute('class', cls);
    s.innerHTML = ICONS[name];
    return s;
  }
  function iconBtn(name, label, onClick, cls) {
    const b = button(`ls-ib${cls ? ' ' + cls : ''}`, '', onClick, T(label));
    b.title = T(label);
    b.append(icon(name));
    return b;
  }

  // ================= data =================
  const got = new Map();
  function api(path, lang) {
    const url = `${API}${path}${path.includes('?') ? '&' : '?'}language=${lang || (I.isEn ? 'eng' : 'ar')}`;
    if (!got.has(url)) {
      const p = kept(url);
      p.catch(() => got.delete(url));
      got.set(url, p);
    }
    return got.get(url);
  }
  // Network first; the last good copy when offline.
  async function kept(url) {
    let box = null;
    try { box = await caches.open('listen-v1'); } catch (_) { /* no Cache API here */ }
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(r.status);
      if (box) box.put(url, r.clone()).catch(() => {});
      return await r.json();
    } catch (e) {
      const hit = box && await box.match(url);
      if (hit) return hit.json();
      throw e;
    }
  }

  // live.json from the website, or the copy built in here when it can't be reached.
  const SITE = 'https://micro4tricks-ai.github.io/muslim-todo-list/';
  const BUILT_IN = {
    tv: [
      { id: 'quran', ar: 'قناة القرآن الكريم — من المسجد الحرام', en: 'Quran TV — live from al-Masjid al-Haram',
        urls: ['https://cdn-globecast.akamaized.net/live/eds/saudi_quran/hls_roku/index.m3u8'], youtube: { video: 'eC4LfEVxvKg' } },
      { id: 'sunnah', ar: 'قناة السنة النبوية — من المسجد النبوي', en: 'Sunnah TV — live from the Prophet\'s Mosque',
        urls: ['https://cdn-globecast.akamaized.net/live/eds/saudi_sunnah/hls_roku/index.m3u8'], youtube: { video: 'Rs7St51oDDc' } }
    ],
    radios: []
  };
  let liveP = null;
  const liveCfg = () => liveP || (liveP = kept(`${SITE}live.json`).then((d) => (d && Array.isArray(d.tv) ? d : BUILT_IN)).catch(() => BUILT_IN));

  // Stations: the reciters' own, then mixed and adhkar, lessons and tafsir, and translations.
  const slug = (u) => (String(u).match(/\/radio\/([^/?#]+)/) || [])[1] || '';
  const TOPICS = /^(tafseer|mukhtasartafsir|tabri|gareeb-quran|fatwa|sahabah|fi_zilal_alsiyra|almukhtasar_fi_alsiyra|alaikhtiarat_alfiqhayh_bin_baz|saheh-muslim|saheh-bokharee|alanbiya|riyad|shmaeel|ramadan)$/i;
  const MIXED = /^(mix|salma|eid|roqiah|albaqarah|tarateel|sakeenah|athkar_sabah|athkar_masa|surah_al-mulk)$/i;
  const STYLE = [[/mojawwad/i, 'مجوّد'], [/warsh/i, 'رواية ورش'], [/qalon/i, 'رواية قالون'], [/assosi/i, 'رواية السوسي'],
    [/dora?i/i, 'رواية الدوري'], [/_khalaf$/i, 'رواية خلف'], [/albizi/i, 'رواية البزي'], [/thakwan/i, 'رواية ابن ذكوان'], [/asbahani/i, 'رواية الأصبهاني']];
  function kindOf(u) {
    const s = slug(u);
    if (!s) return 'live';
    if (/^translation_quran/i.test(s)) return 'trans';
    if (TOPICS.test(s)) return 'topics';
    if (MIXED.test(s)) return 'mixed';
    return 'reciters';
  }
  // The API names backup.qurango.net, which is often down (HTTP 500) while qurango.net plays:
  // try the main server first and keep the other as the fallback.
  const hosts = (u) => { const m = String(u).replace('//backup.qurango.net/', '//qurango.net/'); return m === u ? [u] : [m, u]; };
  async function radios() {
    const [d, cfg] = await Promise.all([api('radios'), liveCfg()]);
    const extra = (cfg.radios || []).map((r) => ({ id: r.id, name: I.isEn ? r.en : r.ar, note: '', urls: r.urls, kind: 'live' }));
    return extra.concat(d.radios.map((r) => {
      const style = STYLE.find(([re]) => re.test(slug(r.url)));
      return { id: r.id, name: clean(r.name).replace(/^Radio\s+/i, ''), note: style ? T(style[1]) : '', urls: hosts(r.url), kind: kindOf(r.url) };
    }));
  }
  async function reciters() {
    const d = await api('reciters');
    return d.reciters.map((r) => ({
      id: r.id, name: clean(r.name),
      moshaf: r.moshaf.map((m) => ({ id: m.id, name: [...new Set(clean(m.name).split(/\s+-\s+/))].join(' - '), riwaya: m.rewaya_id, server: m.server,
        list: String(m.surah_list).split(',').map(Number).filter((n) => n >= 1 && n <= 114) }))
    })).filter((r) => r.moshaf.length);
  }
  const riwayat = async () => (await api('riwayat')).riwayat;
  // The audio tafsir (a summary of at-Tabari), in parts of a surah; Arabic only.
  async function tafsir() {
    const d = await api('tafsir?tafsir=1', 'ar');
    return d.tafasir.soar.map((x) => {
      const m = String(x.url).match(/(\d{3})(?:-(\d+)-(\d+))?\.mp3$/) || [];
      return { id: x.id, s: x.sura_id - 1, from: Number(m[2]) || 0, to: Number(m[3]) || 0, url: x.url };
    }).filter((x) => x.s >= 0 && x.s < 114);
  }
  const partName = (x) => (x.from ? `${surahName(x.s)}: ${T('الآيات')} ${I.num(x.from)}–${I.num(x.to)}` : surahName(x.s));

  // ================= the player =================
  const audio = new Audio();
  audio.preload = 'none';
  let Q = [], at = -1, state = 'off'; // off | loading | playing | paused
  let paused4adhan = false;

  const bar = el('div', 'lp');
  bar.hidden = true;
  bar.setAttribute('role', 'region');
  bar.setAttribute('aria-label', T('مشغّل الاستماع'));
  bar.dir = I.isEn ? 'ltr' : 'rtl';
  const eq = el('span', 'lp-eq'); eq.append(el('i'), el('i'), el('i'));
  const tt = el('div', 'lp-text');
  const tTitle = el('b', 'lp-title'), tSub = el('span', 'lp-sub');
  tt.append(tTitle, tSub);
  tt.addEventListener('click', () => window.noonUI.go('listen'));
  const bPrev = iconBtn(I.isEn ? 'prev' : 'next', 'السابق', () => step(-1));
  const bPlay = iconBtn('play', 'تشغيل', () => toggle(), 'lp-main');
  const bNext = iconBtn(I.isEn ? 'next' : 'prev', 'التالي', () => step(1));
  const bSleep = iconBtn('moon', 'مؤقت النوم', () => cycleSleep(), 'lp-sleep');
  const sleepLbl = el('small', 'lp-sleep-min');
  bSleep.append(sleepLbl);
  const bClose = iconBtn('close', 'إيقاف وإغلاق', () => stop(true));
  const prog = el('div', 'lp-prog'); const progIn = el('span'); prog.append(progIn);
  bar.append(prog, eq, tt, bPrev, bPlay, bNext, bSleep, bClose);
  document.body.append(bar);

  function paint() {
    const it = Q[at];
    bar.hidden = !it || state === 'off';
    document.body.classList.toggle('lp-on', !bar.hidden);
    root.querySelectorAll('.ls-continue').forEach((n) => { n.hidden = state !== 'off'; });
    root.classList.toggle('ls-playing', state === 'playing');
    if (!it) return;
    bar.dataset.state = state;
    bar.classList.toggle('is-live', !!it.live);
    tTitle.textContent = it.title;
    tSub.textContent = state === 'loading' ? T('جارٍ التحميل…') : it.sub;
    bPlay.replaceChildren(icon(state === 'playing' || state === 'loading' ? 'pause' : 'play'));
    bPlay.setAttribute('aria-label', T(state === 'playing' ? 'إيقاف مؤقت' : 'تشغيل'));
    bPrev.hidden = bNext.hidden = Q.length < 2;
    root.querySelectorAll('[data-play]').forEach((n) => n.classList.toggle('is-on', n.dataset.play === it.key));
  }

  function start(queue, i, pos) {
    Q = queue; at = i;
    const it = Q[at];
    it.tried = 0;
    audio.src = it.urls[0];
    if (pos) audio.addEventListener('loadedmetadata', () => { if (audio.src === it.urls[it.tried]) try { audio.currentTime = pos; } catch (_) {} }, { once: true });
    state = 'loading'; paint();
    tryPlay();
    // Other players (the Mushaf, the focus sounds) fall quiet.
    window.dispatchEvent(new CustomEvent('noon-recitation', { detail: { from: 'listen' } }));
    S.last = Object.assign({ pos: pos || 0, title: it.title, sub: it.sub }, it.last);
    save();
    session(it);
  }
  // A broken source reports through the 'error' event; here only a play the browser refused.
  const tryPlay = () => audio.play().catch((e) => { if (e && e.name === 'NotAllowedError') { state = 'paused'; paint(); } });
  function failed() {
    const it = Q[at];
    state = 'paused'; paint();
    toast(T(it && it.live ? 'تعذّر تشغيل الإذاعة الآن. قد تكون متوقفة مؤقتاً أو الاتصال ضعيف.' : 'تعذّر التشغيل. الاستماع يحتاج اتصالاً بالإنترنت.'));
  }
  function pause() {
    if (!Q[at]) return;
    if (Q[at].live) { audio.removeAttribute('src'); audio.load(); } // a live stream resumes at "now", not where it stopped
    else audio.pause();
    state = 'paused'; paint();
  }
  function resume() {
    const it = Q[at];
    if (!it) return;
    if (it.live || !audio.src) { start(Q, at, it.live ? 0 : S.last && S.last.pos); return; }
    state = 'loading'; paint();
    tryPlay();
    window.dispatchEvent(new CustomEvent('noon-recitation', { detail: { from: 'listen' } }));
    session(it);
  }
  const toggle = () => (state === 'playing' || state === 'loading' ? pause() : resume());
  function step(d) { const n = at + d; if (n >= 0 && n < Q.length) start(Q, n); }
  function stop(close) {
    audio.pause(); audio.removeAttribute('src'); audio.load();
    setSleep(0);
    state = close ? 'off' : 'paused';
    paint();
  }

  audio.addEventListener('playing', () => { state = 'playing'; paint(); });
  audio.addEventListener('waiting', () => { if (state === 'playing') { state = 'loading'; paint(); } });
  audio.addEventListener('pause', () => { if (state === 'playing' && !audio.ended) { state = 'paused'; paint(); } });
  audio.addEventListener('error', () => {
    if (!audio.getAttribute('src')) return;
    const it = Q[at];
    if (it && it.tried + 1 < it.urls.length) { audio.src = it.urls[++it.tried]; tryPlay(); return; } // the backup link
    failed();
  });
  audio.addEventListener('ended', () => { if (at + 1 < Q.length) start(Q, at + 1); else { state = 'paused'; S.last = null; save(); paint(); } });
  let lastSave = 0;
  audio.addEventListener('timeupdate', () => {
    const d = audio.duration;
    progIn.style.width = Q[at] && !Q[at].live && d ? `${(audio.currentTime / d) * 100}%` : '0';
    if (S.last && !Q[at].live && Date.now() - lastSave > 5000) { lastSave = Date.now(); S.last.pos = Math.floor(audio.currentTime); save(); }
  });
  // Something else started to play: the Mushaf, an adhkar recording, the adhan on the website.
  window.addEventListener('noon-recitation', (ev) => {
    const from = ev.detail && ev.detail.from;
    if (from !== 'listen' && (state === 'playing' || state === 'loading')) pause();
    if (from !== 'listen-tv') stopTv(); // the TV gives way to any other sound
  });
  // In the app, the native adhan pauses the radio and resumes it after.
  const Adhan = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Adhan;
  if (Adhan && Adhan.addListener) {
    try {
      Adhan.addListener('adhan', (d) => {
        if (d && d.playing) { stopTv(); if (state === 'playing' || state === 'loading') { paused4adhan = true; pause(); } }
        else if (paused4adhan) { paused4adhan = false; resume(); }
      });
    } catch (_) {}
  }

  function session(it) {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({ title: it.title, artist: it.sub, album: T('استماع') });
      navigator.mediaSession.setActionHandler('play', resume);
      navigator.mediaSession.setActionHandler('pause', pause);
      navigator.mediaSession.setActionHandler('stop', () => stop(true));
      navigator.mediaSession.setActionHandler('nexttrack', Q.length > 1 ? () => step(1) : null);
      navigator.mediaSession.setActionHandler('previoustrack', Q.length > 1 ? () => step(-1) : null);
    } catch (_) {}
  }

  // ---- sleep timer: off, 15, 30, 60 minutes; the sound fades out over a few seconds ----
  let sleepAt = 0, sleepTimer = 0, sleepTick = 0;
  function setSleep(min) {
    clearTimeout(sleepTimer); clearInterval(sleepTick);
    sleepAt = min ? Date.now() + min * 60000 : 0;
    bar.classList.toggle('has-sleep', !!min);
    const show = () => { sleepLbl.textContent = sleepAt ? I.num(Math.max(1, Math.ceil((sleepAt - Date.now()) / 60000))) : ''; };
    show();
    if (!min) return;
    sleepTick = setInterval(show, 20000);
    sleepTimer = setTimeout(() => {
      clearInterval(sleepTick);
      let v = 1;
      const fade = setInterval(() => {
        v -= 0.1; audio.volume = Math.max(0, v);
        if (v <= 0) { clearInterval(fade); pause(); audio.volume = 1; setSleep(0); }
      }, 400);
    }, min * 60000);
  }
  function cycleSleep() {
    const steps = [0, 15, 30, 60];
    const cur = sleepAt ? steps.find((m) => m * 60000 >= sleepAt - Date.now() - 1000) || 60 : 0;
    const next = steps[(steps.indexOf(cur) + 1) % steps.length];
    setSleep(next);
    toast(next ? `${T('سيتوقف الاستماع بعد')} ${I.num(next)} ${T('دقيقة')}` : T('أُلغي مؤقت النوم'));
  }

  // ---- queues ----
  function playRadio(list, i) {
    start(list.map((r) => ({ key: `r${r.id}`, title: r.name, sub: r.note || T('بث مباشر'), urls: r.urls, live: true, last: { kind: 'radio', id: r.id } })), i);
  }
  function playMoshaf(rec, m, n, pos) {
    const q = m.list.map((k) => ({ key: `m${m.id}:${k}`, title: surahName(k - 1), sub: `${rec.name} · ${m.name}`,
      urls: [`${m.server}${pad3(k)}.mp3`], last: { kind: 'surah', rec: rec.id, moshaf: m.id, n: k } }));
    start(q, Math.max(0, m.list.indexOf(n)), pos);
  }
  function playTafsir(list, i, pos) {
    start(list.map((x) => ({ key: `t${x.id}`, title: partName(x), sub: T('الخلاصة من تفسير الطبري'), urls: [x.url], last: { kind: 'tafsir', id: x.id } })), i, pos);
  }
  async function resumeLast() {
    const L = S.last;
    if (!L) return;
    try {
      if (L.kind === 'radio') { const list = await radios(); const i = list.findIndex((r) => r.id === L.id); if (i >= 0) playRadio(list, i); }
      if (L.kind === 'surah') {
        const rec = (await reciters()).find((r) => r.id === L.rec), m = rec && rec.moshaf.find((x) => x.id === L.moshaf);
        if (m) playMoshaf(rec, m, L.n, L.pos);
      }
      if (L.kind === 'tafsir') { const list = await tafsir(); const i = list.findIndex((x) => x.id === L.id); if (i >= 0) playTafsir(list, i, L.pos); }
    } catch (_) { toast(T('تعذّر التشغيل. الاستماع يحتاج اتصالاً بالإنترنت.')); }
  }

  // ================= the tab =================
  let screen = { name: 'home' }; // home | reciter
  let rendered = false;
  const TABS = [['radio', 'الإذاعات'], ['tv', 'البث المباشر'], ['recite', 'التلاوات'], ['tafsir', 'التفسير الصوتي'], ['fav', 'المفضلة']];
  const CATS = [['all', 'الكل'], ['reciters', 'القرّاء'], ['mixed', 'منوعة وأذكار'], ['topics', 'تفسير ودروس'], ['trans', 'ترجمات المعاني']];

  function render() {
    rendered = true;
    stopTv();
    root.replaceChildren();
    if (screen.name === 'reciter') return renderReciter();
    const head = el('div', 'view-head');
    head.append(el('h2', '', T('استماع')), el('span', 'view-sub', T('إذاعات وتلاوات وتفسير صوتي')));
    root.append(head);
    if (S.last && state === 'off') {
      const c = button('ls-continue', '', resumeLast);
      const t = el('span', 'ls-txt');
      t.append(el('small', '', T('تابع الاستماع')), el('b', '', S.last.title || ''), el('small', '', S.last.sub || ''));
      c.append(icon('play'), t);
      root.append(c);
    }
    const tabs = el('div', 'ls-tabs');
    tabs.setAttribute('role', 'tablist');
    TABS.forEach(([k, label]) => {
      const b = button('chip', T(label), () => { S.tab = k; save(); render(); });
      b.setAttribute('aria-pressed', String(S.tab === k));
      tabs.append(b);
    });
    root.append(tabs);
    const body = el('div', 'ls-body');
    root.append(body, el('p', 'credit', T('الإذاعات والتلاوات والتفسير الصوتي من موقع mp3quran.net (موقع الإذاعات الإسلامية)، تُبث مباشرة من خوادمه.')));
    const views = { radio: renderRadios, tv: renderTv, recite: renderReciters, tafsir: renderTafsir, fav: renderFav };
    (views[S.tab] || renderRadios)(body);
    paint();
  }
  const go = (s) => { screen = s; render(); root.scrollIntoView({ block: 'start' }); };
  function loading(box, job) {
    box.replaceChildren(el('p', 'hint', T('جارٍ التحميل…')));
    job().catch(() => {
      const again = button('btn btn-quiet', T('إعادة المحاولة'), () => loading(box, job));
      box.replaceChildren(el('p', 'hint', T('تعذّر تحميل القائمة. تأكد من الاتصال بالإنترنت.')), again);
    });
  }
  function search(ph) {
    const q = el('input', 'ls-search'); q.type = 'search'; q.placeholder = T(ph); q.setAttribute('aria-label', T(ph));
    return q;
  }
  function star(list, id, label) {
    const on = S[list].includes(id);
    const b = iconBtn('star', on ? 'إزالة من المفضلة' : 'إضافة للمفضلة', (ev) => {
      ev.stopPropagation();
      const k = S[list].indexOf(id);
      if (k >= 0) S[list].splice(k, 1); else S[list].push(id);
      save();
      const now = S[list].includes(id);
      b.classList.toggle('is-fav', now);
      b.setAttribute('aria-label', T(now ? 'إزالة من المفضلة' : 'إضافة للمفضلة'));
      b.setAttribute('aria-pressed', String(now));
    }, 'ls-star');
    b.classList.toggle('is-fav', on);
    b.setAttribute('aria-pressed', String(on));
    if (label) b.title = `${T('المفضلة')}: ${label}`;
    return b;
  }
  function row(key, title, sub, onPlay, extra) {
    const r = el('div', 'ls-row');
    const b = button('ls-pick', '', onPlay);
    b.dataset.play = key;
    const eqi = el('span', 'lp-eq'); eqi.append(el('i'), el('i'), el('i'));
    const txt = el('span', 'ls-txt');
    txt.append(el('b', '', title));
    if (sub) txt.append(el('small', '', sub));
    b.append(icon('play', 'ls-pi'), eqi, txt);
    r.append(b);
    if (extra) r.append(extra);
    return r;
  }

  // ---- radio ----
  function renderRadios(box) {
    loading(box, async () => {
      const all = await radios();
      box.replaceChildren();
      const live = all.filter((r) => r.kind === 'live');
      live.forEach((r) => {
        const f = button('ls-live', '', () => playRadio(all, all.indexOf(r)));
        f.dataset.play = `r${r.id}`;
        f.append(icon('radio'), el('span', 'ls-live-t', r.name), el('span', 'ls-badge', T('بث مباشر')));
        box.append(f);
      });
      const q = search('ابحث عن قارئ أو إذاعة');
      const cats = el('div', 'ls-cats');
      const list = el('div', 'ls-list');
      CATS.forEach(([k, label]) => {
        const b = button('chip', T(label), () => { S.cat = k; save(); cats.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c === b))); draw(); });
        b.setAttribute('aria-pressed', String((S.cat || 'all') === k));
        cats.append(b);
      });
      const draw = () => {
        const words = norm(q.value);
        const shown = all.filter((r) => r.kind !== 'live' && (words || S.cat === 'all' || !S.cat || r.kind === S.cat) && (!words || norm(`${r.name} ${r.note}`).includes(words)));
        list.replaceChildren(...shown.map((r) => row(`r${r.id}`, r.name, r.note, () => playRadio(shown, shown.indexOf(r)), star('fav', r.id, r.name))));
        if (!shown.length) list.append(el('p', 'hint', T('لا توجد نتائج.')));
        paint();
      };
      q.addEventListener('input', draw);
      box.append(q, cats, list);
      draw();
    });
  }

  // ---- live TV: the Quran channel (Makkah) and the Sunnah channel (Madinah) ----
  // First choice: the channel's official live broadcast on YouTube (up to 1080p), shown through
  // tv.html on the website, because YouTube's player asks for a real web address and the app's
  // pages come from https://localhost. Backup: the lower-quality HLS links, played by hls.js
  // (js/vendor, Apache-2.0) where the browser can't play HLS by itself.
  let hls = null, tvVideo = null, tvFrame = null;
  function loadHls() {
    if (window.Hls) return Promise.resolve(window.Hls);
    return new Promise((ok, no) => {
      const s = document.createElement('script');
      s.src = 'js/vendor/hls.light.min.js';
      s.onload = () => ok(window.Hls); s.onerror = no;
      document.head.append(s);
    });
  }
  function stopTv() {
    if (hls) { hls.destroy(); hls = null; }
    if (tvVideo) { tvVideo.pause(); tvVideo.removeAttribute('src'); tvVideo.load(); }
    if (tvFrame) { tvFrame.remove(); tvFrame = null; }
  }
  // A link counts when it answers with a playlist.
  async function answers(url) {
    try { const r = await fetch(url, { cache: 'no-store' }); return r.ok && (await r.text()).trimStart().startsWith('#EXTM3U'); } catch (_) { return false; }
  }
  async function attach(video, url) {
    const Hls = await loadHls().catch(() => null);
    if (Hls && Hls.isSupported()) {
      const h = new Hls({ maxBufferLength: 20 });
      hls = h;
      await new Promise((ok, no) => {
        h.on(Hls.Events.MANIFEST_PARSED, ok);
        h.on(Hls.Events.ERROR, (e, d) => { if (d.fatal) no(new Error(d.details)); });
        h.loadSource(url); h.attachMedia(video);
      });
      // After it starts: ride out short network and decoding hiccups.
      let retries = 0;
      h.on(Hls.Events.ERROR, (e, d) => {
        if (!d.fatal || hls !== h || ++retries > 6) return;
        if (d.type === Hls.ErrorTypes.MEDIA_ERROR) h.recoverMediaError(); else setTimeout(() => { if (hls === h) h.startLoad(); }, 2000);
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) video.src = url; // Safari, iPhone
    else throw new Error('no HLS');
  }
  const tvStarted = () => window.dispatchEvent(new CustomEvent('noon-recitation', { detail: { from: 'listen-tv' } }));
  function playYoutube(ch, frame, video, note) {
    stopTv();
    video.hidden = true;
    const f = el('iframe', 'tv-yt');
    f.src = `${window.noonNative ? SITE : ''}tv.html?v=${encodeURIComponent(ch.youtube.video)}&hl=${I.isEn ? 'en' : 'ar'}`;
    f.title = I.isEn ? ch.en : ch.ar;
    f.allow = 'autoplay; encrypted-media; fullscreen; picture-in-picture';
    f.allowFullscreen = true;
    f.referrerPolicy = 'strict-origin-when-cross-origin';
    tvFrame = f;
    frame.append(f);
    note.textContent = '';
    tvStarted();
  }
  async function playHls(ch, video, note) {
    stopTv();
    video.hidden = false;
    tvVideo = video;
    note.textContent = T('جارٍ التحميل…');
    tvStarted();
    for (const url of ch.urls) {
      if (tvVideo !== video || !(await answers(url))) continue;
      try {
        await attach(video, url);
        note.textContent = '';
        video.play().catch(() => { note.textContent = T('اضغط على زر التشغيل في الفيديو.'); });
        return;
      } catch (_) { stopTv(); tvVideo = video; }
    }
    note.textContent = T('تعذّر تشغيل البث الآن. قد يكون متوقفاً مؤقتاً أو الاتصال ضعيف؛ جرّب بعد قليل.');
  }
  function renderTv(box) {
    loading(box, async () => {
      const [cfg, fromApi] = await Promise.all([liveCfg(), api('live-tv', 'ar').catch(() => null)]);
      // Links mp3quran.net publishes are tried after ours, so their fixes count too.
      const chans = cfg.tv.map((c) => Object.assign({}, c, { urls: (c.urls || []).slice() }));
      ((fromApi && fromApi.livetv) || []).forEach((x) => {
        const c = chans.find((k) => k.id === (/سنة|sunnah/i.test(x.name) ? 'sunnah' : 'quran'));
        if (c && x.url && !c.urls.includes(x.url)) c.urls.push(x.url);
      });
      box.replaceChildren();
      const video = el('video', 'tv-video');
      video.controls = true; video.playsInline = true; video.setAttribute('playsinline', ''); video.preload = 'none';
      const frame = el('div', 'tv-frame'); frame.append(video);
      const note = el('p', 'hint'); note.setAttribute('aria-live', 'polite');
      const chips = el('div', 'tv-chans');
      let cur = null, hd = true;
      const hasHd = (c) => !!(c.youtube && /^[\w-]{11}$/.test(c.youtube.video || ''));
      const swap = button('link-btn tv-swap', '', () => { hd = !hd; play(); });
      swap.hidden = true;
      const play = () => {
        const useHd = hd && hasHd(cur);
        swap.hidden = !hasHd(cur) || !cur.urls.length;
        swap.textContent = T(useHd ? 'الصورة لا تظهر؟ جرّب الرابط البديل (جودة أقل)' : 'عودة إلى البث بجودة عالية');
        if (useHd) playYoutube(cur, frame, video, note); else playHls(cur, video, note);
      };
      chans.forEach((c) => {
        const b = button('tv-chan', '', () => {
          chips.querySelectorAll('.tv-chan').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
          cur = c;
          play();
        });
        b.setAttribute('aria-pressed', 'false');
        b.append(icon('play'), el('span', '', I.isEn ? c.en : c.ar), el('span', 'ls-badge', T('بث مباشر')));
        chips.append(b);
      });
      box.append(chips, frame, note, swap, el('p', 'hint', T('البث الرسمي لقناتي القرآن الكريم والسنة النبوية (هيئة الإذاعة والتلفزيون السعودية) بجودة تصل إلى 1080p. للشاشة الكاملة استخدم زر التكبير في الفيديو.')));
      loadHls().catch(() => {}); // ready for the backup link
    });
  }

  // ---- recitations: all the reciters, by riwayah ----
  function renderReciters(box) {
    loading(box, async () => {
      const [all, rw] = await Promise.all([reciters(), riwayat().catch(() => [])]);
      box.replaceChildren();
      const tools = el('div', 'ls-tools');
      const q = search('ابحث عن قارئ');
      const sel = el('select', 'ls-select'); sel.setAttribute('aria-label', T('الرواية'));
      sel.append(new Option(T('كل الروايات'), '0'));
      rw.forEach((r) => sel.append(new Option(clean(r.name), String(r.id))));
      sel.value = String(S.riwaya || 0);
      tools.append(q, sel);
      const list = el('div', 'ls-list');
      const count = el('p', 'hint');
      const draw = () => {
        const words = norm(q.value), rid = Number(sel.value);
        const shown = all.filter((r) => (!rid || r.moshaf.some((m) => m.riwaya === rid)) && (!words || norm(r.name).includes(words)));
        count.textContent = `${I.num(shown.length)} ${T('قارئاً')}`;
        list.replaceChildren(...shown.map((r) => {
          const sub = r.moshaf.length > 1 ? `${I.num(r.moshaf.length)} ${T('مصاحف')}` : r.moshaf[0].name;
          const x = row(`rec${r.id}`, r.name, sub, () => go({ name: 'reciter', id: r.id }), star('favRec', r.id, r.name));
          x.querySelector('.ls-pi').replaceWith(el('span', 'ls-letter', r.name.replace(/^(ال|al-?\s*)/i, '').charAt(0)));
          return x;
        }));
      };
      q.addEventListener('input', draw);
      sel.addEventListener('change', () => { S.riwaya = Number(sel.value); save(); draw(); });
      box.append(tools, count, list);
      draw();
    });
  }
  // The first recording shown: the chosen riwayah, the most surahs, then Hafs and plain murattal before the others.
  const score = (m) => (S.riwaya && m.riwaya === S.riwaya ? 1000 : 0) + m.list.length * 4 + (m.riwaya === 1 ? 2 : 0) + (/مرتل|murattal/i.test(m.name) ? 1 : 0);
  function renderReciter() {
    const head = el('div', 'view-head');
    head.append(button('btn btn-quiet', `${I.isEn ? '←' : '→'} ${T('التلاوات')}`, () => go({ name: 'home' })));
    root.append(head);
    const box = el('div', 'ls-body');
    root.append(box);
    loading(box, async () => {
      const rec = (await reciters()).find((r) => r.id === screen.id);
      if (!rec) { go({ name: 'home' }); return; }
      box.replaceChildren();
      const h = el('div', 'ls-rec-head');
      h.append(el('h2', '', rec.name), star('favRec', rec.id, rec.name));
      box.append(h);
      let m = rec.moshaf.find((x) => x.id === screen.moshaf) || [...rec.moshaf].sort((x, y) => score(y) - score(x))[0];
      const pick = el('div', 'ls-cats');
      const grid = el('div', 'ls-surahs');
      const all = button('btn btn-primary', '', () => playMoshaf(rec, m, m.list[0]));
      const drawM = () => {
        pick.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(Number(c.dataset.id) === m.id)));
        all.textContent = `${T('تشغيل الكل')} (${I.num(m.list.length)} ${T('سورة')})`;
        grid.replaceChildren(...m.list.map((k) => {
          const b = button('ls-surah', '', () => playMoshaf(rec, m, k));
          b.dataset.play = `m${m.id}:${k}`;
          b.append(el('small', '', I.num(k)), el('b', '', surahName(k - 1)));
          return b;
        }));
        paint();
      };
      if (rec.moshaf.length > 1) {
        rec.moshaf.forEach((x) => {
          const c = button('chip', x.name, () => { m = x; screen.moshaf = x.id; drawM(); });
          c.dataset.id = String(x.id);
          pick.append(c);
        });
        box.append(pick);
      } else box.append(el('p', 'hint', m.name));
      box.append(all, grid);
      drawM();
    });
  }

  // ---- audio tafsir ----
  function renderTafsir(box) {
    loading(box, async () => {
      const all = await tafsir();
      box.replaceChildren(el('p', 'hint', T('الخلاصة من تفسير الطبري، مقسّمة على السور والآيات. يُشغَّل الجزء التالي تلقائياً.')));
      const q = search('ابحث عن سورة');
      const list = el('div', 'ls-tf');
      const draw = () => {
        const words = norm(q.value);
        list.replaceChildren();
        for (let s = 0; s < 114; s++) {
          if (words && !norm(`${surahName(s)} ${M.surahs[s][0]} ${M.surahs[s][1]} ${s + 1}`).includes(words)) continue;
          const parts = all.filter((x) => x.s === s);
          if (!parts.length) continue;
          if (parts.length === 1) { list.append(row(`t${parts[0].id}`, `${I.num(s + 1)}. ${surahName(s)}`, '', () => playTafsir(all, all.indexOf(parts[0])))); continue; }
          const d = el('details', 'ls-group');
          const sm = el('summary', '', `${I.num(s + 1)}. ${surahName(s)}`);
          sm.append(el('small', '', ` · ${I.num(parts.length)} ${T('أجزاء')}`));
          d.append(sm);
          parts.forEach((x) => d.append(row(`t${x.id}`, `${T('الآيات')} ${I.num(x.from)}–${I.num(x.to)}`, '', () => playTafsir(all, all.indexOf(x)))));
          list.append(d);
        }
        paint();
      };
      q.addEventListener('input', draw);
      box.append(q, list);
      draw();
    });
  }

  // ---- favourites ----
  function renderFav(box) {
    if (!S.fav.length && !S.favRec.length) {
      box.replaceChildren(el('p', 'hint', T('اضغط على النجمة بجانب أي إذاعة أو قارئ لتجده هنا.')));
      return;
    }
    loading(box, async () => {
      const [rs, recs] = await Promise.all([S.fav.length ? radios() : [], S.favRec.length ? reciters() : []]);
      box.replaceChildren();
      const fr = rs.filter((r) => S.fav.includes(r.id));
      if (fr.length) {
        box.append(el('h3', 'lib-h', T('الإذاعات')));
        const l = el('div', 'ls-list');
        fr.forEach((r, i) => l.append(row(`r${r.id}`, r.name, r.note, () => playRadio(fr, i), star('fav', r.id, r.name))));
        box.append(l);
      }
      const fc = recs.filter((r) => S.favRec.includes(r.id));
      if (fc.length) {
        box.append(el('h3', 'lib-h', T('القرّاء')));
        const l = el('div', 'ls-list');
        fc.forEach((r) => l.append(row(`rec${r.id}`, r.name, r.moshaf.map((m) => m.name).join(' · '), () => go({ name: 'reciter', id: r.id }), star('favRec', r.id, r.name))));
        box.append(l);
      }
      paint();
    });
  }

  // The lists load the first time the tab opens.
  window.addEventListener('noon-view', (ev) => {
    if (ev.detail.view === 'listen') { if (!rendered) render(); } else stopTv();
  });
  if (window.noonUI.currentView && window.noonUI.currentView() === 'listen') render();

  window.noonListen = { playRadio, stop: () => stop(true), state: () => state, open: () => window.noonUI.go('listen') };
})();
