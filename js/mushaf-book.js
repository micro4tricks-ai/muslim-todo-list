// ---------- The page-turning Mushaf: the 604 pages of the Madinah Mushaf, turned by hand ----------
// Each page is drawn from the Uthmani text (quran/uthmani.json, Tanzil) with the Madinah page split,
// at the largest text size that shows it whole, so no verse is ever cut at the top or bottom.
// On a wide screen two pages face each other and a page turns over the spine (CSS 3D transform);
// on a phone one page fills the screen and slides away under the finger (2D transform only).
// The next page lies to the left: drag a page to the right, or press ←, to turn forward.
// Pages and the rules for them are in js/mushaf-core.js; texts and reading progress in js/quran.js.
(() => {
  'use strict';
  const { T, I, el, button, toast } = window.noonUI;
  const C = window.noonMushafCore, M = window.NOON_QURAN_META;
  const PAGES = 604, TOTAL = 6236;
  const LITE = matchMedia('(pointer: coarse)').matches || !!window.Capacitor;
  const Q = () => window.noonQuran.book;
  let B = null; // the overlay's parts
  let page = 1, zoom = 1, two = false, busy = false, lock = null;
  const made = new Map(); // `${p}|${w}x${h}|${zoom}` → page element, the few around the open one

  // ---- one page ----
  function surahHead(s) {
    const f = el('div', 'mb-sura');
    f.append(el('span', '', M.surahs[s][0]));
    f.lang = 'ar';
    return f;
  }
  function pageEl(p, w, h) {
    const key = `${p}|${Math.round(w)}x${Math.round(h)}|${zoom}`;
    if (made.has(key)) return made.get(key);
    const q = Q();
    const [a, b] = C.pageRange(M.pages, TOTAL, p);
    const pg = el('article', 'mb-page');
    pg.dataset.page = String(p);
    pg.style.width = `${w}px`; pg.style.height = `${h}px`;
    pg.classList.toggle('is-right', p % 2 === 1);
    const s0 = q.surahOf(a);
    const head = el('header', 'mb-head');
    head.append(el('span', '', M.surahs[s0][0].replace(/^سُورَةُ\s*/, '')), el('span', '', `${I.isEn ? 'Juz' : 'الجزء'} ${q.ar(q.juzOf(a))}`));
    const text = el('div', 'mb-text');
    text.lang = 'ar'; text.dir = 'rtl';
    const flow = el('div', 'mb-flow');
    let para = null;
    for (let i = a; i < b; i++) {
      const s = q.surahOf(i);
      if (i === q.starts[s]) {
        flow.append(surahHead(s));
        if (s !== 0 && s !== 8) flow.append(el('p', 'mb-basmala', M.basmala));
        para = null;
      }
      if (!para) { para = el('p', 'mb-para'); flow.append(para); }
      const v = el('span', 'ay');
      v.dataset.i = String(i);
      v.append(q.verse(i), ' ', el('span', 'ay-n', '۝' + q.ar(q.ayahOf(i))));
      if (q.sajda.has(i)) v.append(el('span', 'ay-sajda', '۩'));
      para.append(v, ' ');
    }
    text.append(flow);
    const up = el('span', 'mb-more mb-more-up', '︿'), down = el('span', 'mb-more mb-more-down', T('تتمة الصفحة ﹀'));
    up.hidden = down.hidden = true;
    const foot = el('footer', 'mb-foot', q.ar(p));
    pg.append(head, text, up, down, foot);
    // Lay it out out of sight, then pick the text size that shows the whole page.
    B.measure.append(pg);
    const lh = 1.95;
    const short = b - a < 8 && (p <= 2); // al-Fatiha and the opening of al-Baqara: few lines, centred
    const cap = Math.min(54, text.clientHeight / (short ? 9 : 12.5) / lh);
    const fit = C.fitSize((px) => { flow.style.fontSize = `${px}px`; return flow.offsetHeight <= text.clientHeight && text.scrollHeight <= text.clientHeight; }, 11, cap);
    const px = fit * zoom;
    flow.style.fontSize = `${px}px`;
    pg.classList.toggle('is-short', short);
    if (zoom > 1 && flow.offsetHeight > text.clientHeight) {
      // Too big to show whole: the page scrolls, by whole lines, and says when there is more.
      const avail = text.clientHeight;
      pg.classList.add('is-zoom');
      text.style.height = `${C.wholeLines(avail, px * lh)}px`;
      const edge = () => { const e = C.edges(text.scrollTop, text.scrollHeight, text.clientHeight); up.hidden = !e.above; down.hidden = !e.below; };
      let t = 0;
      text.addEventListener('scroll', () => {
        edge();
        clearTimeout(t);
        t = setTimeout(() => settle(text), 140);
      }, { passive: true });
      requestAnimationFrame(edge);
    } else if (short) flow.style.marginBlock = 'auto';
    made.set(key, pg);
    if (made.size > 10) made.delete(made.keys().next().value);
    return pg;
  }
  // After scrolling, nudge the page so the line under the top edge shows whole.
  function settle(box) {
    const top = box.getBoundingClientRect().top;
    const lines = [];
    box.querySelectorAll('.ay').forEach((v) => {
      for (const r of v.getClientRects()) if (r.bottom > top - 200 && r.top < top + 200) lines.push({ top: r.top, bottom: r.bottom });
    });
    const d = C.cutDelta(lines, top);
    if (Math.abs(d) > 1) box.scrollBy({ top: d, behavior: 'smooth' });
  }

  // ---- the book: sizes, slots and turning ----
  function sizes() {
    const r = B.stage.getBoundingClientRect();
    two = r.width >= 860 && r.width > r.height * 1.15;
    const ratio = 0.66; // a Mushaf page, width / height
    let h = r.height - 8, w = two ? Math.min(h * ratio, (r.width - 24) / 2) : Math.min(r.width - 8, h * 0.9);
    if (two) h = Math.min(h, w / ratio);
    return { w, h };
  }
  function show(p) {
    page = Math.min(PAGES, Math.max(1, p));
    const { w, h } = sizes();
    B.book.classList.toggle('is-two', two);
    B.book.replaceChildren();
    if (two) {
      const [r, l] = C.spread(page, PAGES);
      const rs = el('div', 'mb-slot is-right'), ls = el('div', 'mb-slot is-left');
      rs.append(pageEl(r, w, h));
      if (l !== r) ls.append(pageEl(l, w, h));
      B.book.append(ls, rs); // the book is laid out left to right: the left page first
    } else {
      const s = el('div', 'mb-slot');
      s.append(pageEl(page, w, h));
      B.book.append(s);
    }
    B.measure.replaceChildren();
    const pages = two ? C.spread(page, PAGES) : [page];
    const q = Q();
    const first = C.pageRange(M.pages, TOTAL, pages[0])[0];
    B.title.textContent = I.isEn ? M.surahs[q.surahOf(first)][1] : M.surahs[q.surahOf(first)][0].replace(/^سُورَةُ\s*/, '');
    B.meta.textContent = `${T('الجزء')} ${I.num(q.juzOf(first))} · ${T('صفحة')} ${I.num(pages[0])}${pages[1] && pages[1] !== pages[0] ? `–${I.num(pages[1])}` : ''}`;
    B.prev.disabled = page <= 1;
    B.next.disabled = two ? C.spread(page, PAGES)[1] >= PAGES : page >= PAGES;
    q.setPage(page);
    q.setLast(first);
    dwell = {};
    // Get the neighbours ready, so a turn shows them at once.
    setTimeout(() => { if (!B.box.hidden) [C.step(page, 1, two, PAGES), C.step(page, -1, two, PAGES)].forEach((n) => { if (two) C.spread(n, PAGES).forEach((x) => pageEl(x, w, h)); else pageEl(n, w, h); B.measure.replaceChildren(); }); }, 120);
  }

  // Turn once: +1 forward (to the left), -1 back.
  // angle: where a leaf the hand was turning already is.
  function turn(dir, angle) {
    if (busy) return;
    const to = C.step(page, dir, two, PAGES);
    if (to === page || (two && C.spread(to, PAGES)[0] === C.spread(page, PAGES)[0])) { show(page); return; }
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { show(to); return; }
    busy = true;
    const done = () => { busy = false; show(to); };
    if (two && !LITE) return flip(dir, to, done, angle || 0);
    slide(dir, done);
  }
  // A phone: the page slides off to the side it turns to, over the next one.
  function slide(dir, done) {
    const slot = B.book.querySelector('.mb-slot');
    const cur = slot && slot.lastChild;
    if (!cur) return done();
    const { w, h } = sizes();
    const next = pageEl(C.step(page, dir, false, PAGES), w, h);
    next.classList.add('is-under');
    slot.prepend(next);
    cur.classList.add('is-moving');
    const x = (dir > 0 ? 1 : -1) * (w + 40);
    requestAnimationFrame(() => {
      cur.style.transition = 'transform 0.28s cubic-bezier(.3,.7,.4,1)';
      cur.style.transform = `translateX(${x}px)`;
    });
    setTimeout(() => { cur.style.transition = cur.style.transform = ''; cur.classList.remove('is-moving'); next.classList.remove('is-under'); done(); }, 300);
  }
  // A wide screen: a leaf turns over the spine; its back is the page that lands on the other side.
  function flip(dir, to, done, angle) {
    const { w, h } = sizes();
    const [r, l] = C.spread(page, PAGES), [r2, l2] = C.spread(to, PAGES);
    const side = dir > 0 ? 'is-left' : 'is-right'; // forward lifts the left page, back the right one
    const slot = B.book.querySelector(`.mb-slot.${side}`);
    if (!slot) return done();
    const leaf = el('div', `mb-leaf ${side}`);
    const front = el('div', 'mb-face'), back = el('div', 'mb-face is-back');
    front.append(pageEl(dir > 0 ? l : r, w, h).cloneNode(true));
    back.append(pageEl(dir > 0 ? r2 : l2, w, h).cloneNode(true));
    leaf.append(front, back);
    // Under the leaf: the page of the new spread on the same side.
    slot.replaceChildren(pageEl(dir > 0 ? l2 : r2, w, h));
    B.measure.replaceChildren();
    B.book.append(leaf);
    const end = dir > 0 ? 180 : -180;
    leaf.style.transform = `rotateY(${angle}deg)`;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      leaf.style.transition = 'transform 0.6s cubic-bezier(.45,.05,.3,1)';
      leaf.style.transform = `rotateY(${end}deg)`;
    }));
    setTimeout(done, 620);
  }

  // ---- dragging a page ----
  let drag = null;
  function onDown(ev) {
    if (busy || ev.button > 0 || ev.target.closest('button, a, input, select')) return;
    drag = { x: ev.clientX, y: ev.clientY, t: performance.now(), dx: 0, on: false, id: ev.pointerId };
  }
  function onMove(ev) {
    if (!drag || ev.pointerId !== drag.id) return;
    const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
    if (!drag.on) {
      if (Math.abs(dx) < 8 || Math.abs(dy) > Math.abs(dx)) { if (Math.abs(dy) > 12) drag = null; return; }
      drag.on = true;
      try { B.stage.setPointerCapture(ev.pointerId); } catch (_) {}
    }
    drag.dx = dx;
    const { w } = sizes();
    if (two && !LITE) {
      // The leaf follows the hand over the spine.
      if (!drag.leaf) { drag.leafDir = dx > 0 ? 1 : -1; drag.leaf = startLeaf(drag.leafDir); }
      const ang = (dx / w) * 180; // a leaf lifted to turn forward only turns that way, and back the same
      if (drag.leaf) drag.leaf.style.transform = `rotateY(${drag.leafDir > 0 ? Math.max(0, Math.min(180, ang)) : Math.max(-180, Math.min(0, ang))}deg)`;
      return;
    }
    const slot = B.book.querySelector('.mb-slot'), cur = slot && slot.lastChild;
    if (!cur) return;
    // The page it turns to waits underneath: forward when dragged right, back when dragged left.
    const want = C.step(page, dx > 0 ? 1 : -1, false, PAGES);
    if (drag.under !== want) {
      if (drag.underEl) drag.underEl.remove();
      drag.under = want;
      drag.underEl = null;
      if (want !== page) {
        const { h } = sizes();
        drag.underEl = pageEl(want, w, h);
        drag.underEl.classList.add('is-under');
        slot.prepend(drag.underEl);
      }
    }
    cur.classList.add('is-moving');
    cur.style.transform = `translateX(${dx}px)`;
  }
  function onUp(ev) {
    if (!drag || ev.pointerId !== drag.id) return;
    const d = drag; drag = null;
    if (!d.on) return tapTurn(ev);
    const { w } = sizes();
    let dir = C.swipeDir(d.dx, w, Math.abs(d.dx) / Math.max(1, performance.now() - d.t));
    if (d.leaf && dir !== d.leafDir) dir = 0;
    if (d.leaf) { d.leaf.remove(); show(page); }
    const cur = B.book.querySelector('.mb-slot > .mb-page:last-child');
    if (!dir || C.step(page, dir, two, PAGES) === page) {
      if (d.underEl) setTimeout(() => { d.underEl.remove(); d.underEl.classList.remove('is-under'); }, 220);
      if (cur) { cur.style.transition = 'transform 0.2s'; cur.style.transform = ''; setTimeout(() => { cur.style.transition = ''; cur.classList.remove('is-moving'); }, 220); }
      return;
    }
    if (two && !LITE) { turn(dir, Math.max(-180, Math.min(180, (d.dx / w) * 180))); return; }
    turn(dir);
  }
  // While dragging on a wide screen: a leaf like the one flip() turns, over the page being lifted.
  function startLeaf(dir) {
    const to = C.step(page, dir, true, PAGES);
    if (to === page) return null;
    const { w, h } = sizes();
    const [r, l] = C.spread(page, PAGES), [r2, l2] = C.spread(to, PAGES);
    const side = dir > 0 ? 'is-left' : 'is-right';
    const leaf = el('div', `mb-leaf ${side}`);
    const front = el('div', 'mb-face'), back = el('div', 'mb-face is-back');
    front.append(pageEl(dir > 0 ? l : r, w, h).cloneNode(true));
    back.append(pageEl(dir > 0 ? r2 : l2, w, h).cloneNode(true));
    const slot = B.book.querySelector(`.mb-slot.${side}`);
    if (slot) slot.replaceChildren(pageEl(dir > 0 ? l2 : r2, w, h)); // what the lifted page uncovers
    B.measure.replaceChildren();
    leaf.append(front, back);
    B.book.append(leaf);
    return leaf;
  }
  // A tap on the left quarter turns forward, on the right quarter back (wide enough to stay clear of
  // the phone's own back gesture at the very edge); the middle does nothing.
  function tapTurn(ev) {
    const r = B.stage.getBoundingClientRect();
    const x = (ev.clientX - r.left) / r.width;
    if (x < 0.25) turn(1);
    else if (x > 0.75) turn(-1);
  }

  // ---- pages read count toward the daily wird and the khatma (20 seconds on screen each) ----
  let dwell = {};
  setInterval(() => {
    if (!B || B.box.hidden || document.hidden || busy) return;
    (two ? C.spread(page, PAGES) : [page]).forEach((p) => {
      dwell[p] = (dwell[p] || 0) + 2;
      if (dwell[p] === 20) Q().markPage(p);
    });
  }, 2000);

  // ---- the overlay ----
  function build() {
    const box = el('div', 'mb');
    box.id = 'mushafBook';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', T('المصحف بتقليب الصفحات'));
    box.dir = I.dir;
    box.hidden = true;
    const icon = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    const top = el('header', 'mb-top');
    const close = button('qr-icon', '', () => (history.state && history.state.mb ? history.back() : hide()), T('إغلاق'));
    close.innerHTML = icon('M6 6l12 12M18 6L6 18');
    const ttl = el('div', 'qr-title');
    const title = el('b'), meta = el('span');
    ttl.append(title, meta);
    const goBtn = button('qr-icon', '', () => { B.go.hidden = !B.go.hidden; if (!B.go.hidden) num.focus(); }, T('انتقل إلى صفحة أو سورة أو جزء'));
    goBtn.innerHTML = icon('M4 6h16M4 12h10M4 18h7M17 15l3 3-3 3');
    const minus = button('qr-icon qr-aa', 'A−', () => setZoom(-0.25), T('تصغير الخط'));
    const plus = button('qr-icon qr-aa', 'A+', () => setZoom(0.25), T('تكبير الخط'));
    top.append(close, ttl, minus, plus, goBtn);

    // Go to a page, a surah or a juz.
    const go = el('form', 'mb-go');
    go.hidden = true;
    const num = el('input'); num.type = 'number'; num.min = '1'; num.max = String(PAGES); num.inputMode = 'numeric';
    num.placeholder = T('رقم الصفحة'); num.setAttribute('aria-label', T('رقم الصفحة'));
    const sura = el('select'); sura.setAttribute('aria-label', T('السورة'));
    sura.append(new Option(T('السورة'), ''));
    M.surahs.forEach((s, k) => sura.append(new Option(`${I.num(k + 1)}. ${I.isEn ? s[1] : s[0].replace(/^سُورَةُ\s*/, '')}`, String(k))));
    const juz = el('select'); juz.setAttribute('aria-label', T('الجزء'));
    juz.append(new Option(T('الجزء'), ''));
    M.juz.forEach((_, k) => juz.append(new Option(`${T('الجزء')} ${I.num(k + 1)}`, String(k))));
    const pageOfVerse = (i) => Q().pageOf(i);
    sura.addEventListener('change', () => { if (sura.value) { show(pageOfVerse(Q().starts[Number(sura.value)])); go.hidden = true; sura.value = ''; } });
    juz.addEventListener('change', () => { if (juz.value) { show(pageOfVerse(M.juz[Number(juz.value)])); go.hidden = true; juz.value = ''; } });
    go.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const n = Number(String(num.value).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
      if (n >= 1 && n <= PAGES) { show(n); go.hidden = true; num.value = ''; } else toast(T('اكتب رقم صفحة من ١ إلى ٦٠٤.'));
    });
    const goOk = button('btn btn-primary', T('انتقال')); goOk.type = 'submit';
    const toScroll = button('btn btn-quiet', T('القراءة بالتمرير'), () => { const i = C.pageRange(M.pages, TOTAL, page)[0]; hide(true); Q().openAt(i); });
    go.append(num, goOk, sura, juz, toScroll);

    const stage = el('div', 'mb-stage');
    const book = el('div', 'mb-book');
    stage.append(book);
    const measure = el('div', 'mb-measure');
    measure.setAttribute('aria-hidden', 'true');
    const bar = el('div', 'mb-bar');
    // The Mushaf turns to the left: «next» sits on the left whatever the page language.
    const next = button('btn btn-quiet', `${T('الصفحة التالية')} ←`, () => turn(1));
    const prev = button('btn btn-quiet', `→ ${T('الصفحة السابقة')}`, () => turn(-1));
    next.dir = prev.dir = I.dir;
    bar.dir = 'ltr';
    bar.append(next, el('span', 'hint mb-hint', T('اسحب الصفحة أو اضغط على طرفها لتقليبها')), prev);
    box.append(top, go, stage, bar, measure);
    document.body.append(box);

    stage.addEventListener('pointerdown', onDown);
    stage.addEventListener('pointermove', onMove);
    stage.addEventListener('pointerup', onUp);
    stage.addEventListener('pointercancel', () => { if (drag && drag.leaf) { drag.leaf.remove(); show(page); } drag = null; });
    box.addEventListener('keydown', (ev) => {
      if (ev.target.closest('input, select')) return;
      if (ev.key === 'ArrowLeft' || ev.key === 'PageDown') { ev.preventDefault(); turn(1); }
      else if (ev.key === 'ArrowRight' || ev.key === 'PageUp') { ev.preventDefault(); turn(-1); }
      else if (ev.key === 'Escape') { if (!go.hidden) go.hidden = true; else close.click(); }
    });
    let rz = 0;
    addEventListener('resize', () => { if (B.box.hidden) return; clearTimeout(rz); rz = setTimeout(() => { made.clear(); show(page); }, 150); });
    B = { box, stage, book, measure, title, meta, go, prev, next };
  }
  function setZoom(d) {
    zoom = Math.max(1, Math.min(2.5, Math.round((zoom + d) * 4) / 4));
    made.clear();
    show(page);
    if (zoom > 1) toast(T('كبّرت الخط: مرّر الصفحة لأعلى وأسفل، وتظهر الأسطر كاملة دائماً.'));
  }

  async function open(p) {
    if (!B) build();
    B.box.hidden = false;
    B.box.dataset.theme = Q().theme();
    document.body.classList.add('qr-open');
    if (!history.state || !history.state.mb) history.pushState({ mb: 1 }, '');
    B.book.replaceChildren(el('p', 'qr-loading', T('جارٍ فتح المصحف…')));
    try { await Q().load(); } catch (_) {
      B.book.replaceChildren(el('p', 'qr-loading', T('تعذّر تحميل نص المصحف. تحقّق من الاتصال ثم حاول مرة أخرى.')));
      return;
    }
    made.clear();
    show(p || Q().page());
    B.box.tabIndex = -1;
    B.box.focus({ preventScroll: true });
    try { if ('wakeLock' in navigator && !lock) lock = await navigator.wakeLock.request('screen'); } catch (_) {}
  }
  function hide(keepBody) {
    if (!B || B.box.hidden) return;
    B.box.hidden = true;
    if (!keepBody) document.body.classList.remove('qr-open');
    if (lock) { lock.release().catch(() => {}); lock = null; }
    if (history.state && history.state.mb) history.replaceState(null, '');
  }
  addEventListener('popstate', () => { if (B && !B.box.hidden) hide(); });

  window.noonMushafBook = { open, close: () => hide(), page: () => page };
})();
