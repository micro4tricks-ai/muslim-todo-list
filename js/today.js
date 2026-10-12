// ---------- "My day": the day at a glance under the clock ----------
// The next prayer, the qibla (a live compass on phones), tomorrow's fast or season, today's Quran
// portion and where reading stopped, the morning or evening adhkar, and more. Each card opens its
// place. The person chooses which cards show and their order (js/today-core.js): in Settings ›
// «كروت يومي», or with a long press on a card. Saved in noon-sweep-today (synced).
(() => {
  'use strict';
  const { T, I, el, button, load, store, toast } = window.noonUI;
  const C = window.noonTodayCore;
  const KEY = 'noon-sweep-today';
  const box = el('section', 'today');
  box.setAttribute('aria-label', T('يومي'));
  const quick = document.querySelector('.quick');
  if (quick) quick.after(box); else return;
  let cfg = load(KEY, {});
  const save = () => { cfg.updatedAt = Date.now(); store(KEY, cfg); };

  // The cards' names, for the settings page and the long-press menu.
  const NAMES = {
    prayer: 'الصلاة القادمة', qibla: 'القبلة', fast: 'الصيام والمواسم', quran: 'وردك اليوم', adhkar: 'أذكار الصباح والمساء',
    hifz: 'مراجعة الحفظ', remind: 'التذكير القادم', invite: 'دعوة لختمة جماعية', listen: 'تابع الاستماع',
    library: 'تابع القراءة في المكتبة', hadith: 'حديث اليوم', book: 'كتاب مثبّت', tasbih: 'المسبحة',
    khatma: 'الختمة الجماعية', radio: 'إذاعتك المفضلة'
  };
  // Cards that show only when they have something to say.
  const NOTES = { fast: 'يظهر حين يكون غداً صيام أو موسم', hifz: 'يظهر حين تحين مراجعة', remind: 'يظهر قبل التذكير بيوم',
    invite: 'يظهر حين تصلك دعوة', listen: 'يظهر بعد أول استماع', library: 'يظهر بعد فتح كتاب من المكتبة' };

  function card(cls, kicker, title, sub, onClick, extra) {
    const c = button(`td-card ${cls}`, '', onClick);
    c.append(el('span', 'td-kicker', kicker), el('b', 'td-title', title));
    if (sub) c.append(el('span', 'td-sub', sub));
    if (extra) c.append(extra);
    return c;
  }
  function bar(done, total) {
    const b = el('span', 'td-bar'); const i = el('i');
    i.style.width = `${total ? Math.min(100, Math.round((done / total) * 100)) : 0}%`;
    b.append(i);
    return b;
  }

  // ---- each card: null when it has nothing to show ----
  const BUILD = {
    prayer() {
      const snap = window.noonAstro && window.noonAstro.snapshot(Date.now());
      if (!snap || !snap.next) return null;
      return card('td-prayer', T('الصلاة القادمة'), `${snap.next.name} ${snap.next.time}`, snap.next.inText,
        () => window.noonSettings && window.noonSettings.open('place'));
    },
    qibla() {
      const q = window.noonQibla && window.noonQibla.bearing();
      if (!q || !Number.isFinite(q.bearing) || !window.noonClockCore) return null;
      const POINTS = window.noonClockCore.POINTS;
      // The dial turns with the phone, so its arrow keeps pointing to the qibla (live where there is a compass).
      const dial = el('span', 'td-needle');
      dial.style.setProperty('--qibla', `${Math.round(q.bearing)}deg`);
      const c = card('td-qibla', T('القبلة'), `${I.num(Math.round(q.bearing))}°`, T(POINTS[window.noonClockCore.compassPoint(q.bearing)]), () => window.noonQibla.open(), dial);
      liveQibla(c, dial, q.bearing);
      return c;
    },
    fast() {
      try {
        const N = window.noonSunnah;
        const eve = N && N.plan(Date.now() - 864e5, 1).find((r) => /^eve-/.test(r.key) && r.at <= Date.now() + 864e5 && r.at > Date.now() - 864e5);
        return eve ? card('td-fast', T('تذكير'), eve.title, eve.note || '', () => window.noonUI.go('calendar')) : null;
      } catch (_) { return null; }
    },
    quran() {
      const Q = window.noonQuran;
      if (!Q) return null;
      const p = Q.progress(), last = Q.last && Q.last();
      // Back where reading stopped, the way it was read (scrolling, or turning pages).
      return card('td-quran', T('وردك اليوم'), last ? last.label : T('ابدأ القراءة'),
        `${I.num(p.today)} / ${I.num(p.goal)} ${T('صفحات')}`, () => (last ? Q.resume() : window.noonUI.go('quran')), bar(p.today, p.goal));
    },
    adhkar() {
      const Z = window.noonAdhkar;
      if (!Z || !Z.period) return null;
      const pr = Z.progress('am-pm'), am = Z.period() === 'am';
      return card(`td-adhkar${pr.complete ? ' is-done' : ''}`, T(am ? 'أذكار الصباح' : 'أذكار المساء'),
        T(pr.complete ? 'تقبّل الله' : pr.done ? 'أكمل أذكارك' : 'لم تبدأ بعد'), `${I.num(pr.done)} / ${I.num(pr.total)}`,
        () => Z.open('am-pm'), bar(pr.done, pr.total));
    },
    hifz() {
      const H = window.noonHifz && window.noonHifz.summary();
      return H && H.due ? card('td-hifz', T('مراجعة الحفظ'), H.next, `${I.num(H.due)} ${T('للمراجعة اليوم')}`, () => window.noonHifz.open()) : null;
    },
    remind() {
      const RM = window.noonReminders;
      const n = RM && RM.upcoming().find((x) => x.t - Date.now() < 864e5);
      return n ? card('td-remind', T('التذكير القادم'), n.r.title || T('تذكير'), RM.when(n.t), () => RM.open()) : null;
    },
    invite() {
      let code = '';
      try { code = localStorage.getItem('noon-khatma-code') || ''; } catch (_) {}
      return code && window.noonKhatma ? card('td-fast', T('دعوة لختمة جماعية'), code, T('اضغط للانضمام'), () => window.noonKhatma.open(code)) : null;
    },
    listen() {
      const L = window.noonListen, last = L && L.last && L.last();
      return last && last.title ? card('td-listen', T('تابع الاستماع'), last.title, last.sub || '', () => { window.noonUI.go('listen'); L.resume(); }) : null;
    },
    library() {
      const B = window.noonLibrary, b = B && B.lastBook && B.lastBook();
      return b ? card('td-library', T('تابع القراءة في المكتبة'), I.isEn ? b.en : b.ar, b.label, () => B.openBook(b.slug, true)) : null;
    },
    hadith() {
      const X = window.NOON_EXTRAS;
      if (!X || !X.forty || !X.forty.length) return null;
      const h = X.forty[Math.floor(Date.now() / 864e5) % X.forty.length]; // the same as the library's «حديث اليوم»
      const text = String(h.ar).replace(/\s+/g, ' ').trim();
      return card('td-hadith', T('حديث اليوم'), `${T('الأربعون النووية')} ${I.num(h.n)}`, text.length > 90 ? `${text.slice(0, 90)}…` : text,
        () => window.noonLibrary && window.noonLibrary.open());
    },
    book() {
      const B = window.noonLibrary, b = cfg.book && B && B.book && B.book(cfg.book);
      if (!b) return card('td-library', T('كتاب مثبّت'), T('اختر كتاباً'), T('من صفحة «كروت يومي» في الإعدادات'), customize);
      return card('td-library', T('كتابك'), I.isEn ? b.en : b.ar, I.isEn ? b.authorEn : b.author, () => B.openBook(b.slug, true));
    },
    tasbih() {
      const Z = window.noonAdhkar;
      if (!Z || !Z.tasbeeh) return null;
      const t = Z.tasbeeh();
      const c = card('td-tasbih', T('المسبحة'), t.phrase, `${I.num(t.n)} · ${T('اضغط لتسبّح')}`, () => {
        const n = Z.tasbeehTap();
        const sub = c.querySelector('.td-sub');
        if (sub) sub.textContent = `${I.num(n)} · ${T('اضغط لتسبّح')}`;
      });
      return c;
    },
    khatma() {
      return window.noonKhatma ? card('td-khatma', T('الختمة الجماعية'), T('اقرؤوا القرآن معاً'), T('اقسموا الختمة على الأجزاء مع أهلك وأصحابك'), () => window.noonKhatma.open()) : null;
    },
    radio() {
      const L = window.noonListen;
      if (!L || !L.favorite) return null;
      const f = L.favorite();
      if (!f) return card('td-listen', T('إذاعتك المفضلة'), T('اختر إذاعة'), T('اضغط النجمة بجانب أي إذاعة'), () => window.noonUI.go('listen'));
      return card('td-listen', T('إذاعتك المفضلة'), f.name || T('الإذاعة'), T('اضغط للتشغيل'), () => { window.noonUI.go('listen'); L.playFavorite(); });
    }
  };

  // ---- the qibla card's live dial ----
  // While the card is on screen and the phone has a compass, the dial turns so its arrow points to
  // the qibla in the room; elsewhere it stays still, north up.
  let qWatch = null, qObserver = null;
  function liveQibla(c, dial, bearing) {
    if (qObserver) qObserver.disconnect();
    if (qWatch) { qWatch(); qWatch = null; }
    if (!window.noonQibla || !window.IntersectionObserver) return;
    qObserver = new IntersectionObserver((entries) => {
      const seen = entries[entries.length - 1].isIntersecting;
      if (seen && !qWatch) {
        qWatch = window.noonQibla.watch((h, info) => {
          dial.style.setProperty('--qibla', `${bearing - h}deg`);
          c.classList.add('is-live');
          c.classList.toggle('is-aligned', Math.abs(window.noonCompassCore.offset(bearing, h)) <= 3);
          c.classList.toggle('is-calibrate', !!(info && info.calibrate));
        });
      } else if (!seen && qWatch) { qWatch(); qWatch = null; c.classList.remove('is-live'); dial.style.setProperty('--qibla', `${Math.round(bearing)}deg`); }
    });
    qObserver.observe(c);
  }

  // ---- long press on a card: hide it, move it, or open the choice of cards ----
  let menu = null;
  function closeMenu() { if (menu) { menu.remove(); menu = null; } }
  function openMenu(c, id) {
    closeMenu();
    menu = el('div', 'td-menu');
    menu.setAttribute('role', 'menu');
    const item = (label, run) => { const b = button('td-menu-item', T(label), () => { closeMenu(); run(); }); b.setAttribute('role', 'menuitem'); return b; };
    menu.append(el('b', 'td-menu-title', T(NAMES[id])),
      item('أظهره قبل', () => { cfg = C.move(cfg, id, -1, true); save(); render(); }),
      item('أظهره بعد', () => { cfg = C.move(cfg, id, 1, true); save(); render(); }),
      item('إخفاء هذا الكارت', () => { cfg = C.toggle(cfg, id, false); save(); render(); toast(T('أُخفي الكارت. أعده من الإعدادات › كروت يومي.')); }),
      item('تخصيص الكروت', customize));
    c.after(menu);
    const first = menu.querySelector('button');
    if (first) first.focus();
  }
  function longPress(c, id) {
    let t = 0, fired = false, x = 0, y = 0;
    c.addEventListener('pointerdown', (ev) => { fired = false; x = ev.clientX; y = ev.clientY; t = setTimeout(() => { fired = true; if (navigator.vibrate) navigator.vibrate(20); openMenu(c, id); }, 550); });
    const cancel = () => clearTimeout(t);
    c.addEventListener('pointermove', (ev) => { if (Math.abs(ev.clientX - x) > 10 || Math.abs(ev.clientY - y) > 10) cancel(); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((e) => c.addEventListener(e, cancel));
    // The press that opened the menu does not also open the card.
    c.addEventListener('click', (ev) => { if (fired) { ev.stopImmediatePropagation(); ev.preventDefault(); fired = false; } }, true);
    c.addEventListener('contextmenu', (ev) => { ev.preventDefault(); if (!fired) openMenu(c, id); });
  }
  document.addEventListener('pointerdown', (ev) => { if (menu && !menu.contains(ev.target)) closeMenu(); });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') closeMenu(); });

  function render() {
    closeMenu();
    const cards = [];
    for (const id of C.visible(cfg)) {
      let c = null;
      try { c = BUILD[id](); } catch (_) { c = null; }
      if (!c) continue;
      c.dataset.card = id;
      longPress(c, id);
      cards.push(c);
    }
    if (!cards.some((c) => c.dataset.card === 'qibla')) { if (qObserver) qObserver.disconnect(); if (qWatch) { qWatch(); qWatch = null; } }
    box.replaceChildren(...cards);
  }

  // ---- Settings › «كروت يومي» ----
  function customize() { if (window.noonSettings) window.noonSettings.open('today'); }
  function buildSettings(host) {
    const draw = () => {
      host.replaceChildren();
      host.append(el('p', 'st-note', T('اختر الكروت التي تظهر تحت الساعة ورتّبها. ويمكنك أيضاً الضغط مطوّلاً على أي كارت لإخفائه أو نقله.')));
      const list = el('div', 'st-list');
      const all = C.arrange(cfg);
      all.forEach((x, k) => {
        const row = el('div', 'st-row td-set-row');
        const lab = el('label', 'td-set-label');
        const cb = el('input'); cb.type = 'checkbox'; cb.checked = x.on;
        cb.addEventListener('change', () => { cfg = C.toggle(cfg, x.id, cb.checked); save(); render(); });
        const txt = el('span', 'st-row-text');
        txt.append(el('b', '', T(NAMES[x.id])));
        if (NOTES[x.id]) txt.append(el('small', '', T(NOTES[x.id])));
        lab.append(cb, txt);
        const up = button('td-set-move', '▲', () => { cfg = C.move(cfg, x.id, -1); save(); render(); draw(); }, T('أظهره قبل'));
        const down = button('td-set-move', '▼', () => { cfg = C.move(cfg, x.id, 1); save(); render(); draw(); }, T('أظهره بعد'));
        up.disabled = k === 0; down.disabled = k === all.length - 1;
        row.append(lab, up, down);
        list.append(row);
      });
      host.append(list);
      // The pinned book.
      const B = window.noonLibrary;
      if (B && B.books) {
        const g = el('section', 'st-group');
        g.append(el('h3', 'st-group-name', T('الكتاب المثبّت')));
        const sel = el('select', 'td-set-book');
        sel.setAttribute('aria-label', T('الكتاب المثبّت'));
        sel.append(new Option(T('اختر كتاباً'), ''));
        B.books().forEach((b) => sel.append(new Option(I.isEn ? b.en : b.ar, b.slug)));
        sel.value = cfg.book || '';
        sel.addEventListener('change', () => {
          cfg.book = sel.value || undefined;
          if (sel.value) cfg = C.toggle(cfg, 'book', true);
          save(); render(); draw();
        });
        g.append(sel);
        host.append(g);
      }
      host.append(button('btn btn-quiet', T('رجوع إلى الكروت الأصلية'), () => { cfg = {}; save(); render(); draw(); }));
    };
    draw();
  }

  render();
  setInterval(render, 60000);
  ['noon-adhkar-done', 'noon-place', 'noon-storage', 'noon-view', 'noon-sunnah', 'noon-hifz', 'noon-reminders'].forEach((e) => window.addEventListener(e, () => setTimeout(render, 50)));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
  if (window.noonUI.onRemote) window.noonUI.onRemote(KEY, () => { cfg = load(KEY, {}); render(); });
  window.noonToday = { render, customize, buildSettings, cards: () => C.visible(cfg) };
})();
