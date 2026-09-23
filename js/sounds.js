// ---------- Focus sounds: a mixer of real ambient recordings ----------
// Recordings from the Moodist project (github.com/remvze/moodist), licensed
// CC0 / Pixabay Content License. Files live in ./sounds next to this page.
(() => {
  'use strict';
  const KEY = 'noon-sweep-sounds-v2';
  const $ = (id) => document.getElementById(id);
  const I = window.noonI18n, T = I.t;

  const CATS = [
    ['rain', 'مطر'], ['nature', 'طبيعة'], ['animals', 'حيوانات'], ['places', 'أماكن'], ['things', 'أشياء'], ['noise', 'ضوضاء وموجات'],
    ['music', 'موسيقاي']
  ];
  // [id, Arabic name, category, file, icon]
  const SOUNDS = [
    ['light-rain', 'مطر خفيف', 'rain', 'rain/light-rain.mp3', 'rain'],
    ['heavy-rain', 'مطر غزير', 'rain', 'rain/heavy-rain.mp3', 'rain'],
    ['rain-on-window', 'مطر على النافذة', 'rain', 'rain/rain-on-window.mp3', 'window'],
    ['rain-on-tent', 'مطر على خيمة', 'rain', 'rain/rain-on-tent.mp3', 'tent'],
    ['thunder', 'رعد', 'rain', 'rain/thunder.mp3', 'storm'],
    ['waves', 'أمواج البحر', 'nature', 'nature/waves.mp3', 'waves'],
    ['river', 'نهر', 'nature', 'nature/river.mp3', 'stream'],
    ['waterfall', 'شلال', 'nature', 'nature/waterfall.mp3', 'stream'],
    ['droplets', 'قطرات ماء', 'nature', 'nature/droplets.mp3', 'rain'],
    ['wind', 'رياح', 'nature', 'nature/wind.mp3', 'wind'],
    ['wind-in-trees', 'رياح بين الأشجار', 'nature', 'nature/wind-in-trees.mp3', 'tree'],
    ['campfire', 'نار المخيم', 'nature', 'nature/campfire.mp3', 'fire'],
    ['birds', 'عصافير', 'animals', 'animals/birds.mp3', 'birds'],
    ['crickets', 'صراصير الليل', 'animals', 'animals/crickets.mp3', 'night'],
    ['seagulls', 'نوارس', 'animals', 'animals/seagulls.mp3', 'birds'],
    ['cat-purring', 'خرخرة قطة', 'animals', 'animals/cat-purring.mp3', 'cat'],
    ['cafe', 'مقهى', 'places', 'places/cafe.mp3', 'cafe'],
    ['library', 'مكتبة', 'places', 'places/library.mp3', 'book'],
    ['night-village', 'قرية في الليل', 'places', 'places/night-village.mp3', 'night'],
    ['inside-a-train', 'داخل قطار', 'places', 'transport/inside-a-train.mp3', 'train'],
    ['sailboat', 'مركب شراعي', 'places', 'transport/sailboat.mp3', 'boat'],
    ['clock', 'تكّة ساعة', 'things', 'things/clock.mp3', 'clock'],
    ['keyboard', 'لوحة مفاتيح', 'things', 'things/keyboard.mp3', 'keyboard'],
    ['typewriter', 'آلة كاتبة', 'things', 'things/typewriter.mp3', 'keyboard'],
    ['wind-chimes', 'أجراس الرياح', 'things', 'things/wind-chimes.mp3', 'bell'],
    ['singing-bowl', 'وعاء تبتي', 'things', 'things/singing-bowl.mp3', 'bowl'],
    ['vinyl-effect', 'أسطوانة قديمة', 'things', 'things/vinyl-effect.mp3', 'vinyl'],
    ['ceiling-fan', 'مروحة سقف', 'things', 'things/ceiling-fan.mp3', 'fan'],
    ['white-noise', 'ضوضاء بيضاء', 'noise', 'noise/white-noise.wav', 'noise'],
    ['pink-noise', 'ضوضاء وردية', 'noise', 'noise/pink-noise.wav', 'noise'],
    ['brown-noise', 'ضوضاء بنية', 'noise', 'noise/brown-noise.wav', 'noise'],
    ['binaural-alpha', 'موجات ألفا (بسماعات)', 'noise', 'binaural/binaural-alpha.wav', 'headphones']
  ];
  const ICONS = {
    rain: 'M8 2s-4 5-4 8a4 4 0 0 0 8 0c0-3-4-8-4-8z',
    window: 'M2 2h12v12H2zM8 2v12M2 8h12',
    tent: 'M1 14L8 2l7 12zM8 2v12M6 14l2-4 2 4',
    storm: 'M9 1L3 9h4l-1 6 6-8H8l1-6z',
    waves: 'M1 6c2-2 3-2 5 0s3 2 5 0 3-2 4 0M1 11c2-2 3-2 5 0s3 2 5 0 3-2 4 0',
    stream: 'M2 3c3 2 5-2 8 0s3 2 4 0M2 8c3 2 5-2 8 0s3 2 4 0M2 13c3 2 5-2 8 0s3 2 4 0',
    wind: 'M1 5h9a2 2 0 1 0-2-2M1 9h12a2 2 0 1 1-2 2M1 13h6',
    tree: 'M8 1l5 8H3zM8 5l6 7H2zM8 12v3',
    fire: 'M8 1c1 3 4 4 4 8a4 4 0 0 1-8 0c0-2 1-3 2-4 0 2 1 3 2 3-1-2 0-5 0-7z',
    birds: 'M1 8c2-3 5-3 7 0 2-3 5-3 7 0M4 12c1-1.5 2.5-1.5 3.5 0 1-1.5 2.5-1.5 3.5 0',
    night: 'M11 2a6 6 0 1 0 3 9 5 5 0 0 1-3-9z',
    cat: 'M3 6V2l3 3h4l3-3v4a5 5 0 0 1-10 0zM6 8h.01M10 8h.01',
    cafe: 'M2 5h9v4a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V5zm9 1h1.5a1.5 1.5 0 0 1 0 3H11',
    book: 'M2 3h5a1 1 0 0 1 1 1v10a1 1 0 0 0-1-1H2zM14 3H9a1 1 0 0 0-1 1v10a1 1 0 0 1 1-1h5z',
    train: 'M4 2h8a1 1 0 0 1 1 1v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3a1 1 0 0 1 1-1zM3 7h10M5 15l1-2M11 15l-1-2',
    boat: 'M8 1v10M8 2l5 8H8M2 12h12l-2 3H4z',
    clock: 'M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 3v4l3 2',
    keyboard: 'M1 4h14v8H1zM4 7h.01M7 7h.01M10 7h.01M13 7h.01M4 10h8',
    bell: 'M4 11V7a4 4 0 0 1 8 0v4l1 2H3zM7 15h2',
    bowl: 'M1 8h14a7 5 0 0 1-14 0zM5 3c1 1 1 2 0 3M9 2c1 1 1 2 0 3',
    vinyl: 'M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 5a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
    fan: 'M8 8c0-4 2-6 4-6-1 3-2 5-4 6zm0 0c4 0 6 2 6 4-3-1-5-2-6-4zm0 0c0 4-2 6-4 6 1-3 2-5 4-6zm0 0c-4 0-6-2-6-4 3 1 5 2 6 4z',
    noise: 'M2 8h1M5 4v8M8 2v12M11 5v6M14 7v2',
    headphones: 'M2 10V8a6 6 0 0 1 12 0v2M2 10h2v4H2zM12 10h2v4h-2z',
    music: 'M6 12V3l8-2v9M6 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm8-2a2 2 0 1 1-4 0 2 2 0 0 1 4 0z'
  };
  const PRESETS = [
    ['مطر ومدفأة', { 'light-rain': 0.6, campfire: 0.5 }],
    ['شاطئ', { waves: 0.7, seagulls: 0.25, wind: 0.2 }],
    ['غابة', { birds: 0.55, river: 0.45, 'wind-in-trees': 0.3 }],
    ['مقهى ممطر', { cafe: 0.6, 'rain-on-window': 0.45 }],
    ['ليل هادئ', { crickets: 0.5, 'night-village': 0.4 }],
    ['مكتبة', { library: 0.6, clock: 0.3 }],
    ['تركيز عميق', { 'brown-noise': 0.6, 'binaural-alpha': 0.3 }]
  ];
  const byId = Object.fromEntries(SOUNDS.map((s) => [s[0], s]));

  // Where recordings come from: the local ./sounds folder when it was uploaded
  // with the site, otherwise the same files from the Moodist repository on
  // jsDelivr (pinned to one commit so they never change underneath the page).
  const CDN = 'https://cdn.jsdelivr.net/gh/remvze/moodist@285ecdbfc67fb082833eee8cef9cd34bbdb1d755/public/sounds/';
  const BASES = ['sounds/', CDN];
  const SITE_URL = 'https://micro4tricks-ai.github.io/muslim-todo-list/';
  let workingBase = null; // the first source that served a file; tried first afterwards
  const urlsFor = (id) => {
    const order = workingBase ? [workingBase].concat(BASES.filter((b) => b !== workingBase)) : BASES;
    return order.map((b) => ({ base: b, url: b + byId[id][3] }));
  };

  // ---- my music: the listener's own tracks, played from their device ----
  // Nothing is uploaded. A chosen folder is remembered (as a browser file
  // handle) so it only needs a one-click permission on later visits; single
  // files added with the file picker last until the page is closed.
  const music = new Map(); // id -> { name, handle?, file?, objectUrl? }
  const isMusic = (id) => id.startsWith('music:');
  const AUDIO_EXT = /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|webm)$/i;
  const prettyName = (file) => file.replace(/\.[^.]+$/, '').replace(/\s+/g, ' ').trim();
  const canPickFolder = typeof window.showDirectoryPicker === 'function';
  async function musicUrl(id) {
    const m = music.get(id);
    if (!m) return null;
    if (!m.objectUrl) {
      const file = m.file || (m.handle && await m.handle.getFile());
      if (!file) return null;
      m.objectUrl = URL.createObjectURL(file);
    }
    return m.objectUrl;
  }
  function idbOpen() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('noon-sweep', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  async function idbGet(k) {
    const db = await idbOpen();
    return new Promise((res, rej) => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
  }
  async function idbSet(k, v) {
    const db = await idbOpen();
    return new Promise((res, rej) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = () => res(); t.onerror = () => rej(t.error); });
  }
  let musicDir = null; // remembered folder handle
  async function loadFolder(dir) {
    let n = 0;
    for await (const [name, h] of dir.entries()) {
      if (h.kind === 'file' && AUDIO_EXT.test(name)) {
        const id = 'music:' + dir.name + '/' + name;
        if (!music.has(id)) music.set(id, { name: prettyName(name), handle: h });
        n++;
      }
    }
    musicNote(n ? '' : T('لا توجد ملفات صوت في هذا المجلد.'));
    buildMusicTiles();
  }

  // ---- state ----
  const S = { selected: {}, master: 0.8, sync: true, cat: 'rain', open: false };
  try { Object.assign(S, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (_) {}
  // Keep remembered music selections: their folder is reconnected after load.
  Object.keys(S.selected).forEach((id) => { if (!byId[id] && !isMusic(id)) delete S.selected[id]; });
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (_) {} };
  let playing = false;
  const live = {}; // id -> player

  // ---- audio ----
  // Web Audio buffers loop without gaps; when the page is opened as a local
  // file (where fetch is blocked) fall back to a looping <audio> element.
  let ac = null, master = null;
  const bufferCache = {};
  function ensureAudio() {
    if (!ac) {
      try {
        ac = new (window.AudioContext || window.webkitAudioContext)();
        master = ac.createGain();
        master.gain.value = S.master;
        master.connect(ac.destination);
      } catch (_) { ac = null; }
    }
    if (ac && ac.state === 'suspended') ac.resume();
  }
  function loadBuffer(id) {
    if (!bufferCache[id]) {
      bufferCache[id] = (async () => {
        let lastError = new Error('no source');
        for (const { base, url } of urlsFor(id)) {
          try {
            const r = await fetch(url);
            if (!r.ok) throw new Error('HTTP ' + r.status);
            const bytes = await r.arrayBuffer();
            const buf = await new Promise((res, rej) => ac.decodeAudioData(bytes, res, rej));
            workingBase = base;
            return buf;
          } catch (e) { lastError = e; }
        }
        throw lastError;
      })();
      bufferCache[id].catch(() => { delete bufferCache[id]; });
    }
    return bufferCache[id];
  }

  function fadeElement(el, to, ms, done) {
    const from = el.volume, t0 = performance.now();
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / ms);
      el.volume = Math.max(0, Math.min(1, from + (to - from) * k));
      if (k < 1) requestAnimationFrame(step); else if (done) done();
    };
    step();
  }
  const elementLevel = (id) => (S.selected[id] || 0) * S.master;

  // Streams through a looping <audio> element, trying each source in turn.
  // It starts within a second, before the whole file has downloaded.
  function playElement(p, sources) {
    const id = p.id;
    const next = sources.shift();
    if (live[id] !== p) return; // stopped while loading
    if (!next) { p.loading = false; p.failed = true; render(); return; }
    const el = new Audio(next.url);
    el.loop = true;
    el.volume = 0;
    p.el = el;
    let settled = false;
    // Try the next source, or report the sound as unavailable.
    const giveUp = (retry) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (live[id] !== p || p.el !== el) return;
      el.pause();
      if (retry && sources.length) playElement(p, sources);
      else { p.loading = false; p.failed = true; render(); }
    };
    // Some pages block outside media without ever answering play(), which
    // would leave the tile silently "loading"; give each source 12 seconds.
    const timer = setTimeout(() => { if (p.loading && p.el === el) giveUp(true); }, 12000);
    el.addEventListener('error', () => giveUp(true), { once: true });
    el.play().then(() => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // Stopped, or already handed over to the buffer: stay silent.
      if (live[id] !== p || p.el !== el) { el.pause(); return; }
      if (next.base) workingBase = next.base;
      p.loading = false; p.failed = false; render();
      fadeElement(el, elementLevel(id), 1000);
    }).catch(() => {
      // A missing file surfaces as a media error; anything else (such as the
      // browser blocking autoplay) will not be fixed by another source.
      giveUp(!!el.error);
    });
  }
  // Once the full recording has downloaded, hand over from the streaming
  // element to a Web Audio buffer, which loops with no gap at the seam.
  function upgradeToBuffer(p) {
    const id = p.id;
    loadBuffer(id).then((buf) => {
      if (live[id] !== p) return;
      const g = ac.createGain();
      g.gain.value = 0;
      g.connect(master);
      const s = ac.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      s.connect(g);
      const el = p.el;
      s.start(0, el && !el.paused ? el.currentTime % buf.duration : 0);
      p.node = s; p.gain = g; p.el = null; p.loading = false; p.failed = false;
      g.gain.setTargetAtTime(S.selected[id], ac.currentTime, 0.15);
      if (el) fadeElement(el, 0, 600, () => { el.pause(); el.removeAttribute('src'); el.load(); });
      render();
    }).catch(() => { /* keep streaming through the element */ });
  }

  function startSound(id) {
    if (live[id]) return;
    if (isMusic(id) && !music.has(id)) return; // its folder isn't connected yet
    ensureAudio();
    const p = { id, loading: true, node: null, gain: null, el: null, failed: false };
    live[id] = p;
    if (isMusic(id)) {
      // Your own long tracks always stream: decoding an hour of audio into
      // memory would take over a gigabyte.
      musicUrl(id).then((url) => {
        if (live[id] !== p) return;
        if (!url) { p.loading = false; p.failed = true; render(); return; }
        playElement(p, [{ base: null, url }]);
      }).catch(() => { p.loading = false; p.failed = true; render(); });
    } else {
      playElement(p, urlsFor(id));
      if (ac && location.protocol !== 'file:') upgradeToBuffer(p);
    }
    render();
  }
  function stopSound(id) {
    const p = live[id];
    if (!p) return;
    delete live[id];
    if (p.gain) {
      p.gain.gain.setTargetAtTime(0, ac.currentTime, 0.2);
      setTimeout(() => { try { if (p.node) p.node.stop(); } catch (_) {} p.gain.disconnect(); }, 900);
    }
    if (p.el) {
      const el = p.el;
      fadeElement(el, 0, 700, () => { el.pause(); el.removeAttribute('src'); el.load(); });
    }
  }
  function setLevel(id) {
    const p = live[id];
    if (!p) return;
    if (p.gain) p.gain.gain.setTargetAtTime(S.selected[id], ac.currentTime, 0.08);
    if (p.el) p.el.volume = Math.min(1, elementLevel(id));
  }
  function setPlaying(on) {
    playing = on;
    if (on) Object.keys(S.selected).forEach(startSound);
    else Object.keys(live).forEach(stopSound);
    render();
  }

  // ---- UI ----
  const nameOf = (id) => (isMusic(id) ? (music.get(id) || { name: id.split('/').pop() }).name : T(byId[id][1]));
  const catOf = (id) => (isMusic(id) ? 'music' : byId[id][2]);
  function musicNote(msg) { $('musicHint').textContent = msg || T('ملفاتك تبقى على جهازك ولا تُرفع لأي مكان.'); }
  function render() {
    const ids = Object.keys(S.selected);
    const loading = playing && ids.some((id) => live[id] && live[id].loading);
    const btn = $('sndPlay');
    btn.textContent = T(playing ? 'إيقاف' : 'تشغيل');
    btn.setAttribute('aria-pressed', String(playing));
    btn.disabled = !ids.length && !playing;
    $('sndMaster').value = String(Math.round(S.master * 100));
    $('sndSync').checked = !!S.sync;
    const failed = ids.filter((id) => live[id] && live[id].failed);
    const status = $('sndStatus');
    // Copies of the page that can't reach the recordings (such as a preview
    // with no sounds folder and no outside access) point to the full site.
    if (failed.length && failed.some((id) => !isMusic(id)) && location.href.indexOf(SITE_URL) !== 0) {
      const a = document.createElement('a');
      a.href = SITE_URL + (I.isEn ? '?lang=en' : '');
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = T('افتح الموقع الكامل');
      status.replaceChildren(`${T('الأصوات غير متاحة في هذه النسخة.')} `, a);
    } else status.textContent = failed.length ? `${T('تعذّر تحميل:')} ${I.list(failed.map(nameOf))}. ${T('تأكد من اتصال الإنترنت أو من وجود مجلد sounds بجانب الصفحة.')}`
      : !ids.length ? T('اختر صوتاً أو مزيجاً جاهزاً')
      : playing ? ids.map(nameOf).join(' · ') + (loading ? ` — ${T('جارٍ التحميل…')}` : '')
      : S.sync ? `${ids.map(nameOf).join(' · ')} — ${T('يبدأ مع جلسة التركيز')}` : ids.map(nameOf).join(' · ');
    const dockBody = $('dockBody');
    dockBody.hidden = !S.open;
    $('dockToggle').setAttribute('aria-expanded', String(S.open));
    document.querySelectorAll('#sndCats button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.cat === S.cat)));
    $('musicBar').hidden = S.cat !== 'music';
    document.querySelectorAll('.snd').forEach((el) => {
      const id = el.dataset.id, on = id in S.selected;
      el.hidden = catOf(id) !== S.cat;
      el.classList.toggle('is-on', on);
      el.classList.toggle('is-loading', !!(live[id] && live[id].loading));
      el.querySelector('.snd-toggle').setAttribute('aria-pressed', String(on));
      const vol = el.querySelector('.snd-vol');
      vol.hidden = !on;
      if (on) vol.value = String(Math.round(S.selected[id] * 100));
    });
    document.querySelectorAll('#sndCats button').forEach((b) => {
      const n = Object.keys(S.selected).filter((id) => catOf(id) === b.dataset.cat).length;
      b.querySelector('.cat-count').textContent = n ? I.num(n) : '';
    });
  }
  function makeTile(id, label, icon) {
    const wrap = document.createElement('div');
    wrap.className = 'snd';
    wrap.dataset.id = id;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'snd-toggle';
    b.title = label;
    b.innerHTML = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="${ICONS[icon]}"/></svg>`;
    const span = document.createElement('span');
    span.textContent = label;
    b.append(span);
    const vol = document.createElement('input');
    vol.type = 'range'; vol.min = '0'; vol.max = '100'; vol.className = 'snd-vol';
    vol.id = 'snd-vol-' + id.replace(/[^a-z0-9-]/gi, '_');
    vol.setAttribute('aria-label', `${T('مستوى صوت')} ${label}`);
    vol.hidden = true;
    wrap.append(b, vol);
    return wrap;
  }
  function buildMusicTiles() {
    document.querySelectorAll('.snd.is-music').forEach((el) => el.remove());
    const grid = $('sndGrid');
    for (const [id, m] of music) {
      const tile = makeTile(id, m.name, 'music');
      tile.classList.add('is-music');
      grid.append(tile);
    }
    // Resume remembered tracks if sound is already playing.
    if (playing) Object.keys(S.selected).filter((id) => music.has(id)).forEach(startSound);
    render();
  }
  function buildUI() {
    $('sndCats').replaceChildren(...CATS.map(([id, name]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.dataset.cat = id;
      b.append(T(name) + ' ');
      const c = document.createElement('span');
      c.className = 'cat-count';
      b.append(c);
      return b;
    }));
    $('sndGrid').replaceChildren(...SOUNDS.map(([id, name, , , icon]) => makeTile(id, T(name), icon)));
    $('sndPresets').replaceChildren(...PRESETS.map(([name, mix]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'preset';
      b.textContent = T(name);
      b.addEventListener('click', () => {
        Object.keys(live).forEach(stopSound);
        S.selected = Object.assign({}, mix);
        S.cat = byId[Object.keys(mix)[0]][2];
        save();
        setPlaying(true);
      });
      return b;
    }));
  }

  $('dockToggle').addEventListener('click', () => { S.open = !S.open; save(); render(); });
  $('sndCats').addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-cat]');
    if (!b) return;
    S.cat = b.dataset.cat; save(); render();
  });
  $('sndGrid').addEventListener('click', (ev) => {
    const b = ev.target.closest('.snd-toggle');
    if (!b) return;
    const id = b.closest('.snd').dataset.id;
    if (id in S.selected) {
      delete S.selected[id];
      stopSound(id);
      if (!Object.keys(S.selected).length) playing = false;
    } else {
      S.selected[id] = 0.6;
      playing = true;
      Object.keys(S.selected).forEach(startSound);
    }
    save(); render();
  });
  $('sndGrid').addEventListener('input', (ev) => {
    const v = ev.target;
    if (!v.classList.contains('snd-vol')) return;
    const id = v.closest('.snd').dataset.id;
    S.selected[id] = Number(v.value) / 100;
    setLevel(id);
    save();
  });
  $('sndMaster').addEventListener('input', (ev) => {
    S.master = Number(ev.target.value) / 100;
    if (master) master.gain.setTargetAtTime(S.master, ac.currentTime, 0.08);
    Object.keys(live).forEach(setLevel);
    save();
  });
  $('sndPlay').addEventListener('click', () => setPlaying(!playing));
  $('sndSync').addEventListener('change', (ev) => { S.sync = ev.target.checked; save(); render(); });

  // Follow the focus timer: play during focus, fall quiet on pause and breaks.
  let lastFocus = null;
  window.addEventListener('noon-focus', (ev) => {
    const f = ev.detail;
    const sig = f.mode + '|' + f.running;
    if (sig === lastFocus) return;
    lastFocus = sig;
    if (!S.sync || !Object.keys(S.selected).length) return;
    const want = f.running && f.mode === 'focus';
    if (want !== playing) setPlaying(want);
  });
  // Browsers only start audio after a tap; resume on the first one.
  document.addEventListener('pointerdown', () => { if (ac && ac.state === 'suspended') ac.resume(); });

  // ---- my music controls ----
  const folderBtn = $('musicFolder'), allowBtn = $('musicAllow');
  folderBtn.hidden = !canPickFolder;
  folderBtn.addEventListener('click', async () => {
    try {
      const dir = await window.showDirectoryPicker({ id: 'noon-music', mode: 'read' });
      musicDir = dir;
      allowBtn.hidden = true;
      try { await idbSet('musicDir', dir); } catch (_) { /* remembered for this visit only */ }
      await loadFolder(dir);
    } catch (e) {
      if (e && e.name !== 'AbortError') musicNote(T('تعذّر فتح المجلد. جرّب مرة أخرى أو أضف الملفات يدوياً.'));
    }
  });
  allowBtn.addEventListener('click', async () => {
    if (!musicDir) return;
    try {
      if (await musicDir.requestPermission({ mode: 'read' }) === 'granted') {
        allowBtn.hidden = true;
        await loadFolder(musicDir);
      }
    } catch (_) { musicNote(T('تعذّر فتح المجلد. جرّب مرة أخرى أو أضف الملفات يدوياً.')); }
  });
  $('musicFiles').addEventListener('change', (ev) => {
    for (const f of ev.target.files) {
      if (!f.type.startsWith('audio/') && !AUDIO_EXT.test(f.name)) continue;
      const id = 'music:file/' + f.name + '/' + f.size;
      if (!music.has(id)) music.set(id, { name: prettyName(f.name), file: f });
    }
    ev.target.value = '';
    if (!canPickFolder) musicNote(T('الملفات المضافة بهذه الطريقة تعمل حتى تغلق الصفحة.'));
    buildMusicTiles();
  });
  // Reconnect the remembered folder: silently if permission is still granted,
  // otherwise with one click on "Allow access".
  (async () => {
    if (!canPickFolder) { musicNote(T('هذا المتصفح يسمح بإضافة ملفات فقط، وتعمل حتى تغلق الصفحة.')); return; }
    musicNote('');
    try {
      const dir = await idbGet('musicDir');
      if (!dir) return;
      musicDir = dir;
      if (await dir.queryPermission({ mode: 'read' }) === 'granted') await loadFolder(dir);
      else { allowBtn.hidden = false; allowBtn.textContent = `${T('اسمح بالوصول إلى')} «${dir.name}»`; }
    } catch (_) { /* no remembered folder */ }
  })();

  buildUI();
  render();
})();
