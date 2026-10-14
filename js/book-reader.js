// ---------- The book reader: a whole Shamela book on one scrolling page, like a PDF viewer ----------
// Opened from the library (js/library.js hands over its files and saved state through
// noonLibrary._data). The book's parts load as you scroll either way, so it reads as one document;
// a page bar on the side jumps anywhere; search runs through the whole book and marks the words;
// selected text can be copied (with its source), highlighted in three colours, given a note or
// shared; pages can be bookmarked; the place is kept to the line and reopens there. Each book can be
// kept on the phone for reading offline, or saved as a text file, whole or in part.
(() => {
  'use strict';
  const { T, I, el, button, toast } = window.noonUI;
  const D = () => window.noonLibrary && window.noonLibrary._data;
  const LOOK_KEY = 'noon-book-look';
  const FONTS = [['amiri', 'أميري', '"Amiri", "Noto Naskh Arabic", serif'], ['naskh', 'النسخ', '"Noto Naskh Arabic", "Amiri", serif'], ['plex', 'بلكس', '"IBM Plex Sans Arabic", "Noto Naskh Arabic", sans-serif']];
  const THEMES = [['paper', 'فاتح'], ['sepia', 'ورقي'], ['night', 'ليلي']];
  const COLORS = ['gold', 'green', 'rose'];
  let look = { size: 21, font: 'amiri', lh: 2, theme: 'paper' };
  try { Object.assign(look, JSON.parse(localStorage.getItem(LOOK_KEY)) || {}); } catch (_) {}
  const keepLook = () => { try { localStorage.setItem(LOOK_KEY, JSON.stringify(look)); } catch (_) {} };

  const ICONS = {
    close: 'M6 6l12 12M18 6L6 18',
    search: 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM15.5 15.5L20 20',
    mark: 'M7 4h10v16l-5-3.5L7 20z',
    list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
    look: 'M4 19L9 5l5 14M6 14h6M15 19l3-8 3 8M16 16.5h4',
    more: 'M12 5h.01M12 12h.01M12 19h.01',
    up: 'M6 15l6-6 6 6', down: 'M6 9l6 6 6-6',
    copy: 'M9 9h10v11H9zM5 15V4h10',
    note: 'M5 4h14v12l-4 4H5zM15 16v4M15 16h4',
    share: 'M12 3v12M7 8l5-5 5 5M5 14v6h14v-6'
  };
  function icon(name) {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true');
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', ICONS[name]); p.setAttribute('fill', 'none'); p.setAttribute('stroke', 'currentColor');
    p.setAttribute('stroke-width', '1.9'); p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round');
    s.append(p);
    return s;
  }
  const iconBtn = (name, label, run, cls = '') => { const b = button(`br-ic ${cls}`, '', run, T(label)); b.title = T(label); b.append(icon(name)); return b; };

  // ---- the screen ----
  const box = el('div', 'br');
  box.hidden = true;
  box.dir = 'rtl';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  const top = el('header', 'br-top');
  const tTitle = el('b'), tMeta = el('span');
  const titleBox = el('div', 'br-title'); titleBox.append(tTitle, tMeta);
  const markBtn = iconBtn('mark', 'علامة على هذه الصفحة', () => toggleBookmark(), 'br-markbtn');
  top.append(iconBtn('close', 'إغلاق الكتاب', () => close()), titleBox,
    iconBtn('search', 'ابحث في الكتاب', () => openSearch()), markBtn,
    iconBtn('list', 'الفهرس وعلاماتي', () => openDrawer()), iconBtn('look', 'شكل القراءة', () => openLook()), iconBtn('more', 'المزيد', () => openMenu()));
  // Search: the box, the way between results, and the list.
  const sBar = el('form', 'br-search'); sBar.hidden = true;
  const sIn = el('input'); sIn.type = 'search'; sIn.placeholder = T('ابحث في الكتاب كله'); sIn.setAttribute('aria-label', T('ابحث في الكتاب كله'));
  const sCount = el('span', 'br-scount');
  const sPrev = iconBtn('up', 'النتيجة السابقة', () => stepHit(-1)), sNext = iconBtn('down', 'النتيجة التالية', () => stepHit(1));
  const sGo = button('btn btn-primary br-sgo', T('بحث')); sGo.type = 'submit';
  sBar.append(sIn, sGo, sCount, sPrev, sNext, iconBtn('close', 'إغلاق البحث', () => closeSearch()));
  const sList = el('div', 'br-results'); sList.hidden = true;
  const body = el('div', 'br-body');
  body.tabIndex = -1;
  const doc = el('div', 'br-doc');
  doc.lang = 'ar';
  body.append(doc);
  // The page bar: drag it to any page of the book.
  const rail = el('div', 'br-rail');
  rail.setAttribute('role', 'slider');
  rail.setAttribute('aria-label', T('شريط الصفحات'));
  rail.tabIndex = 0;
  const thumb = el('span', 'br-thumb'), bubble = el('span', 'br-bubble');
  bubble.hidden = true;
  rail.append(thumb, bubble);
  const foot = el('div', 'br-foot');
  const fText = el('span');
  const fBar = el('span', 'br-prog'), fFill = el('i'); fBar.append(fFill);
  foot.append(fText, fBar);
  // Selected text: copy, highlight, note, share, search.
  const selBar = el('div', 'br-selbar'); selBar.hidden = true;
  const selBtn = (name, label, run) => { const b = button('br-selb', '', run); b.append(icon(name), el('span', '', T(label))); return b; };
  selBar.append(selBtn('copy', 'نسخ', () => copySel()),
    ...COLORS.map((c) => { const b = button(`br-dot is-${c}`, '', () => highlightSel(c), T('تظليل')); b.title = T('تظليل'); return b; }),
    selBtn('note', 'ملاحظة', () => noteSel()), selBtn('share', 'مشاركة', () => shareSel()), selBtn('search', 'بحث', () => searchSel()));
  const veil = el('div', 'br-veil'); veil.hidden = true;
  const sheet = el('div', 'br-sheet'); sheet.hidden = true;
  box.append(top, sBar, sList, body, rail, foot, selBar, veil, sheet);
  document.body.append(box);

  // ---- state ----
  let B = null;          // the book (library meta, with fc = pages in each file)
  let base = [];         // ordinal of each file's first page
  const parts = new Map(); // file -> { el, pages }
  const data = new Map();  // file -> its pages (kept after the part leaves the screen, for labels and search)
  let pageEls = [];      // the pages on screen, in order
  let loading = null, cur = { ord: 0 }, hits = [], hitAt = -1, toc = [];
  const S = () => D().state();
  const ordOf = (f, k) => base[f] + k;
  function fileOfOrd(o) { let f = 0; while (f < B.files - 1 && base[f + 1] <= o) f++; return f; }

  // ---- open and close ----
  function open(slug, opts = {}) {
    const d = D();
    const b = d && d.shelfBook(slug);
    if (!b) return;
    if (!b.fc) b.fc = Array.from({ length: b.files }, (_, f) => (f === b.files - 1 ? b.pages - Math.floor(b.pages / b.files) * (b.files - 1) : Math.floor(b.pages / b.files)));
    B = b;
    base = []; let acc = 0; b.fc.forEach((n) => { base.push(acc); acc += n; });
    parts.clear(); data.clear(); doc.replaceChildren(); pageEls = []; hits = []; hitAt = -1; toc = [];
    closeSearch(); closeSheet(); selBar.hidden = true;
    tTitle.textContent = I.isEn ? b.en : b.ar;
    tMeta.textContent = '';
    applyLook();
    box.hidden = false;
    box.classList.remove('is-calm');
    fitRail();
    document.body.classList.add('br-open');
    if (!history.state || !history.state.br) history.pushState({ br: 1 }, '');
    d.gz(`${slug}/index.json.gz`, b.v).then((idx) => { if (B === b) toc = idx.toc || []; }).catch(() => {});
    // Where to: a heading, a page, the saved place, or the start.
    const place = (S().books || {})[slug];
    let at;
    if (opts.toc) at = { f: opts.f || 0, toc: opts.toc };
    else if (opts.page) at = { f: opts.f || 0, page: opts.page };
    else if ((opts.resume || opts.f === undefined) && place) at = { f: place.f || 0, page: place.p, off: place.off || 0 };
    else at = { f: opts.f || 0 };
    // From a search result on the book's page: the same search here, at that result, its words marked.
    jump(at).then(async () => {
      if (!opts.q) return;
      sIn.value = opts.q; openSearch(true);
      await runSearch();
      const k = hits.findIndex((h) => h.page === opts.page);
      if (k >= 0) goHit(k); else sList.hidden = true;
    });
  }
  function close() {
    if (box.hidden) return;
    savePlace(true);
    box.hidden = true;
    document.body.classList.remove('br-open');
    if (history.state && history.state.br) history.back();
  }
  addEventListener('popstate', () => { if (!box.hidden && !(history.state && history.state.br)) { savePlace(true); box.hidden = true; document.body.classList.remove('br-open'); } });

  // ---- the parts on screen ----
  async function part(f) {
    if (data.has(f)) return data.get(f);
    const pages = await D().gz(`${B.slug}/${f}.json.gz`, B.v);
    data.set(f, pages);
    return pages;
  }
  function build(f, pages) {
    const sec = el('section', 'br-part');
    sec.dataset.f = String(f);
    pages.forEach((pg, k) => {
      const p = el('article', 'br-pg');
      p.dataset.page = String(pg[0]);
      p.dataset.ord = String(ordOf(f, k));
      let i = 0;
      pg[3].forEach((x) => {
        const n = typeof x === 'string' ? el('p', '', x) : el('h3', 'br-h', x[1]);
        if (typeof x !== 'string') n.dataset.toc = String(x[0]);
        n.dataset.i = String(i++);
        p.append(n);
      });
      const lbl = D().pageLabel(pg);
      p.append(el('div', 'br-pgn', `${lbl ? `${lbl} · ` : ''}${I.num(ordOf(f, k) + 1)}`));
      paintMarks(p, f);
      sec.append(p);
    });
    return sec;
  }
  const refreshEls = () => { pageEls = [...doc.querySelectorAll('.br-pg')]; };
  async function load(f, where) {
    if (parts.has(f) || f < 0 || f >= B.files) return;
    const b = B;
    const pages = await part(f);
    if (B !== b || parts.has(f)) return;
    const sec = build(f, pages);
    if (where === 'before') {
      const h0 = body.scrollHeight, t0 = body.scrollTop;
      doc.prepend(sec);
      body.scrollTop = t0 + (body.scrollHeight - h0); // the text being read stays where it is
    } else doc.append(sec);
    parts.set(f, { el: sec, pages });
    refreshEls();
    trim(f);
  }
  // At most three parts on screen: the farthest from where you read leaves.
  function trim() {
    if (parts.size <= 3) return;
    const keep = cur.f !== undefined ? cur.f : fileOfOrd(cur.ord);
    const far = [...parts.keys()].sort((a, b) => Math.abs(b - keep) - Math.abs(a - keep))[0];
    const p = parts.get(far);
    if (Number(p.el.dataset.f) < keep) { const h = p.el.offsetHeight; p.el.remove(); body.scrollTop -= h; } else p.el.remove();
    parts.delete(far);
    refreshEls();
  }
  // Go to a place: { f, page, toc, off } or { ord, off }.
  async function jump(at) {
    if (!B) return;
    const b = B;
    let f = at.ord !== undefined ? fileOfOrd(at.ord) : Math.max(0, Math.min(B.files - 1, at.f || 0));
    if (!parts.has(f)) {
      doc.replaceChildren(); parts.clear();
      doc.replaceChildren(el('div', 'br-wait', T('جارٍ التحميل…')));
      let pages;
      try { pages = await part(f); } catch (_) {
        if (B === b) doc.replaceChildren(el('p', 'br-wait', T('تعذّر تحميل هذا الجزء. القراءة أول مرة تحتاج اتصالاً بالإنترنت.')));
        return;
      }
      if (B !== b) return;
      doc.replaceChildren();
      const sec = build(f, pages);
      doc.append(sec);
      parts.set(f, { el: sec, pages });
      refreshEls();
    }
    let target = null;
    const secEl = parts.get(f).el;
    if (at.toc) target = secEl.querySelector(`.br-h[data-toc="${at.toc}"]`);
    if (!target && at.page) target = secEl.querySelector(`.br-pg[data-page="${at.page}"]`);
    if (!target && at.ord !== undefined) target = secEl.querySelector(`.br-pg[data-ord="${at.ord}"]`);
    const pg = target ? target.closest('.br-pg') : secEl.querySelector('.br-pg');
    if (pg) {
      const y = (target || pg).offsetTop + (at.off && !at.toc ? at.off * pg.offsetHeight : 0);
      body.scrollTop = Math.max(0, y - 8);
    } else body.scrollTop = 0;
    cur = { ord: pg ? Number(pg.dataset.ord) : base[f], f };
    onScroll();
    // Neighbours, so scrolling on either side never waits.
    setTimeout(() => { if (B === b) fill(); }, 120);
  }
  function fill() {
    if (!B || loading) return;
    const nearTop = body.scrollTop < 1500, nearEnd = body.scrollHeight - body.scrollTop - body.clientHeight < 2200;
    const fs = [...parts.keys()];
    if (!fs.length) return;
    const first = Math.min(...fs), last = Math.max(...fs);
    let job = null;
    if (nearEnd && last < B.files - 1) job = load(last + 1, 'after');
    else if (nearTop && first > 0) job = load(first - 1, 'before');
    if (job) { loading = job.catch(() => {}).finally(() => { loading = null; fill(); }); }
  }

  // ---- where you are ----
  function pageAtTop() {
    if (!pageEls.length) return null;
    const y = body.scrollTop + 24;
    let lo = 0, hi = pageEls.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (pageEls[mid].offsetTop <= y) lo = mid; else hi = mid - 1; }
    return pageEls[lo];
  }
  let saveT = 0, railT = 0, ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      if (!B) return;
      const pg = pageAtTop();
      if (pg) {
        cur = { ord: Number(pg.dataset.ord), f: Number(pg.closest('.br-part').dataset.f), page: Number(pg.dataset.page), el: pg };
        cur.off = Math.max(0, Math.min(1, (body.scrollTop + 24 - pg.offsetTop) / Math.max(1, pg.offsetHeight)));
        showPlace();
      }
      fill();
      clearTimeout(saveT); saveT = setTimeout(() => savePlace(), 700);
    });
  }
  body.addEventListener('scroll', () => { onScroll(); if (!dragging) { box.classList.add('is-moving'); clearTimeout(railT); railT = setTimeout(() => box.classList.remove('is-moving'), 1400); } }, { passive: true });
  function showPlace() {
    const n = B.pages, o = cur.ord;
    const pgData = (data.get(cur.f) || [])[o - base[cur.f]];
    const lbl = pgData ? D().pageLabel(pgData) : '';
    tMeta.textContent = `${T('صفحة')} ${I.num(o + 1)} ${T('من')} ${I.num(n)}${lbl ? ` · ${lbl}` : ''}`;
    fText.textContent = `${headingAt() || ''}`;
    const frac = n > 1 ? o / (n - 1) : 0;
    fFill.style.width = `${Math.round(frac * 100)}%`;
    rail.setAttribute('aria-valuemin', '1'); rail.setAttribute('aria-valuemax', String(n)); rail.setAttribute('aria-valuenow', String(o + 1));
    rail.setAttribute('aria-valuetext', tMeta.textContent);
    if (!dragging) placeThumb(frac);
    const on = bookmarks().some((m) => m.p === cur.page);
    markBtn.classList.toggle('is-on', on);
    markBtn.setAttribute('aria-pressed', String(on));
  }
  // The heading of the part being read: the last one above the top of the screen.
  function headingAt() { const h = headingEl(); return h ? h.textContent : ''; }
  function headingEl() {
    if (!cur.el) return null;
    const hs = doc.querySelectorAll('.br-h');
    let last = null;
    const y = body.scrollTop + 30;
    for (const h of hs) { if (h.offsetTop <= y) last = h; else break; }
    return last;
  }
  function savePlace(now) {
    if (!B || !cur.page) return;
    const d = D(), st = d.state();
    const pgData = (data.get(cur.f) || [])[cur.ord - base[cur.f]];
    st.books = st.books || {};
    st.books[B.slug] = { f: cur.f, p: cur.page, off: Math.round((cur.off || 0) * 1000) / 1000, ord: cur.ord, at: Date.now(),
      label: `${T('صفحة')} ${I.num(cur.ord + 1)} ${T('من')} ${I.num(B.pages)}${pgData && d.pageLabel(pgData) ? ` · ${d.pageLabel(pgData)}` : ''}` };
    if (now) clearTimeout(saveT);
    d.save();
  }

  // ---- the page bar ----
  // It runs between the top bar and the bottom line, whatever their height.
  function fitRail() { rail.style.top = box.classList.contains('is-calm') ? '' : `${top.offsetHeight + (sBar.hidden ? 0 : sBar.offsetHeight)}px`; }
  addEventListener('resize', () => { if (!box.hidden) { fitRail(); showPlace(); } });
  let dragging = false;
  function placeThumb(frac) {
    const h = rail.clientHeight - thumb.offsetHeight;
    thumb.style.transform = `translateY(${Math.round(frac * Math.max(0, h))}px)`;
  }
  function ordAtY(y) {
    const r = rail.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (y - r.top - thumb.offsetHeight / 2) / Math.max(1, r.height - thumb.offsetHeight)));
    return { frac, ord: Math.round(frac * (B.pages - 1)) };
  }
  function bubbleFor(o, frac) {
    const f = fileOfOrd(o), pg = (data.get(f) || [])[o - base[f]];
    const lbl = pg ? D().pageLabel(pg) : '';
    bubble.textContent = `${I.num(o + 1)} / ${I.num(B.pages)}${lbl ? ` · ${lbl}` : ''}`;
    bubble.hidden = false;
    const h = rail.clientHeight - thumb.offsetHeight;
    bubble.style.transform = `translateY(${Math.round(frac * Math.max(0, h))}px)`;
  }
  rail.addEventListener('pointerdown', (ev) => {
    if (!B) return;
    dragging = true;
    rail.setPointerCapture(ev.pointerId);
    box.classList.add('is-dragging');
    const { frac, ord } = ordAtY(ev.clientY);
    placeThumb(frac); bubbleFor(ord, frac);
    ev.preventDefault();
  });
  rail.addEventListener('pointermove', (ev) => {
    if (!dragging) return;
    const { frac, ord } = ordAtY(ev.clientY);
    placeThumb(frac); bubbleFor(ord, frac);
  });
  const endDrag = (ev) => {
    if (!dragging) return;
    dragging = false;
    box.classList.remove('is-dragging');
    bubble.hidden = true;
    const { ord } = ordAtY(ev.clientY);
    jump({ ord });
  };
  rail.addEventListener('pointerup', endDrag);
  rail.addEventListener('pointercancel', () => { dragging = false; bubble.hidden = true; box.classList.remove('is-dragging'); showPlace(); });
  rail.addEventListener('keydown', (ev) => {
    const step = { ArrowUp: -1, ArrowDown: 1, PageUp: -10, PageDown: 10, Home: -1e9, End: 1e9 }[ev.key];
    if (step === undefined || !B) return;
    ev.preventDefault();
    jump({ ord: Math.max(0, Math.min(B.pages - 1, cur.ord + step)) });
  });

  // ---- search ----
  // The text without diacritics, with each letter's place in the original (to mark the words found).
  function folded(t) {
    const d = D(), out = [], map = [];
    let space = false;
    for (let i = 0; i < t.length; i++) {
      let ch = t[i];
      if (d.MARKS.test(ch)) { d.MARKS.lastIndex = 0; continue; }
      d.MARKS.lastIndex = 0;
      if (/[أإآٱ]/.test(ch)) ch = 'ا'; else if (ch === 'ى') ch = 'ي'; else if (ch === 'ة') ch = 'ه';
      if (/\s/.test(ch)) { if (space) continue; ch = ' '; space = true; } else space = false;
      out.push(ch); map.push(i);
    }
    return { s: out.join(''), map };
  }
  const fold = (t) => folded(t).s;
  function openSearch(keep) {
    sBar.hidden = false;
    if (!keep) { sIn.focus(); sIn.select(); }
    box.classList.add('is-search');
    fitRail();
  }
  function closeSearch() {
    sBar.hidden = true; sList.hidden = true;
    box.classList.remove('is-search');
    doc.querySelectorAll('mark.br-hit').forEach(unwrap);
    hits = []; hitAt = -1; sCount.textContent = '';
    fitRail();
  }
  let searchRun = 0;
  sBar.addEventListener('submit', (ev) => { ev.preventDefault(); runSearch(); });
  async function runSearch() {
    const needle = fold(sIn.value.trim()).trim();
    if (needle.length < 2 || !B) return;
    const run = ++searchRun, b = B;
    hits = []; hitAt = -1;
    sList.style.top = `${sBar.getBoundingClientRect().bottom - box.getBoundingClientRect().top}px`;
    sList.hidden = false;
    sList.replaceChildren(el('p', 'br-wait', T('جارٍ البحث…')));
    for (let f = 0; f < b.files && hits.length < 300; f++) {
      let pages;
      try { pages = await part(f); } catch (_) { if (run === searchRun) sList.replaceChildren(el('p', 'br-wait', T('البحث يحتاج اتصالاً بالإنترنت أول مرة.'))); return; }
      if (run !== searchRun || B !== b) return;
      pages.forEach((pg, k) => pg[3].forEach((x, i) => {
        const t = typeof x === 'string' ? x : x[1];
        const F = folded(t);
        let at = F.s.indexOf(needle);
        while (at >= 0 && hits.length < 300) {
          hits.push({ f, page: pg[0], ord: ordOf(f, k), i, t, s: F.map[at], e: F.map[at + needle.length - 1] + 1, lbl: D().pageLabel(pg) });
          at = F.s.indexOf(needle, at + needle.length);
        }
      }));
      sCount.textContent = `${I.num(hits.length)}…`;
    }
    if (run !== searchRun) return;
    sCount.textContent = hits.length ? `${I.num(hits.length)}${hits.length === 300 ? '+' : ''}` : '';
    sList.replaceChildren(el('p', 'br-rhead', hits.length ? `${I.num(hits.length)}${hits.length === 300 ? '+' : ''} ${T('نتيجة')} · ${T('اضغط نتيجة لتنتقل إليها')}` : T('لا نتائج. جرّب كلمة أخرى.')));
    hits.forEach((h, k) => {
      const r = button('br-hitrow', '', () => goHit(k));
      const snip = el('span', 'br-snip');
      const a = Math.max(0, h.s - 50), z = Math.min(h.t.length, h.e + 70);
      snip.append(document.createTextNode(`${a > 0 ? '…' : ''}${h.t.slice(a, h.s)}`), el('mark', '', h.t.slice(h.s, h.e)), document.createTextNode(`${h.t.slice(h.e, z)}${z < h.t.length ? '…' : ''}`));
      r.append(el('b', '', `${T('صفحة')} ${I.num(h.ord + 1)}${h.lbl ? ` · ${h.lbl}` : ''}`), snip);
      sList.append(r);
    });
  }
  async function goHit(k) {
    if (!hits.length) return;
    hitAt = (k + hits.length) % hits.length;
    const h = hits[hitAt];
    sList.hidden = true;
    sCount.textContent = `${I.num(hitAt + 1)} / ${I.num(hits.length)}`;
    await jump({ f: h.f, page: h.page });
    doc.querySelectorAll('mark.br-hit').forEach(unwrap);
    const pg = doc.querySelector(`.br-pg[data-page="${h.page}"]`);
    if (!pg) return;
    // Every match on the page is marked; the current one stronger.
    hits.forEach((x, j) => {
      if (x.page !== h.page) return;
      const para = pg.querySelector(`[data-i="${x.i}"]`);
      if (para) wrap(para, x.s, x.e, 'br-hit' + (j === hitAt ? ' is-now' : ''));
    });
    const now = pg.querySelector('mark.br-hit.is-now');
    if (now) {
      const y = now.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop;
      body.scrollTop = Math.max(0, y - body.clientHeight / 3);
    }
  }
  function stepHit(d) { if (!hits.length) { runSearch(); return; } goHit(hitAt < 0 ? 0 : hitAt + d); }

  // ---- marking a stretch of a paragraph's text ----
  function wrap(para, s, e, cls, attrs) {
    if (e <= s) return null;
    const walk = document.createTreeWalker(para, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let pos = 0, n;
    while ((n = walk.nextNode())) { nodes.push([n, pos, pos + n.nodeValue.length]); pos += n.nodeValue.length; }
    let first = null;
    nodes.forEach(([node, a, z]) => {
      const from = Math.max(s, a), to = Math.min(e, z);
      if (from >= to) return;
      const r = document.createRange();
      r.setStart(node, from - a); r.setEnd(node, to - a);
      const m = el('mark', cls);
      if (attrs) Object.entries(attrs).forEach(([k, v]) => { m.dataset[k] = v; });
      r.surroundContents(m);
      first = first || m;
    });
    return first;
  }
  function unwrap(m) { const p = m.parentNode; if (!p) return; while (m.firstChild) p.insertBefore(m.firstChild, m); m.remove(); p.normalize(); }

  // ---- highlights, notes and bookmarks (kept with the library, so they sync) ----
  const notes = () => { const st = S(); st.hl = st.hl || {}; return (st.hl[B.slug] = st.hl[B.slug] || []); };
  const bookmarks = () => { const st = S(); st.bm = st.bm || {}; return (st.bm[B.slug] = st.bm[B.slug] || []); };
  function paintMarks(pgEl, f) {
    if (!B || f < 0) return;
    const id = Number(pgEl.dataset.page);
    notes().filter((h) => h.p === id).forEach((h) => {
      const para = pgEl.querySelector(`[data-i="${h.i}"]`);
      if (para) wrap(para, h.s, h.e, `br-hl is-${h.c}${h.note ? ' has-note' : ''}`, { hl: h.id });
    });
  }
  function repaint(pageId) {
    const pg = doc.querySelector(`.br-pg[data-page="${pageId}"]`);
    if (!pg) return;
    pg.querySelectorAll('mark.br-hl').forEach(unwrap);
    paintMarks(pg, Number(pg.closest('.br-part').dataset.f));
  }
  // The selection, as pieces within paragraphs: [{ pg, para, s, e, text }].
  function selPieces() {
    const sel = getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return [];
    const r = sel.getRangeAt(0);
    if (!doc.contains(r.commonAncestorContainer)) return [];
    const out = [];
    doc.querySelectorAll('.br-pg [data-i]').forEach((para) => {
      if (!r.intersectsNode(para)) return;
      const pr = document.createRange(); pr.selectNodeContents(para);
      const a = r.compareBoundaryPoints(Range.START_TO_START, pr) > 0 ? r.startContainer : null;
      const z = r.compareBoundaryPoints(Range.END_TO_END, pr) < 0 ? r.endContainer : null;
      const off = (container, offset) => { const q = document.createRange(); q.setStart(para, 0); q.setEnd(container, offset); return q.toString().length; };
      const s = a ? off(r.startContainer, r.startOffset) : 0;
      const e = z ? off(r.endContainer, r.endOffset) : para.textContent.length;
      if (e > s) out.push({ pg: para.closest('.br-pg'), para, s, e, text: para.textContent.slice(s, e) });
    });
    return out;
  }
  const selText = () => selPieces().map((x) => x.text).join('\n');
  function sourceOf(pgEl) {
    const o = Number(pgEl.dataset.ord), f = fileOfOrd(o), pg = (data.get(f) || [])[o - base[f]];
    const lbl = pg ? D().pageLabel(pg) : '';
    return `${I.isEn ? B.en : B.ar} — ${I.isEn ? B.authorEn : B.author}${lbl ? `، ${lbl}` : ''}`;
  }
  // Copied text carries its source, whichever way it is copied.
  doc.addEventListener('copy', (ev) => {
    const ps = selPieces();
    if (!ps.length || !ev.clipboardData) return;
    ev.clipboardData.setData('text/plain', `${ps.map((x) => x.text).join('\n')}\n\n(${sourceOf(ps[0].pg)})`);
    ev.preventDefault();
  });
  async function copySel() {
    const ps = selPieces();
    if (!ps.length) return;
    const text = `${ps.map((x) => x.text).join('\n')}\n\n(${sourceOf(ps[0].pg)})`;
    try { await navigator.clipboard.writeText(text); toast(T('نُسخ النص مع مصدره.')); } catch (_) { document.execCommand('copy'); toast(T('نُسخ النص مع مصدره.')); }
    clearSel();
  }
  function highlightSel(c, note) {
    const ps = selPieces();
    if (!ps.length) return null;
    const g = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const list = notes();
    ps.forEach((x, k) => {
      const pid = Number(x.pg.dataset.page), o = Number(x.pg.dataset.ord);
      list.push({ id: `${g}-${k}`, g, p: pid, f: fileOfOrd(o), ord: o, i: Number(x.para.dataset.i), s: x.s, e: x.e, c, note: k === 0 ? note || '' : '', text: x.text.slice(0, 400), at: Date.now() });
    });
    D().save();
    clearSel();
    [...new Set(ps.map((x) => x.pg.dataset.page))].forEach(repaint);
    window.noonBuzz && window.noonBuzz(10);
    return g;
  }
  function noteSel() {
    const ps = selPieces();
    if (!ps.length) return;
    const snapshot = ps.map((x) => ({ pg: x.pg, para: x.para, s: x.s, e: x.e, text: x.text }));
    noteDialog('', (txt) => {
      // The selection is gone once the box is typed in; keep what was chosen.
      const g = Date.now().toString(36);
      snapshot.forEach((x, k) => notes().push({ id: `${g}-${k}`, g, p: Number(x.pg.dataset.page), f: fileOfOrd(Number(x.pg.dataset.ord)), ord: Number(x.pg.dataset.ord),
        i: Number(x.para.dataset.i), s: x.s, e: x.e, c: 'gold', note: k === 0 ? txt : '', text: x.text.slice(0, 400), at: Date.now() }));
      D().save();
      [...new Set(snapshot.map((x) => x.pg.dataset.page))].forEach(repaint);
    });
    clearSel();
  }
  async function shareSel() {
    const ps = selPieces();
    if (!ps.length) return;
    const text = `${ps.map((x) => x.text).join('\n')}\n\n(${sourceOf(ps[0].pg)})`;
    clearSel();
    const P = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Share;
    try {
      if (P) await P.share({ text });
      else if (navigator.share) await navigator.share({ text });
      else { await navigator.clipboard.writeText(text); toast(T('نُسخ النص مع مصدره.')); }
    } catch (_) { /* closed */ }
  }
  function searchSel() {
    const t = selText().trim().split(/\s+/).slice(0, 6).join(' ');
    clearSel();
    if (!t) return;
    sIn.value = t;
    openSearch(true);
    runSearch();
  }
  const clearSel = () => { const s = getSelection(); if (s) s.removeAllRanges(); selBar.hidden = true; };
  document.addEventListener('selectionchange', () => {
    if (box.hidden) return;
    const s = getSelection();
    const on = !!(s && !s.isCollapsed && s.rangeCount && doc.contains(s.getRangeAt(0).commonAncestorContainer) && s.toString().trim());
    selBar.hidden = !on;
  });
  function toggleBookmark() {
    if (!B || !cur.page) return;
    const list = bookmarks();
    const k = list.findIndex((m) => m.p === cur.page);
    if (k >= 0) { list.splice(k, 1); toast(T('أُزيلت العلامة.')); } else {
      list.push({ p: cur.page, f: cur.f, ord: cur.ord, title: headingAt().slice(0, 80), at: Date.now() });
      toast(T('وُضعت علامة على هذه الصفحة.'));
      window.noonBuzz && window.noonBuzz(10);
    }
    D().save();
    showPlace();
  }
  // A tap on a highlight: its colour, its note, or remove it.
  doc.addEventListener('click', (ev) => {
    const m = ev.target.closest('mark.br-hl');
    const s = getSelection();
    if (m && (!s || s.isCollapsed)) { editMark(m.dataset.hl); return; }
    // A tap on the text (not a selection) hides the bars, for reading only; another brings them back.
    if (!s || s.isCollapsed) { box.classList.toggle('is-calm'); fitRail(); }
  });

  // ---- sheets: look, menu, contents and marks, a note ----
  function openSheet(title, build, wide) {
    sheet.replaceChildren();
    sheet.classList.toggle('is-wide', !!wide);
    const head = el('div', 'br-sheet-head');
    head.append(el('b', '', T(title)), iconBtn('close', 'إغلاق', () => closeSheet()));
    const inner = el('div', 'br-sheet-body');
    sheet.append(head, inner);
    build(inner);
    sheet.hidden = veil.hidden = false;
  }
  function closeSheet() { sheet.hidden = veil.hidden = true; }
  veil.addEventListener('click', closeSheet);
  function applyLook() {
    const F = FONTS.find((x) => x[0] === look.font) || FONTS[0];
    box.style.setProperty('--bf', `${look.size}px`);
    box.style.setProperty('--blh', String(look.lh));
    box.style.setProperty('--bff', F[2]);
    box.dataset.theme = look.theme;
  }
  // A change of size keeps the same line at the top.
  function relook(change) {
    const keep = { ord: cur.ord, off: cur.off };
    Object.assign(look, change); keepLook(); applyLook();
    const pg = doc.querySelector(`.br-pg[data-ord="${keep.ord}"]`);
    if (pg) body.scrollTop = pg.offsetTop + (keep.off || 0) * pg.offsetHeight - 24;
  }
  function openLook() {
    openSheet('شكل القراءة', (c) => {
      const row = (label, ...kids) => { const r = el('div', 'br-row'); r.append(el('span', '', T(label)), ...kids); return r; };
      const size = el('b', 'br-size', I.num(look.size));
      const sz = (d) => { relook({ size: Math.max(15, Math.min(36, look.size + d)) }); size.textContent = I.num(look.size); };
      c.append(row('حجم الخط', button('btn btn-quiet', 'A−', () => sz(-1), T('تصغير الخط')), size, button('btn btn-quiet', 'A+', () => sz(1), T('تكبير الخط'))));
      const choose = (label, opts, key, val) => {
        const g = el('div', 'br-choices');
        opts.forEach(([v, name, css]) => {
          const b = button('chip', T(name), () => { relook({ [key]: val ? val(v) : v }); g.querySelectorAll('.chip').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); });
          if (key === 'font') b.style.fontFamily = css;
          b.setAttribute('aria-pressed', String(look[key] === (val ? val(v) : v)));
          g.append(b);
        });
        c.append(row(label, g));
      };
      choose('نوع الخط', FONTS, 'font');
      choose('تباعد الأسطر', [[1.7, 'متقارب'], [2, 'عادي'], [2.4, 'واسع']], 'lh');
      choose('لون الصفحة', THEMES, 'theme');
      c.append(el('p', 'br-hint', T('اضغط على النص مرة لإخفاء الأشرطة والقراءة بملء الشاشة، ومرة أخرى لإظهارها.')));
    });
  }
  function openDrawer(tab = 'toc') {
    openSheet('الفهرس وعلاماتي', (c) => {
      const tabs = el('div', 'filter br-tabs');
      const pane = el('div', 'br-pane');
      const show = (t) => {
        tabs.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.t === t)));
        pane.replaceChildren();
        if (t === 'toc') drawToc(pane); else drawMarks(pane);
      };
      [['toc', 'الفهرس'], ['marks', 'علاماتي']].forEach(([t, l]) => { const b = button('', T(l), () => show(t)); b.dataset.t = t; tabs.append(b); });
      c.append(tabs, pane);
      show(tab);
    }, true);
  }
  function drawToc(pane) {
    if (!toc.length) { pane.append(el('p', 'br-hint', T('لا فهرس لهذا الكتاب؛ اقرأه من أوله.'))); return; }
    const top = Math.min(...toc.map((x) => x[1]));
    const hEl = headingEl(), nowId = hEl ? Number(hEl.dataset.toc) : null;
    let current = null;
    toc.forEach((x) => {
      const depth = Math.min(3, x[1] - top);
      const b = button('br-toc', x[2], () => { closeSheet(); jump({ f: x[3], toc: x[0] }); });
      b.style.paddingInlineStart = `${12 + depth * 16}px`;
      if (depth === 0) b.classList.add('is-top');
      if (x[0] === nowId) { b.classList.add('is-now'); current = b; }
      pane.append(b);
    });
    if (current) setTimeout(() => current.scrollIntoView({ block: 'center' }), 30);
  }
  function drawMarks(pane) {
    const bm = bookmarks().slice().sort((a, b) => a.ord - b.ord);
    const hl = notes().filter((h, k, all) => all.findIndex((x) => x.g === h.g) === k).sort((a, b) => a.ord - b.ord || a.i - b.i);
    if (!bm.length && !hl.length) { pane.append(el('p', 'br-hint', T('لا علامات بعد. اضغط زر العلامة أعلى الشاشة لتعلّم صفحة، أو حدّد نصاً لتظلّله أو تكتب عليه ملاحظة.'))); return; }
    if (bm.length) {
      pane.append(el('h4', 'br-sub', T('الصفحات المعلَّمة')));
      bm.forEach((m) => {
        const r = el('div', 'br-mrow');
        const go = button('br-mgo', '', () => { closeSheet(); jump({ f: m.f, page: m.p }); });
        go.append(el('b', '', `${T('صفحة')} ${I.num(m.ord + 1)}`), el('span', '', m.title || ''));
        r.append(go, button('link-btn danger', T('إزالة'), () => { const l = bookmarks(); l.splice(l.indexOf(m), 1); D().save(); pane.replaceChildren(); drawMarks(pane); showPlace(); }));
        pane.append(r);
      });
    }
    if (hl.length) {
      pane.append(el('h4', 'br-sub', T('التظليل والملاحظات')));
      hl.forEach((h) => {
        const r = el('div', 'br-mrow');
        const go = button('br-mgo', '', () => { closeSheet(); jump({ f: h.f, page: h.p }).then(() => flashMark(h.id)); });
        const t = el('span', `br-mtext is-${h.c}`, h.text);
        go.append(el('b', '', `${T('صفحة')} ${I.num(h.ord + 1)}`), t);
        if (h.note) go.append(el('small', 'br-mnote', h.note));
        r.append(go, button('link-btn danger', T('حذف'), () => { removeMark(h.g); pane.replaceChildren(); drawMarks(pane); }));
        pane.append(r);
      });
    }
  }
  function flashMark(id) { const m = doc.querySelector(`mark.br-hl[data-hl="${id}"]`); if (m) { m.classList.add('is-flash'); setTimeout(() => m.classList.remove('is-flash'), 1600); } }
  function removeMark(g) {
    const st = S(); const pages = new Set(notes().filter((h) => h.g === g).map((h) => h.p));
    st.hl[B.slug] = notes().filter((h) => h.g !== g);
    D().save();
    pages.forEach(repaint);
  }
  function editMark(id) {
    const h = notes().find((x) => x.id === id);
    if (!h) return;
    const head = notes().find((x) => x.g === h.g && x.id.endsWith('-0')) || h;
    openSheet('تظليل', (c) => {
      c.append(el('p', `br-mtext is-${h.c}`, notes().filter((x) => x.g === h.g).map((x) => x.text).join(' ')));
      const colors = el('div', 'br-choices');
      COLORS.forEach((col) => {
        const b = button(`br-dot is-${col}`, '', () => { notes().filter((x) => x.g === h.g).forEach((x) => { x.c = col; }); D().save(); [...new Set(notes().filter((x) => x.g === h.g).map((x) => x.p))].forEach(repaint); closeSheet(); }, T('تظليل'));
        b.setAttribute('aria-pressed', String(h.c === col));
        colors.append(b);
      });
      c.append(colors);
      if (head.note) c.append(el('p', 'br-note', head.note));
      const acts = el('div', 'br-acts');
      acts.append(button('btn btn-quiet', T(head.note ? 'تعديل الملاحظة' : 'أضف ملاحظة'), () => noteDialog(head.note, (txt) => { head.note = txt; D().save(); repaint(head.p); })),
        button('btn btn-quiet', T('نسخ'), async () => { try { await navigator.clipboard.writeText(notes().filter((x) => x.g === h.g).map((x) => x.text).join('\n')); toast(T('نُسخ النص.')); } catch (_) {} }),
        button('btn btn-quiet danger', T('إزالة التظليل'), () => { removeMark(h.g); closeSheet(); }));
      c.append(acts);
    });
  }
  function noteDialog(text, done) {
    openSheet('ملاحظة', (c) => {
      const ta = el('textarea', 'br-ta'); ta.value = text || ''; ta.rows = 5; ta.maxLength = 2000; ta.placeholder = T('اكتب ملاحظتك هنا…');
      ta.setAttribute('aria-label', T('ملاحظة'));
      const save = button('btn btn-primary', T('حفظ'), () => { done(ta.value.trim()); closeSheet(); toast(T('حُفظت الملاحظة.')); });
      c.append(ta, save);
      setTimeout(() => ta.focus(), 50);
    });
  }

  // ---- the menu: keep the book offline, save it as text, its page ----
  function openMenu() {
    openSheet('المزيد', (c) => {
      const off = el('div', 'br-block');
      const state = el('p', 'br-hint', T('جارٍ التحقق…'));
      const act = el('div', 'br-acts');
      off.append(el('b', '', T('القراءة دون إنترنت')), state, act);
      c.append(off);
      offlineState().then((n) => drawOffline(n, state, act));
      const exp = el('div', 'br-block');
      exp.append(el('b', '', T('تنزيل كملف نصي')), el('p', 'br-hint', T('ملف نصي (txt) بنص الكتاب وعناوينه وأرقام صفحاته، يُفتح بأي برنامج.')));
      const ea = el('div', 'br-acts');
      ea.append(button('btn btn-quiet', T('الكتاب كاملاً'), () => exportText(0, B.pages - 1)),
        button('btn btn-quiet', T('الجزء الحالي'), () => exportText(base[cur.f || 0], base[cur.f || 0] + B.fc[cur.f || 0] - 1)));
      const from = el('input'); from.type = 'number'; from.min = '1'; from.max = String(B.pages); from.value = String(cur.ord + 1); from.setAttribute('aria-label', T('من صفحة'));
      const to = el('input'); to.type = 'number'; to.min = '1'; to.max = String(B.pages); to.value = String(Math.min(B.pages, cur.ord + 20)); to.setAttribute('aria-label', T('إلى صفحة'));
      const range = el('div', 'br-range');
      range.append(el('span', '', T('من صفحة')), from, el('span', '', T('إلى')), to, button('btn btn-quiet', T('تنزيل'), () => {
        const a = Math.max(1, Math.min(B.pages, Number(from.value) || 1)), z = Math.max(1, Math.min(B.pages, Number(to.value) || 1));
        exportText(Math.min(a, z) - 1, Math.max(a, z) - 1);
      }));
      exp.append(ea, range);
      c.append(exp);
      const jumpBox = el('div', 'br-block');
      const pin = el('input'); pin.type = 'number'; pin.min = '1'; pin.max = String(B.pages); pin.placeholder = `1–${B.pages}`; pin.setAttribute('aria-label', T('رقم الصفحة'));
      const jr = el('div', 'br-range');
      jr.append(pin, button('btn btn-primary', T('اذهب'), () => { const n = Number(pin.value); if (n >= 1 && n <= B.pages) { closeSheet(); jump({ ord: n - 1 }); } }));
      jumpBox.append(el('b', '', `${T('اذهب إلى صفحة')} (${I.num(1)}–${I.num(B.pages)})`), jr);
      c.append(jumpBox);
      const about = el('div', 'br-acts');
      about.append(button('btn btn-quiet', T('صفحة الكتاب: المؤلف والفهرس'), () => { const slug = B.slug; close(); setTimeout(() => D().showBook(slug), 120); }));
      c.append(about);
    });
  }
  async function offlineState() {
    if (typeof caches === 'undefined') return -1;
    try {
      const c = await caches.open('library-v1');
      let n = 0;
      for (let f = 0; f < B.files; f++) if (await c.match(D().url(`${B.slug}/${f}.json.gz`, B.v))) n++;
      return n;
    } catch (_) { return -1; }
  }
  function drawOffline(n, state, act) {
    act.replaceChildren();
    if (n < 0) { state.textContent = T('هذا المتصفح لا يحفظ الكتب.'); return; }
    if (n >= B.files) {
      state.textContent = T('الكتاب محفوظ كاملاً على هذا الجهاز، ويُقرأ دون إنترنت.');
      act.append(button('btn btn-quiet danger', T('حذف النسخة المحفوظة'), async () => {
        const c = await caches.open('library-v1');
        for (let f = 0; f < B.files; f++) await c.delete(D().url(`${B.slug}/${f}.json.gz`, B.v));
        drawOffline(await offlineState(), state, act);
        toast(T('حُذفت النسخة المحفوظة. تبقى الأجزاء التي تقرؤها محفوظة حتى تُحذف.'));
      }));
      return;
    }
    state.textContent = `${T('محفوظ منه')} ${I.num(n)} ${T('من')} ${I.num(B.files)} ${T('أجزاء')} · ${T('حجمه كاملاً نحو')} ${(B.size / 1e6).toFixed(1)} ${T('ميجابايت')}`;
    const go = button('btn btn-primary', T('احفظ الكتاب كاملاً'), async () => {
      go.disabled = true;
      const b = B;
      try {
        for (let f = 0; f < b.files; f++) {
          state.textContent = `${T('جارٍ الحفظ…')} ${I.num(Math.round((f / b.files) * 100))}%`;
          await D().gz(`${b.slug}/${f}.json.gz`, b.v);
        }
        drawOffline(await offlineState(), state, act);
        toast(T('حُفظ الكتاب كاملاً للقراءة دون إنترنت.'));
      } catch (_) { state.textContent = T('تعذّر الحفظ. تأكد من الإنترنت وحاول مرة أخرى.'); go.disabled = false; }
    });
    act.append(go);
  }
  async function exportText(a, z) {
    const b = B;
    toast(T('جارٍ تجهيز الملف…'));
    const lines = [`${b.ar}`, `${b.author}${b.death && b.death < 9000 ? ` (ت ${b.death}هـ)` : ''}`, b.edition || '', `${T('من المكتبة الشاملة، بنص المؤلف دون حواشي المحقق.')}`, ''];
    try {
      for (let f = fileOfOrd(a); f <= fileOfOrd(z); f++) {
        const pages = await part(f);
        pages.forEach((pg, k) => {
          const o = ordOf(f, k);
          if (o < a || o > z) return;
          pg[3].forEach((x) => lines.push(typeof x === 'string' ? x : `\n■ ${x[1]}\n`));
          const lbl = D().pageLabel(pg);
          lines.push(`— [${lbl || `${T('صفحة')} ${o + 1}`}] —`, '');
        });
      }
    } catch (_) { toast(T('تعذّر تجهيز الملف. القراءة أول مرة تحتاج اتصالاً بالإنترنت.')); return; }
    const whole = a === 0 && z === b.pages - 1;
    const name = `${b.slug}${whole ? '' : `-${a + 1}-${z + 1}`}.txt`;
    await saveText(name, lines.join('\n'), b.ar);
  }
  async function saveText(name, text, title) {
    const C = window.Capacitor;
    const P = C && C.isNativePlatform && C.isNativePlatform() && C.Plugins;
    try {
      if (P && P.Filesystem && P.Share) {
        const f = await P.Filesystem.writeFile({ path: name, data: text, directory: 'CACHE', encoding: 'utf8' });
        await P.Share.share({ title, files: [f.uri] });
        return;
      }
      const blob = new Blob(['﻿' + text], { type: 'text/plain;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = name;
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toast(T('حُفظ الملف في التنزيلات.'));
    } catch (e) {
      if (!e || e.name !== 'AbortError') toast(T('تعذّر حفظ الملف.'));
    }
  }

  // ---- keys ----
  box.addEventListener('keydown', (ev) => {
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'f') { ev.preventDefault(); openSearch(); return; }
    if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); back() || close(); }
  });
  // The phone's back key (js/views.js asks here first): a panel closes before the book does.
  function back() {
    if (box.hidden) return false;
    if (!sheet.hidden) { closeSheet(); return true; }
    if (!selBar.hidden) { clearSel(); return true; }
    if (!sBar.hidden) { closeSearch(); return true; }
    return false;
  }
  window.noonBookReader = { open, close, back, isOpen: () => !box.hidden, jump: (ord) => jump({ ord }), current: () => (B ? { slug: B.slug, ord: cur.ord, page: cur.page } : null) };
})();
