// ---------- Translated Mushafs: scanned books whose pages turn like paper ----------
// The King Fahd Complex prints (translations of the meanings and Mushaf editions) were turned into
// one WebP image a page by tools/flipbook-convert/convert.py. The list and the covers live under
// mushafs/ (website and app); the pages are hosted apart (too big for the app or GitHub Pages) at
// the address in mushafs/index.json ("pages"), which can change without a new app.
// The pages turn with StPageFlip (js/vendor/page-flip.browser.js, MIT, github.com/Nodlik/StPageFlip):
// a page bends under the finger on a phone, two pages face each other on a wide screen.
// These books open from the right, and StPageFlip only turns left to right, so the pages are given
// to it in reverse and the book opens at its end. Only the pages near the open one are loaded;
// a book can be kept on the device (Cache API "flipbook-v1") for reading offline.
(() => {
  'use strict';
  const { T, I, el, button, toast, skeleton } = window.noonUI;
  const SITE = 'https://micro4tricks-ai.github.io/muslim-todo-list/';
  const LIST = 'mushafs/';
  const KEY = 'noon-flipbook';
  const CACHE = 'flipbook-v1';
  const NEAR = 6, FAR = 16; // pages loaded around the open one; pages further than FAR are let go
  let S = { places: {}, saved: {} };
  try { Object.assign(S, JSON.parse(localStorage.getItem(KEY)) || {}); } catch (_) {}
  const keep = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (_) {} };
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
        const place = S.places[b.id];
        // On the translations shelf the language is the name; elsewhere the book's own title.
        const name = el('b', '', kind === 'tr' ? langName(b) : b.title);
        name.dir = 'auto'; // an Arabic title reads right to left in any interface
        c.append(img, name, el('span', '', `${I.num(b.pages)} ${T('صفحة')}`));
        if (place) c.append(el('small', 'lib-at', `${T('وقفت عند')} ${T('صفحة')} ${I.num(place.p)}`));
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
  top.append(xBtn, tTitle, saveBtn);
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
  box.append(top, stage, bar);
  document.body.append(box);

  let B = null, pf = null, L = 0, pad = 0, imgs = [], urls = new Map(), shown = 1, job = null;
  // Array position <-> page of the book (the array is reversed, with a blank first when needed).
  const idxOf = (p) => L - p;
  const pageAt = (i) => L - i;

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
    box.hidden = false;
    document.body.classList.add('fb-open');
    if (!history.state || !history.state.fb) history.pushState({ fb: 1 }, '');
    build((S.places[b.id] && S.places[b.id].p) || 1);
  }
  function build(at) {
    if (pf) { try { pf.destroy(); } catch (_) {} pf = null; }
    release();
    stage.replaceChildren();
    const book = el('div', 'fb-book');
    stage.append(book);
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
    pf.on('flip', () => update());
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
    S.places[B.id] = { p: shown, at: Date.now() };
    keep();
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
    // Forward is the array's way back.
    if (calm()) { const i = pf.getCurrentPageIndex(); pf.turnToPage(Math.max(0, Math.min(L - 1, n > 0 ? i - (pf.getOrientation() === 'landscape' ? 2 : 1) : i + (pf.getOrientation() === 'landscape' ? 2 : 1)))); update(); return; }
    if (n > 0) pf.flipPrev(); else pf.flipNext();
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
    if (ev.key === 'Escape') close();
    else if (ev.key === 'ArrowLeft' || ev.key === 'PageDown') { ev.preventDefault(); step(1); }
    else if (ev.key === 'ArrowRight' || ev.key === 'PageUp') { ev.preventDefault(); step(-1); }
    else if (ev.key === 'Home') goPage(1);
    else if (ev.key === 'End') goPage(B.pages);
  });

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
