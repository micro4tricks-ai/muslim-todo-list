// ---------- The page-turning Mushaf: the 604 pages of the Madinah Mushaf, turned by hand ----------
// Each page is drawn from the Uthmani text (quran/uthmani.json, Tanzil) with the Madinah page split,
// at the largest text size that shows it whole, so no verse is ever cut at the top or bottom.
// On a wide screen two pages face each other and a page turns over the spine (CSS 3D transform);
// on a phone one page fills the screen and turns over on its right edge under the finger, as a leaf
// of the Mushaf does (one 3D transform on the page itself: nothing is copied or laid out again).
// The next page lies to the left: drag a page to the right, or press ←, to turn forward.
// Pages and the rules for them are in js/mushaf-core.js; texts and reading progress in js/quran.js.
// The toolbar above the pages: listen (the verse being recited is lit, and the page turns with it),
// the teaching Mushaf (al-Husary al-Mu'allim, each verse three times with a pause to repeat it),
// the tajweed colours with their key, the page colour, the text size, and «go to»; and the meaning
// after each verse, recited in a chosen language, its words on a line under the page.
// A tap on a verse (in the middle of the page) opens its sheet: tafsir, translation, play from here.
(() => {
  'use strict';
  const { T, I, el, button, toast, skeleton } = window.noonUI;
  const C = window.noonMushafCore, M = window.NOON_QURAN_META;
  const PAGES = 604, TOTAL = 6236;
  const Q = () => window.noonQuran.book;
  let B = null; // the overlay's parts
  let page = 1, zoom = 1, two = false, busy = false, lock = null;
  let lastFit = 0; // the text size the last page laid out took: the first guess for the next
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
    head.append(el('span', '', M.surahs[s0][0].replace(/^سُورَةُ\s*/, '')), el('span', '', `${I.tp('juz', 'الجزء')} ${q.ar(q.juzOf(a))}`));
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
    const fit = C.fitSize((px) => { flow.style.fontSize = `${px}px`; return flow.offsetHeight <= text.clientHeight && text.scrollHeight <= text.clientHeight; }, 11, cap, short ? 0 : lastFit);
    if (!short) lastFit = fit;
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
    B.title.textContent = I.surah(q.surahOf(first)) || (I.latin ? M.surahs[q.surahOf(first)][1] : M.surahs[q.surahOf(first)][0].replace(/^سُورَةُ\s*/, ''));
    B.meta.textContent = `${T('الجزء')} ${I.num(q.juzOf(first))} · ${T('صفحة')} ${I.num(pages[0])}${pages[1] && pages[1] !== pages[0] ? `–${I.num(pages[1])}` : ''}`;
    paint();
    B.prev.disabled = page <= 1;
    B.next.disabled = two ? C.spread(page, PAGES)[1] >= PAGES : page >= PAGES;
    q.setPage(page);
    q.setLast(first);
    dwell = {};
    // Get the neighbours ready, so a turn shows them at once: one page at a time, when the phone is idle,
    // so laying them out never holds up the hand.
    const warm = [C.step(page, 1, two, PAGES), C.step(page, -1, two, PAGES)].flatMap((n) => (two ? C.spread(n, PAGES) : [n]));
    const idle = window.requestIdleCallback || ((f) => setTimeout(f, 50));
    const ready = () => {
      if (B.box.hidden || !warm.length) return;
      pageEl(warm.shift(), w, h);
      B.measure.replaceChildren();
      idle(ready, { timeout: 500 });
    };
    clearTimeout(warmT);
    warmT = setTimeout(() => idle(ready, { timeout: 500 }), 60);
  }
  let warmT = 0;

  // Turn once: +1 forward (to the left), -1 back.
  // angle: where a leaf the hand was turning already is.
  function turn(dir, angle) {
    if (busy) return;
    const to = C.step(page, dir, two, PAGES);
    if (to === page || (two && C.spread(to, PAGES)[0] === C.spread(page, PAGES)[0])) { show(page); return; }
    if ((matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.hasAttribute('data-calm'))) { show(to); return; }
    busy = true;
    const done = () => { busy = false; show(to); };
    if (two) return flip(dir, to, done, angle || 0);
    const t = leafStart(dir);
    if (!t) { busy = false; show(to); return; }
    leafEnd(t, true, () => done());
  }
  // A phone: the page turns over on its right edge. Forward, the open page lifts from its left edge and
  // folds away to the right, uncovering the next; back, the page before unfolds over the open one.
  // Its angle is set so the edge stays under the finger; past 90 degrees it is edge-on and out of sight.
  function leafStart(dir) {
    const slot = B.book.querySelector('.mb-slot');
    const cur = slot && slot.lastChild;
    const to = C.step(page, dir, false, PAGES);
    if (!cur || to === page) return null;
    const { w, h } = sizes();
    const other = pageEl(to, w, h);
    if (dir > 0) slot.prepend(other); else slot.append(other);
    B.measure.replaceChildren();
    slot.classList.add('is-turning');
    const leaf = dir > 0 ? cur : other;
    const shade = el('div', 'mb-shade');
    leaf.append(shade);
    leaf.classList.add('is-leaf');
    const t = { dir, slot, leaf, other, shade, w };
    setLeaf(t, dir > 0 ? 0 : 90);
    return t;
  }
  function setLeaf(t, a) {
    t.a = a;
    t.leaf.style.transform = `rotateY(${a}deg)`;
    t.shade.style.opacity = String(Math.min(1, a / 90) * 0.55);
  }
  // The angle for a finger dx from where it started: forward 0 to 90, back 90 to 0.
  function leafAngle(t, dx) {
    const f = t.dir > 0 ? 1 - Math.max(0, dx) / t.w : Math.max(0, -dx) / t.w;
    return (Math.acos(Math.min(1, Math.max(0, f))) * 180) / Math.PI;
  }
  // Let it go: on to the end of the turn (go) or back to where it was.
  function leafEnd(t, go, done) {
    const end = go === (t.dir > 0) ? 92 : 0;
    const ms = Math.round(Math.max(150, (Math.abs(end - t.a) / 90) * 340));
    t.leaf.style.transition = `transform ${ms}ms cubic-bezier(.25,.6,.35,1)`;
    t.shade.style.transition = `opacity ${ms}ms`;
    requestAnimationFrame(() => setLeaf(t, end));
    setTimeout(() => {
      t.leaf.style.transition = t.leaf.style.transform = '';
      t.leaf.classList.remove('is-leaf');
      t.shade.remove();
      t.slot.classList.remove('is-turning');
      if (!go) t.other.remove();
      done(go);
    }, ms + 30);
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
    if (!two) {
      // One page: it turns the way the hand first went; at most one change per frame.
      if (!drag.lt) { drag.lt = leafStart(dx > 0 ? 1 : -1); if (!drag.lt) { drag = null; return; } }
      if (!drag.raf) drag.raf = requestAnimationFrame(() => { if (drag && drag.lt) { drag.raf = 0; setLeaf(drag.lt, leafAngle(drag.lt, drag.dx)); } });
      return;
    }
    const { w } = sizes();
    {
      // The leaf follows the hand over the spine.
      if (!drag.leaf) { drag.leafDir = dx > 0 ? 1 : -1; drag.leaf = startLeaf(drag.leafDir); }
      const ang = (dx / w) * 180; // a leaf lifted to turn forward only turns that way, and back the same
      if (drag.leaf) drag.leaf.style.transform = `rotateY(${drag.leafDir > 0 ? Math.max(0, Math.min(180, ang)) : Math.max(-180, Math.min(0, ang))}deg)`;
    }
  }
  function onUp(ev) {
    if (!drag || ev.pointerId !== drag.id) return;
    const d = drag; drag = null;
    if (!d.on) return tapTurn(ev);
    // The finger can lift a long way from its last move (a quick flick): the end of the swipe is where it lifted.
    d.dx = ev.clientX - d.x;
    const { w } = sizes();
    let dir = C.swipeDir(d.dx, w, Math.abs(d.dx) / Math.max(1, performance.now() - d.t));
    if (d.raf) cancelAnimationFrame(d.raf);
    if (d.lt) {
      const t = d.lt;
      busy = true;
      leafEnd(t, dir === t.dir, (go) => { busy = false; if (go) show(C.step(page, t.dir, false, PAGES)); });
      return;
    }
    if (d.leaf && dir !== d.leafDir) dir = 0;
    if (d.leaf) { d.leaf.remove(); show(page); }
    if (!dir || C.step(page, dir, two, PAGES) === page) return;
    turn(dir, Math.max(-180, Math.min(180, (d.dx / w) * 180)));
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
    else {
      const v = ev.target.closest && ev.target.closest('.ay');
      if (v) openVerse(Number(v.dataset.i));
    }
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
    box.setAttribute('aria-label', T('المصحف'));
    box.dir = I.dir;
    box.hidden = true;
    const icon = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    const top = el('header', 'mb-top');
    const close = button('qr-icon', '', () => (history.state && history.state.mb ? history.back() : hide()), T('إغلاق'));
    close.innerHTML = icon('M6 6l12 12M18 6L6 18');
    const ttl = el('div', 'qr-title');
    const title = el('b'), meta = el('span');
    ttl.append(title, meta);
    top.append(close, ttl);

    // The toolbar: one row of switches, scrolled sideways on a narrow phone.
    const tools = el('div', 'mb-tools');
    tools.setAttribute('role', 'toolbar');
    tools.setAttribute('aria-label', T('أدوات المصحف'));
    const tool = (cls, svg, label, run, title) => {
      const b = button(`mb-tool ${cls}`, '', run, title || T(label));
      b.innerHTML = svg;
      b.append(el('span', '', T(label)));
      tools.append(b);
      return b;
    };
    const listen = tool('mb-listen', '', 'استمع', () => listenClick());
    const muallim = tool('mb-muallim', icon('M4 19V6a2 2 0 0 1 2-2h12v13H6a2 2 0 0 0-2 2zm0 0a2 2 0 0 0 2 2h12M9 8h6M9 11h4'), 'المصحف المعلّم', () => muallimClick(),
      T('الحصري المعلّم: تُكرَّر الآية ٣ مرات مع مهلة لترديدها'));
    const tajweed = tool('mb-tajweed', icon('M12 3a9 9 0 1 0 0 18c1 0 1.6-.7 1.6-1.5 0-.4-.2-.8-.4-1.1-.3-.3-.4-.6-.4-1 0-.8.7-1.5 1.5-1.5H16a5 5 0 0 0 5-5c0-4.4-4-8-9-8zM7.5 12.5h.01M9.5 8h.01M14.5 8h.01'), 'التجويد', () => tajweedClick(),
      T('أحكام التجويد ملوّنة في النص'));
    // The meaning after each verse: off, or one of the recited translations.
    const tWrap = el('label', 'mb-tool mb-tsel');
    tWrap.innerHTML = icon('M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3.6 9h16.8M3.6 15h16.8M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18');
    const tSel = el('select');
    tSel.setAttribute('aria-label', T('الترجمة الصوتية بعد كل آية'));
    tSel.title = T('الترجمة الصوتية بعد كل آية');
    tSel.append(new Option(T('بلا ترجمة صوتية'), ''));
    // The language alone in the list (the reader's name is in the option's tooltip).
    Q().transAudios.forEach(([k, name]) => { const o = new Option(name.split(' — ')[0], k); o.title = name; tSel.append(o); });
    tSel.addEventListener('change', () => {
      Q().setTransAudio(tSel.value);
      syncTools();
      caption(reciting);
      if (tSel.value) toast(T(Q().playing() >= 0 ? 'تُتلى الترجمة بعد كل آية، ويظهر نصّها تحت الصفحة.' : 'اضغط «استمع»: تُتلى كل آية ثم ترجمتها، ويظهر نصّها تحت الصفحة.'));
    });
    tWrap.append(tSel);
    tools.append(tWrap);
    const themeBtn = tool('mb-theme', icon('M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z'), 'لون الصفحة', () => themeClick());
    tools.append(el('span', 'mb-tools-gap'));
    tool('mb-aa', '', 'A−', () => setZoom(-0.25), T('تصغير الخط'));
    tool('mb-aa', '', 'A+', () => setZoom(0.25), T('تكبير الخط'));
    const goBtn = tool('mb-goto', icon('M4 6h16M4 12h10M4 18h7M17 15l3 3-3 3'), 'انتقال', () => { B.go.hidden = !B.go.hidden; goBtn.setAttribute('aria-pressed', String(!B.go.hidden)); if (!B.go.hidden) num.focus(); },
      T('انتقل إلى صفحة أو سورة أو جزء'));
    // The key to the tajweed colours, under the toolbar while they are on.
    const legend = el('div', 'mb-legend qr-legend');
    Q().legend.forEach(([k, a, e]) => { const x = el('span', `tj-${k}`); x.append(el('i'), I.latin ? e : a); legend.append(x); });

    // Go to a page, a surah or a juz.
    const go = el('form', 'mb-go');
    go.hidden = true;
    const num = el('input'); num.type = 'number'; num.min = '1'; num.max = String(PAGES); num.inputMode = 'numeric';
    num.placeholder = T('رقم الصفحة'); num.setAttribute('aria-label', T('رقم الصفحة'));
    const sura = el('select'); sura.setAttribute('aria-label', T('السورة'));
    sura.append(new Option(T('السورة'), ''));
    M.surahs.forEach((s, k) => sura.append(new Option(`${I.num(k + 1)}. ${I.latin ? s[1] : s[0].replace(/^سُورَةُ\s*/, '')}`, String(k))));
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
    // The meaning of the verse being recited, under the page, while a recited translation is chosen.
    const cap = el('div', 'mb-cap');
    cap.hidden = true;
    cap.setAttribute('aria-live', 'polite');
    // The sheet of one verse.
    const sheet = el('section', 'mb-sheet');
    sheet.hidden = true;
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-label', T('الآية'));
    box.append(top, tools, legend, go, stage, cap, bar, sheet, measure);
    document.body.append(box);

    stage.addEventListener('pointerdown', onDown);
    stage.addEventListener('pointermove', onMove);
    stage.addEventListener('pointerup', onUp);
    stage.addEventListener('pointercancel', () => {
      if (drag && drag.leaf) { drag.leaf.remove(); show(page); }
      if (drag && drag.lt) { const t = drag.lt; busy = true; leafEnd(t, false, () => { busy = false; }); }
      drag = null;
    });
    box.addEventListener('keydown', (ev) => {
      if (ev.target.closest('input, select, .mb-sheet') && ev.key !== 'Escape') return;
      if (ev.key === 'ArrowLeft' || ev.key === 'PageDown') { ev.preventDefault(); turn(1); }
      else if (ev.key === 'ArrowRight' || ev.key === 'PageUp') { ev.preventDefault(); turn(-1); }
      else if (ev.key === 'Escape' && !sheet.hidden) closeVerse();
      else if (ev.key === 'Escape') { if (!go.hidden) { go.hidden = true; goBtn.setAttribute('aria-pressed', 'false'); } else close.click(); }
    });
    let rz = 0;
    addEventListener('resize', () => { if (B.box.hidden) return; clearTimeout(rz); rz = setTimeout(() => { made.clear(); show(page); }, 150); });
    B = { box, stage, book, measure, title, meta, go, prev, next, listen, muallim, tajweed, themeBtn, legend, goBtn, tSel, cap, sheet };
  }

  // ---- the toolbar ----
  const ICON_PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';
  const ICON_PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
  const THEMES = [['paper', 'فاتح'], ['sepia', 'ورقي'], ['night', 'ليلي']];
  let reciting = -1; // the verse being recited, lit on the page
  function syncTools() {
    const q = Q(), on = q.playing() >= 0;
    B.listen.innerHTML = on ? ICON_PAUSE : ICON_PLAY;
    B.listen.append(el('span', '', T(on ? 'إيقاف' : 'استمع')));
    B.listen.setAttribute('aria-pressed', String(on));
    B.listen.setAttribute('aria-label', T(on ? 'إيقاف التلاوة مؤقتاً' : 'استمع للتلاوة من هذه الصفحة'));
    B.muallim.setAttribute('aria-pressed', String(q.muallim()));
    B.tajweed.setAttribute('aria-pressed', String(q.tajweed()));
    B.legend.hidden = !q.tajweed();
    B.tSel.value = q.transAudio();
    B.tSel.parentNode.setAttribute('aria-pressed', String(!!q.transAudio()));
    const t = THEMES.find((x) => x[0] === q.theme()) || THEMES[0];
    B.themeBtn.querySelector('span').textContent = T(t[1]);
    B.themeBtn.title = `${T('لون الصفحة')}: ${T(t[1])}`;
  }
  const shown = () => (two ? C.spread(page, PAGES) : [page]);
  const firstVerse = () => C.pageRange(M.pages, TOTAL, shown()[0])[0];
  function listenClick() {
    const q = Q();
    if (q.playing() >= 0) { q.pause(); return; }
    // Carry on from the verse it paused on if that is on these pages; otherwise from the top of the page.
    const at = q.paused();
    q.play(at >= 0 && shown().includes(q.pageOf(at)) ? at : firstVerse());
  }
  function muallimClick() {
    const q = Q(), on = !q.muallim();
    q.setMuallim(on);
    const at = q.playing();
    if (at >= 0) q.play(at); // the same verse again, in the other recitation
    syncTools();
    if (on) toast(T(at >= 0 ? 'المصحف المعلّم: استمع للآية ثم ردّدها في المهلة بعدها.' : 'المصحف المعلّم: اضغط «استمع» لتُتلى كل آية ٣ مرات مع مهلة لترديدها.'));
  }
  async function tajweedClick() {
    const q = Q(), on = !q.tajweed();
    B.tajweed.disabled = true;
    try { await q.setTajweed(on); } catch (_) { toast(T('تعذّر تحميل التجويد. تحقّق من الاتصال ثم حاول مرة أخرى.')); }
    B.tajweed.disabled = false;
    syncTools(); // the colour key shows first, so the pages are sized to the room left
    made.clear();
    show(page);
  }
  function themeClick() {
    const q = Q();
    const k = THEMES[(THEMES.findIndex((x) => x[0] === q.theme()) + 1) % THEMES.length][0];
    q.setTheme(k);
    B.box.dataset.theme = k;
    syncTools();
  }
  // The caption: the meaning of the verse being recited, in the language chosen to listen to.
  let capFor = -2;
  async function caption(i) {
    const q = Q(), k = q.transAudio();
    const a = q.transAudios.find((x) => x[0] === k);
    if (!a || i < 0) { B.cap.hidden = true; capFor = -2; return; }
    if (capFor === `${k}:${i}`) return;
    capFor = `${k}:${i}`;
    B.cap.hidden = false;
    B.cap.dir = ['ur'].includes(k) ? 'rtl' : 'ltr';
    B.cap.lang = k;
    const ref = el('b', '', q.ar(q.ayahOf(i)));
    if (!a[3]) { B.cap.replaceChildren(ref, el('span', '', a[1])); return; }
    try {
      const line = await q.line(i, a[3]);
      if (capFor === `${k}:${i}`) B.cap.replaceChildren(ref, el('span', '', line));
    } catch (_) { if (capFor === `${k}:${i}`) B.cap.replaceChildren(ref, el('span', '', a[1])); }
  }

  // ---- the sheet of one verse: its tafsir, its translation, play from here ----
  let sheetAt = -1, sheetTab = 'tafsir';
  function openVerse(i) {
    sheetAt = i;
    B.book.querySelectorAll('.ay.is-sel').forEach((n) => n.classList.remove('is-sel'));
    B.book.querySelectorAll(`.ay[data-i="${i}"]`).forEach((n) => n.classList.add('is-sel'));
    renderSheet();
  }
  function closeVerse() {
    sheetAt = -1;
    B.sheet.hidden = true;
    B.book.querySelectorAll('.ay.is-sel').forEach((n) => n.classList.remove('is-sel'));
    B.box.focus({ preventScroll: true });
  }
  async function renderSheet() {
    const q = Q(), i = sheetAt;
    if (i < 0) return;
    const sh = B.sheet;
    sh.hidden = false;
    const head = el('header', 'mb-sheet-head');
    const x = button('mb-sheet-x', '×', closeVerse, T('إغلاق'));
    head.append(el('b', '', q.ref(i)), x);
    const tabs = el('div', 'filter mb-sheet-tabs');
    tabs.setAttribute('role', 'group');
    [['tafsir', 'التفسير'], ['trans', 'الترجمة']].forEach(([k, label]) => {
      const b = button('', T(label), () => { sheetTab = k; renderSheet(); });
      b.setAttribute('aria-pressed', String(sheetTab === k));
      tabs.append(b);
    });
    const verse = el('p', 'mb-sheet-ayah', `${q.text(i)} ﴿${q.ar(q.ayahOf(i))}﴾`);
    verse.lang = 'ar'; verse.dir = 'rtl';
    const pick = el('select', 'mb-sheet-pick');
    const body = el('div', 'mb-sheet-body');
    body.append(skeleton(T(sheetTab === 'tafsir' ? 'جارٍ تحميل التفسير…' : 'جارٍ تحميل الترجمة…'), 3));
    const acts = el('div', 'mb-sheet-acts');
    const share = `${q.text(i)} ﴿${q.ref(i)}﴾`;
    acts.append(
      button('btn btn-primary', `▶ ${T('تشغيل من هنا')}`, () => { closeVerse(); q.play(i); }),
      button('btn btn-quiet', T('نسخ'), async () => { try { await navigator.clipboard.writeText(share); toast(T('نُسخت الآية.')); } catch (_) { toast(T('تعذّر النسخ.')); } })
    );
    if (sheetTab === 'tafsir') {
      pick.setAttribute('aria-label', T('اختر التفسير'));
      q.tafsirs.forEach((t) => pick.append(new Option(I.latin ? t[2] : t[1], t[0])));
      pick.value = q.tafsir();
      pick.addEventListener('change', () => { q.setTafsir(pick.value); renderSheet(); });
    } else {
      pick.setAttribute('aria-label', T('لغة الترجمة'));
      q.trans.forEach(([k, name]) => pick.append(new Option(name, k)));
      pick.value = q.transLang();
      pick.addEventListener('change', () => { q.setTransLang(pick.value); renderSheet(); });
    }
    sh.replaceChildren(head, verse, tabs, pick, body, acts);
    try {
      if (sheetTab === 'tafsir') {
        const { k, text } = await q.tafsirOf(i);
        if (sheetAt !== i) return;
        const box = el('div', 'mb-sheet-text');
        box.lang = q.tafLang(); box.dir = ['ar', 'ur'].includes(box.lang) ? 'rtl' : 'ltr';
        if (k !== i) box.append(el('p', 'hint', `${T('تفسير هذه الآية مع ما قبلها، من الآية')} ${I.num(q.ayahOf(k))}`));
        text.split(/\n+/).filter((t) => t.trim()).forEach((t) => box.append(el('p', '', t.trim())));
        body.replaceChildren(box);
      } else {
        const lang = q.transLang();
        const line = await q.line(i, lang);
        if (sheetAt !== i) return;
        const box = el('div', 'mb-sheet-text');
        box.lang = lang.split('.')[0]; box.dir = /^(ur|fa)/.test(lang) ? 'rtl' : 'ltr';
        box.append(el('p', '', line));
        body.replaceChildren(box);
      }
    } catch (_) {
      if (sheetAt === i) body.replaceChildren(el('p', 'hint', T(sheetTab === 'tafsir' ? 'التفسير يحتاج اتصالاً بالإنترنت. حاول مرة أخرى.' : 'الترجمة تحتاج اتصالاً بالإنترنت. حاول مرة أخرى.')));
    }
  }

  // Light the verse being recited.
  function paint() {
    B.book.querySelectorAll('.ay.is-play').forEach((n) => n.classList.remove('is-play'));
    if (reciting >= 0) B.book.querySelectorAll(`.ay[data-i="${reciting}"]`).forEach((n) => n.classList.add('is-play'));
    B.book.querySelectorAll('.ay.is-sel').forEach((n) => n.classList.remove('is-sel'));
    if (sheetAt >= 0) B.book.querySelectorAll(`.ay[data-i="${sheetAt}"]`).forEach((n) => n.classList.add('is-sel'));
  }
  // The recitation moved on: light its verse, and turn to its page when it is not open.
  window.addEventListener('noon-ayah', (ev) => {
    if (!B || B.box.hidden) return;
    const { i, on } = ev.detail;
    reciting = on ? i : -1;
    syncTools();
    caption(on ? i : -1);
    if (on && !busy && !drag) {
      const p = Q().pageOf(i);
      if (!shown().includes(p)) {
        const nx = C.step(page, 1, two, PAGES);
        if ((two ? C.spread(nx, PAGES) : [nx]).includes(p)) turn(1); else show(p);
        return;
      }
    }
    paint();
  });
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
    B.book.replaceChildren(skeleton(T('جارٍ فتح المصحف…'), 8));
    try { await Q().load(); } catch (_) {
      B.book.replaceChildren(el('p', 'qr-loading', T('تعذّر تحميل نص المصحف. تحقّق من الاتصال ثم حاول مرة أخرى.')));
      return;
    }
    syncTools();
    made.clear();
    show(p || Q().page());
    B.box.tabIndex = -1;
    B.box.focus({ preventScroll: true });
    try { if ('wakeLock' in navigator && !lock) lock = await navigator.wakeLock.request('screen'); } catch (_) {}
  }
  function hide(keepBody) {
    if (!B || B.box.hidden) return;
    B.box.hidden = true;
    if (Q().playing() >= 0) Q().pause(); // the recitation follows the pages, so it stops with them
    reciting = -1;
    B.sheet.hidden = true; sheetAt = -1;
    B.cap.hidden = true; capFor = -2;
    if (!keepBody) document.body.classList.remove('qr-open');
    if (lock) { lock.release().catch(() => {}); lock = null; }
    if (history.state && history.state.mb) history.replaceState(null, '');
  }
  addEventListener('popstate', () => { if (B && !B.box.hidden) hide(); });

  window.noonMushafBook = { open, close: () => hide(), page: () => page, isOpen: () => !!B && !B.box.hidden };
})();
