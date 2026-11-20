// ---------- Translated Mushafs: scanned books whose pages turn like paper ----------
// The King Fahd Complex prints (translations of the meanings and Mushaf editions) were turned into
// one WebP image a page by tools/flipbook-convert/convert.py. The list and the covers live under
// mushafs/ (website and app); the pages are hosted apart (too big for the app or GitHub Pages) at
// the address in mushafs/index.json ("pages"), which can change without a new app.
// The pages turn with StPageFlip (js/vendor/page-flip.browser.js, MIT, github.com/Nodlik/StPageFlip):
// a page bends under the finger on a phone, two pages face each other on a wide screen.
// These books open from the right, and StPageFlip curls a page well only when it turns towards the
// left (on a phone, a page brought back from the left comes in flat). So the book is drawn mirrored
// (.fb-mirror), the touches are mirrored to match, and each page is mirrored back to read right:
// StPageFlip's own forward turn becomes this book's forward turn. Only the pages near the open one are loaded;
// a book can be kept on the device (Cache API "flipbook-v1") for reading offline.
(() => {
  'use strict';
  const { T, I, el, button, toast, skeleton, load: loadKey, store, onRemote } = window.noonUI;
  const SITE = 'https://micro4tricks-ai.github.io/muslim-todo-list/';
  const LIST = 'mushafs/';
  const KEY = 'noon-flipbook';
  const CACHE = 'flipbook-v1';
  const NEAR = 6, FAR = 16; // pages loaded around the open one; pages further than FAR are let go
  // This device's own: which books are kept offline.
  let S = { saved: {} };
  try { Object.assign(S, JSON.parse(localStorage.getItem(KEY)) || {}); } catch (_) {}
  const keep = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (_) {} };
  // The reader's own, carried to their other devices (js/sync.js): where each book was left, and
  // the pages marked in it with an optional note.  { places: {id: {p, at}}, marks: {id: [{p, at, note}]} }
  const MKEY = 'noon-sweep-mushafs';
  const readMarks = () => { const m = loadKey(MKEY, {}); m.places = m.places || {}; m.marks = m.marks || {}; return m; };
  let M = readMarks();
  if (S.places) { // the places used to be kept with the device's own data
    if (!Object.keys(M.places).length) M.places = S.places;
    delete S.places;
    keep();
    store(MKEY, M);
  }
  const keepMarks = () => store(MKEY, M);
  const marksOf = (id) => M.marks[id] || [];
  const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.hasAttribute('data-calm');

  // ---- the list ----
  let index = null, listBase = LIST;
  async function loadIndex() {
    if (index) return index;
    // The app asks the website first (books added since the app was built), then its own copy.
    for (const base of window.Capacitor ? [SITE + LIST, LIST] : [LIST]) {
      try {
        const r = await fetch(`${base}index.json`, { cache: 'no-cache' });
        if (r.ok) { index = await r.json(); listBase = base; break; }
      } catch (_) {}
    }
    if (!index) throw new Error('no list');
    return index;
  }
  // "noon-flip-base" in localStorage points at another copy of the pages (for testing one).
  function pagesBase() {
    let b = '';
    try { b = localStorage.getItem('noon-flip-base') || ''; } catch (_) {}
    b = b || (index && index.pages) || '';
    return b && !b.endsWith('/') ? `${b}/` : b;
  }
  const pageUrl = (b, p) => `${pagesBase()}${b.id}/p${String(p).padStart(4, '0')}.webp`;
  const coverUrl = (b) => `${listBase}${b.id}/cover.webp`;
  const langName = (b) => {
    try { const n = new Intl.DisplayNames([I.locale, 'en'], { type: 'language' }).of(b.lang); if (n && n !== b.lang) return n; } catch (_) {}
    return (I.isAr && b.langAr) || b.langName;
  };
  // The file names are not uniform: a translation is named by its language, an Arabic print by its own title.
  const title = (b) => (b.lang === 'ar' ? b.title : `${T('ترجمة معاني القرآن الكريم')}: ${langName(b)}`);
  const sizeText = (n) => (n >= 1e6 ? `${I.num(Math.round(n / 1e6))} ${T('ميجابايت')}` : `${I.num(Math.max(1, Math.round(n / 1e3)))} ${T('كيلوبايت')}`);

  // Three shelves: the Mushaf prints, tafsir and readings, then the translations by language.
  const SHELVES = [
    ['mushaf', 'طبعات المصحف الشريف'],
    ['tafsir', 'التفاسير والقراءات'],
    ['tr', 'ترجمات معاني القرآن الكريم'],
  ];
  const shelfOf = (b) => (b.lang !== 'ar' ? 'tr' : /تفسير|القراءات|غريب|كلمات القرآن/.test(b.title) ? 'tafsir' : 'mushaf');

  // In the Mushaf tab (js/quran.js hands over its root and a back button).
  async function render(root, { back }) {
    const head = el('div', 'view-head');
    head.append(back, el('h2', '', T('مصاحف مترجمة ومصوّرة')));
    root.append(head);
    const wait = skeleton(T('جارٍ تحميل القائمة…'), 3);
    root.append(wait);
    try { await loadIndex(); } catch (_) {
      wait.replaceWith(el('p', 'empty', T('تعذّر تحميل القائمة. تحتاج اتصالاً بالإنترنت أول مرة.')));
      return;
    }
    wait.remove();
    const q = el('input', 'fb-filter');
    q.type = 'search'; q.placeholder = T('ابحث باللغة أو الاسم'); q.setAttribute('aria-label', T('ابحث باللغة أو الاسم'));
    const none = el('p', 'hint', T('لا نتائج. جرّب كلمة أخرى.'));
    none.hidden = true;
    const grid = el('div', 'fb-shelves');
    const cards = [], shelves = [];
    for (const [kind, name] of SHELVES) {
      const books = index.books.filter((b) => shelfOf(b) === kind)
        .sort((a, b) => (kind === 'tr' ? langName(a).localeCompare(langName(b), I.locale) : 0) || a.title.localeCompare(b.title, 'ar') || a.id.localeCompare(b.id));
      if (!books.length) continue;
      const sec = el('section', 'fb-shelf');
      const shelfCards = [];
      const grid1 = el('div', 'fb-grid');
      for (const b of books) {
        const c = button('fb-card', '', () => open(b));
        c.dataset.book = b.id;
        const img = el('img', 'fb-cover');
        img.src = coverUrl(b); img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
        const place = M.places[b.id];
        // On the translations shelf the language is the name; elsewhere the book's own title.
        const name = el('b', '', kind === 'tr' ? langName(b) : b.title);
        name.dir = 'auto'; // an Arabic title reads right to left in any interface
        c.append(img, name, el('span', '', `${I.num(b.pages)} ${T('صفحة')}`));
        if (place) c.append(el('small', 'lib-at', `${T('وقفت عند')} ${T('صفحة')} ${I.num(place.p)}`));
        if (marksOf(b.id).length) c.append(el('small', 'fb-marks', `🔖 ${I.num(marksOf(b.id).length)} ${T('علامات')}`));
        if (S.saved[b.id]) c.append(el('small', 'fb-saved', `✓ ${T('محفوظ للقراءة دون إنترنت')}`));
        grid1.append(c);
        const entry = [c, `${b.title} ${b.langName} ${b.langAr || ''} ${langName(b)} ${title(b)}`.toLowerCase()];
        cards.push(entry); shelfCards.push(entry);
      }
      sec.append(el('h3', 'fb-shelf-name', `${T(name)} (${I.num(books.length)})`), grid1);
      shelves.push([sec, shelfCards]);
      grid.append(sec);
    }
    q.addEventListener('input', () => {
      const s = q.value.trim().toLowerCase();
      let shown = 0;
      cards.forEach(([c, text]) => { c.hidden = !!s && !text.includes(s); if (!c.hidden) shown++; });
      shelves.forEach(([sec, list]) => { sec.hidden = list.every(([c]) => c.hidden); });
      none.hidden = shown > 0;
    });
    root.append(q, grid, none);
    // Back from a book: its card shows the new place and whether it is kept.
    const again = () => { removeEventListener('noon-flipbook-closed', again); if (root.contains(grid)) { root.replaceChildren(); render(root, { back }); } };
    addEventListener('noon-flipbook-closed', again);
    root.append(el('p', 'credit', T('صور صفحات من طبعات مجمع الملك فهد لطباعة المصحف الشريف. اسحب طرف الصفحة لتقليبها، أو استخدم الأزرار تحت الكتاب.')));
  }

  // ---- the reader ----
  const box = el('div', 'fb');
  box.hidden = true;
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  const top = el('div', 'fb-top');
  const xBtn = button('fb-x', '×', () => close(), T('إغلاق'));
  const tTitle = el('b', 'fb-title');
  const saveBtn = button('fb-save', '', () => toggleSave());
  const markBtn = button('fb-tool fb-mark', '🔖', () => toggleMark());
  const listBtn = button('fb-tool', '☰', () => openPanel(), T('العلامات والفهرس'));
  listBtn.title = T('العلامات والفهرس');
  top.append(xBtn, tTitle, markBtn, listBtn, saveBtn);
  const stage = el('div', 'fb-stage');
  const bar = el('div', 'fb-bar');
  const nav = (label, sym, fn) => { const b = button('fb-nav', sym, fn, T(label)); b.title = T(label); return b; };
  // The book reads from the right: forward is to the left.
  const bFirst = nav('الصفحة الأولى', '⇥', () => goPage(1));
  const bPrev = nav('الصفحة السابقة', '→', () => step(-1));
  const count = el('span', 'fb-count');
  count.setAttribute('aria-live', 'polite');
  count.dir = 'ltr'; // "16–17 / 625" must not be reordered by the RTL row
  const bNext = nav('الصفحة التالية', '←', () => step(1));
  const bLast = nav('الصفحة الأخيرة', '⇤', () => goPage(B.pages));
  const range = el('input', 'fb-range');
  range.type = 'range'; range.min = '1'; range.step = '1'; range.dir = 'rtl';
  range.setAttribute('aria-label', T('صفحة'));
  range.addEventListener('input', () => { count.textContent = `${I.num(range.value)} / ${I.num(B.pages)}`; });
  range.addEventListener('change', () => goPage(Number(range.value)));
  // Laid out like the book whatever the page language: its start on the right.
  const row = el('div', 'fb-row');
  row.dir = 'rtl';
  row.append(bFirst, bPrev, count, bNext, bLast);
  bar.append(range, row);
  // Over the book: the marked pages (with their notes) and, for a Mushaf laid out like the Madinah
  // Mushaf, its juz' and surahs by page.
  const panel = el('div', 'fb-panel');
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', T('العلامات والفهرس'));
  box.append(top, stage, bar, panel);
  document.body.append(box);

  let B = null, pf = null, L = 0, pad = 0, imgs = [], urls = new Map(), shown = 1, job = null;
  // Array position <-> page of the book (a blank last when needed).
  const idxOf = (p) => p - 1;
  const pageAt = (i) => i + 1;

  function open(b) {
    if (!pagesBase()) { toast(T('صفحات هذا المصحف لم تُرفع على الإنترنت بعد.')); return; }
    if (!window.St || !window.St.PageFlip) { toast(T('تعذّر فتح الكتاب.')); return; }
    B = b;
    // With showCover the first and last pieces stand alone; an odd count would pair the front cover.
    pad = b.pages % 2;
    L = b.pages + pad;
    tTitle.textContent = title(b);
    box.setAttribute('aria-label', title(b));
    range.max = String(b.pages);
    paintSave();
    panel.hidden = true;
    if (S.sound !== false) { try { loadTurns(); } catch (_) {} }
    box.hidden = false;
    document.body.classList.add('fb-open');
    if (!history.state || !history.state.fb) history.pushState({ fb: 1 }, '');
    build((M.places[b.id] && M.places[b.id].p) || 1);
  }
  function build(at) {
    if (pf) { try { pf.destroy(); } catch (_) {} pf = null; }
    release();
    stage.replaceChildren();
    const book = el('div', 'fb-book');
    const mirror = el('div', 'fb-mirror');
    mirror.append(book);
    stage.append(mirror);
    imgs = [];
    const pages = [];
    for (let i = 0; i < L; i++) {
      const p = pageAt(i);
      const d = el('div', 'fb-page');
      if (p === 1 || p === B.pages || p > B.pages) d.dataset.density = 'hard';
      if (p <= B.pages) {
        d.append(el('span', 'fb-pg-n', I.num(p)));
        const img = el('img');
        img.alt = ''; img.decoding = 'async'; img.draggable = false;
        d.append(img);
        imgs[i] = img;
      } else d.classList.add('fb-blank');
      pages.push(d);
    }
    const quiet = calm();
    pf = new window.St.PageFlip(book, {
      width: B.width, height: B.height, size: 'stretch',
      minWidth: 260, maxWidth: B.width, minHeight: 200, maxHeight: B.height * 2,
      showCover: true, usePortrait: true, mobileScrollSupport: false,
      flippingTime: quiet ? 250 : 750, drawShadow: !quiet, maxShadowOpacity: 0.45,
      startPage: Math.max(0, Math.min(L - 1, idxOf(at))), swipeDistance: 20
    });
    pf.loadFromHTML(pages);
    // The book is drawn mirrored: a touch at its left edge is StPageFlip's right edge.
    const ui = pf.getUI();
    const raw = ui.getMousePos.bind(ui);
    ui.getMousePos = (x, y) => { const q = raw(x, y); q.x = ui.distElement.getBoundingClientRect().width - q.x; return q; };
    // On a phone (one page) StPageFlip finishes a dragged page only once it passes the far edge of
    // the screen, so a page let go before that springs back. Past half the page is enough.
    const fc = pf.flipController;
    if (fc && fc.stopMove) {
      const stop = fc.stopMove.bind(fc);
      fc.stopMove = () => {
        try {
          if (fc.calc && pf.getOrientation() === 'portrait') {
            const at = fc.calc.getPosition(), r = fc.getBoundsRect();
            if (at.x > 0 && at.x < r.pageWidth / 2) {
              fc.animateFlippingTo(at, { x: -r.pageWidth, y: fc.calc.getCorner() === 'bottom' ? r.height : 0 }, true);
              return;
            }
          }
        } catch (_) {}
        stop();
      };
    }
    pf.on('flip', () => update());
    pf.on('changeState', (e) => { if (e.data === 'flipping') rustle(); });
    pf.on('changeOrientation', () => update());
    update();
  }
  // The pages on screen: one on a phone, two facing each other on a wide screen.
  function visible() {
    const i = pf.getCurrentPageIndex();
    const two = pf.getOrientation() === 'landscape' && i > 0 && i < L - 1;
    return [pageAt(i), two ? pageAt(i + 1) : 0].filter((p) => p >= 1 && p <= B.pages).sort((a, b) => a - b);
  }
  function update() {
    if (!pf || !B) return;
    const v = visible();
    shown = v[0] || 1;
    count.textContent = `${v.map(I.num).join('–')} / ${I.num(B.pages)}`;
    range.value = String(shown);
    bFirst.disabled = bPrev.disabled = shown <= 1;
    bLast.disabled = bNext.disabled = v[v.length - 1] >= B.pages;
    M.places[B.id] = { p: shown, at: Date.now() };
    keepMarks();
    paintMark();
    load(pf.getCurrentPageIndex());
  }
  // Load the pages near the open one; let go of those far away (memory on a phone).
  function load(i) {
    imgs.forEach((img, k) => {
      if (!img) return;
      const d = Math.abs(k - i);
      if (d <= NEAR && !img.dataset.on) {
        img.dataset.on = '1';
        const b = B;
        source(b, pageAt(k)).then((src) => { if (B === b && img.dataset.on) img.src = src; });
      } else if (d > FAR && img.dataset.on) {
        delete img.dataset.on;
        img.removeAttribute('src');
        const u = urls.get(img);
        if (u) { URL.revokeObjectURL(u); urls.delete(img); }
      }
    });
  }
  // A kept book's page comes from the device; any other from the network.
  async function source(b, p) {
    const url = pageUrl(b, p);
    if (!S.saved[b.id] || typeof caches === 'undefined') return url;
    try {
      const hit = await (await caches.open(CACHE)).match(url);
      if (hit) return URL.createObjectURL(await hit.blob());
    } catch (_) {}
    return url;
  }
  function release() { urls.forEach((u) => URL.revokeObjectURL(u)); urls.clear(); }
  function step(n) {
    if (!pf) return;
    if (calm()) { const i = pf.getCurrentPageIndex(), k = pf.getOrientation() === 'landscape' ? 2 : 1; pf.turnToPage(Math.max(0, Math.min(L - 1, i + (n > 0 ? k : -k)))); update(); return; }
    if (n > 0) pf.flipNext(); else pf.flipPrev();
  }
  function goPage(p) {
    if (!pf) return;
    const i = Math.max(0, Math.min(L - 1, idxOf(Math.max(1, Math.min(B.pages, p)))));
    pf.turnToPage(i);
    update();
  }
  function close() {
    if (box.hidden) return;
    shut();
    if (history.state && history.state.fb) history.back();
  }
  function shut() {
    box.hidden = true;
    document.body.classList.remove('fb-open');
    if (pf) { try { pf.destroy(); } catch (_) {} pf = null; }
    release();
    stage.replaceChildren();
    imgs = [];
    window.dispatchEvent(new Event('noon-flipbook-closed'));
  }
  addEventListener('popstate', () => { if (!box.hidden && !(history.state && history.state.fb)) shut(); });
  addEventListener('keydown', (ev) => {
    if (box.hidden || ev.target.closest('input, textarea')) return;
    if (ev.key === 'Escape') { if (!panel.hidden) panel.hidden = true; else close(); }
    else if (ev.key === 'ArrowLeft' || ev.key === 'PageDown') { ev.preventDefault(); step(1); }
    else if (ev.key === 'ArrowRight' || ev.key === 'PageUp') { ev.preventDefault(); step(-1); }
    else if (ev.key === 'Home') goPage(1);
    else if (ev.key === 'End') goPage(B.pages);
  });

  // ---- the sound of a paper page turning ----
  // Real recordings of a book's page turning (sounds/page-turn, CC0, kenney.nl), loaded once and
  // played through Web Audio so a quick run of turns overlaps naturally. Each turn picks one and
  // varies its pitch a little, so no two sound quite alike. On by default; off in the ☰ panel.
  const TURNS = [['sounds/page-turn/page-turn-1.wav', 0.55], ['sounds/page-turn/page-turn-2.wav', 1]];
  let ac = null, turns = null;
  function loadTurns() {
    if (turns) return turns;
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    const get = async ([path, gain]) => {
      for (const base of window.Capacitor ? ['', SITE] : ['']) {
        try {
          const r = await fetch(base + path);
          if (r.ok) return { buf: await ac.decodeAudioData(await r.arrayBuffer()), gain };
        } catch (_) {}
      }
      return null;
    };
    turns = Promise.all(TURNS.map(get)).then((l) => l.filter(Boolean));
    return turns;
  }
  async function rustle() {
    if (S.sound === false) return;
    try {
      const list = await loadTurns();
      if (!list.length) return;
      if (ac.state === 'suspended') await ac.resume();
      const t = list[Math.random() < 0.7 ? 0 : list.length - 1];
      const src = ac.createBufferSource();
      src.buffer = t.buf;
      src.playbackRate.value = 0.94 + Math.random() * 0.12;
      const g = ac.createGain();
      g.gain.value = t.gain * 0.8;
      src.connect(g).connect(ac.destination);
      src.start();
    } catch (_) { /* no sound on this device */ }
  }

  // ---- marks: the reader marks a page (where they stopped, a page to come back to) ----
  // On a wide screen two pages show; a mark on either of them counts as here.
  function markedHere() { const v = visible(); return marksOf(B.id).find((m) => v.includes(m.p)); }
  function paintMark() {
    if (!B || !pf) return;
    const on = !!markedHere();
    markBtn.classList.toggle('is-on', on);
    markBtn.setAttribute('aria-pressed', String(on));
    const label = on ? T('إزالة العلامة') : T('علامة على هذه الصفحة');
    markBtn.title = label;
    markBtn.setAttribute('aria-label', label);
  }
  function dropMark(id, m) {
    M.marks[id] = marksOf(id).filter((x) => x !== m);
    if (!M.marks[id].length) delete M.marks[id];
  }
  function toggleMark() {
    if (!B || !pf) return;
    const m = markedHere();
    if (m) dropMark(B.id, m);
    else {
      const p = shown;
      M.marks[B.id] = marksOf(B.id).concat({ p, at: Date.now(), note: '' }).sort((a, b) => a.p - b.p);
      toast(`🔖 ${T('وُضعت علامة على صفحة')} ${I.num(p)}`, { label: T('أضف ملاحظة'), run: () => openPanel(p) });
    }
    keepMarks();
    paintMark();
    if (window.noonBuzz) window.noonBuzz(12);
  }
  // Books whose pages are the Madinah Mushaf's 604 pages (checked against the page images), so
  // the page of each surah and juz' is known from js/quran-meta.js.
  const MADINAH = new Set(['madinah-hafs-1441']);
  function quranIndex(Q) {
    const bs = (arr, i) => { let lo = 0, hi = arr.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (arr[mid] <= i) lo = mid; else hi = mid - 1; } return lo; };
    const surahs = [];
    let at = 0;
    Q.surahs.forEach((s, k) => { surahs.push({ k, p: bs(Q.pages, at) + 1 }); at += s[4]; });
    return { surahs, juz: Q.juz.map((i, j) => ({ j: j + 1, p: bs(Q.pages, i) + 1 })) };
  }
  const surahName = (Q, k) => (I.surah && I.surah(k)) || (I.latin ? Q.surahs[k][1] : Q.surahs[k][0].replace(/^سُورَةُ\s*/, ''));
  function openPanel(notePage) {
    fillPanel();
    panel.hidden = false;
    const f = panel.querySelector(notePage ? `[data-note="${notePage}"]` : '.fb-panel-x');
    if (f) f.focus();
  }
  function jump(p) { panel.hidden = true; goPage(p); }
  function fillPanel() {
    if (!B) return;
    panel.replaceChildren();
    const head = el('div', 'fb-panel-head');
    head.append(el('b', '', T('العلامات والفهرس')), button('fb-panel-x', '×', () => { panel.hidden = true; }, T('إغلاق')));
    const snd = el('label', 'fb-opt');
    const sw = el('input');
    sw.type = 'checkbox'; sw.checked = S.sound !== false;
    sw.addEventListener('change', () => { S.sound = sw.checked; keep(); if (sw.checked) rustle(); });
    snd.append(sw, el('span', '', T('صوت تقليب الصفحات')));
    panel.append(head, snd, el('h3', '', `🔖 ${T('علاماتي')}`));
    const marks = marksOf(B.id);
    if (!marks.length) panel.append(el('p', 'fb-hint', T('لا علامات بعد. اضغط 🔖 أعلى الشاشة لتعلّم الصفحة التي وقفت عندها أو تريد الرجوع إليها.')));
    for (const m of marks) {
      const row = el('div', 'fb-mk');
      const go = button('fb-mk-go', '', () => jump(m.p));
      go.append(el('b', '', `${T('صفحة')} ${I.num(m.p)}`), el('small', '', new Date(m.at).toLocaleDateString(I.locale, { day: 'numeric', month: 'short', year: 'numeric' })));
      const note = el('input', 'fb-mk-note');
      note.type = 'text'; note.maxLength = 200; note.value = m.note || ''; note.dir = 'auto';
      note.placeholder = T('ملاحظة (اختياري)');
      note.setAttribute('aria-label', `${T('ملاحظة (اختياري)')} · ${T('صفحة')} ${I.num(m.p)}`);
      note.dataset.note = String(m.p);
      note.addEventListener('change', () => { m.note = note.value.trim(); keepMarks(); });
      const del = button('fb-mk-x', '×', () => { dropMark(B.id, m); keepMarks(); paintMark(); fillPanel(); }, `${T('حذف العلامة')} · ${T('صفحة')} ${I.num(m.p)}`);
      row.append(go, note, del);
      panel.append(row);
    }
    const Q = window.NOON_QURAN_META;
    if (MADINAH.has(B.id) && Q && B.pages === 604) {
      const ix = quranIndex(Q);
      panel.append(el('h3', '', T('الأجزاء')));
      const jg = el('div', 'fb-ix fb-ix-juz');
      ix.juz.forEach(({ j, p }) => jg.append(button('fb-ix-j', I.num(j), () => jump(p), `${T('الجزء')} ${I.num(j)} · ${T('صفحة')} ${I.num(p)}`)));
      panel.append(jg, el('h3', '', T('السور')));
      const sg = el('div', 'fb-ix');
      ix.surahs.forEach(({ k, p }) => {
        const b = button('fb-ix-s', '', () => jump(p));
        const n = el('b', '', surahName(Q, k));
        n.dir = 'auto';
        b.append(el('span', 'fb-ix-n', I.num(k + 1)), n, el('small', '', I.num(p)));
        sg.append(b);
      });
      panel.append(sg);
    }
  }
  onRemote(MKEY, () => { M = readMarks(); if (B) { paintMark(); if (!panel.hidden) fillPanel(); } });

  // ---- keeping a book for reading offline ----
  function paintSave() {
    if (!B) return;
    saveBtn.disabled = typeof caches === 'undefined';
    // Short on the bar (the title needs the room); the whole sentence for screen readers and on hover.
    let label;
    if (job && job.id === B.id) { label = T('جارٍ التنزيل…'); saveBtn.textContent = `⤓ ${I.pct(Math.floor((job.done / B.pages) * 100))}`; }
    else if (S.saved[B.id]) { label = T('محفوظ للقراءة دون إنترنت'); saveBtn.textContent = '✓'; }
    else { label = `${T('تنزيل للقراءة دون إنترنت')} (${sizeText(B.bytes)})`; saveBtn.textContent = `⤓ ${sizeText(B.bytes)}`; }
    saveBtn.title = label;
    saveBtn.setAttribute('aria-label', label);
  }
  function toggleSave() {
    if (!B) return;
    if (job) {
      if (job.id === B.id) { job.stop = true; return; }
      toast(T('ينتظر تنزيل مصحف آخر حتى ينتهي.'));
      return;
    }
    if (S.saved[B.id]) {
      const b = B;
      toast(T('محفوظ للقراءة دون إنترنت'), { label: T('حذف النسخة المحفوظة'), run: () => forget(b) });
      return;
    }
    save(B);
  }
  async function save(b) {
    const cache = await caches.open(CACHE);
    job = { id: b.id, done: 0, stop: false };
    paintSave();
    let next = 1, failed = 0;
    const worker = async () => {
      while (next <= b.pages && !job.stop) {
        const p = next++;
        const url = pageUrl(b, p);
        try {
          if (!(await cache.match(url))) {
            const r = await fetch(url, { mode: 'cors' });
            if (!r.ok) throw new Error(r.status);
            await cache.put(url, r);
          }
        } catch (_) { failed++; if (failed > 20) job.stop = true; }
        job.done++;
        if (job.done % 10 === 0 && B && B.id === b.id) paintSave();
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    const whole = !job.stop && failed === 0;
    job = null;
    if (whole) { S.saved[b.id] = 1; keep(); toast(T('تمّ التنزيل.')); if (box.hidden) window.dispatchEvent(new Event('noon-flipbook-closed')); }
    else toast(T('توقّف التنزيل. اضغط مرة أخرى لإكماله.'));
    paintSave();
  }
  async function forget(b) {
    delete S.saved[b.id];
    keep();
    try {
      const c = await caches.open(CACHE);
      for (let p = 1; p <= b.pages; p++) await c.delete(pageUrl(b, p));
    } catch (_) {}
    paintSave();
  }

  window.noonFlipbook = { render, open: (id) => loadIndex().then(() => { const b = index.books.find((x) => x.id === id); if (b) open(b); }) };
})();
