// ---------- Memorisation: what you know by heart, and when to review it ----------
// You add a surah or a passage you have memorised; each one comes back for review on a growing
// schedule (Leitner boxes: 1, 2, 4, 7, 15, 30, 60 days). "Well" moves it a box up, "shaky" a box
// down, "forgot" back to tomorrow. Synced like the other settings (noon-sweep-hifz).
(() => {
  'use strict';
  const { T, I, el, button, load, store, toast, dayKey, addDays, uid, onRemote } = window.noonUI;
  const M = window.NOON_QURAN_META;
  const KEY = 'noon-sweep-hifz';
  const GAPS = [1, 2, 4, 7, 15, 30, 60];
  let S = Object.assign({ items: [] }, load(KEY, {}));
  const save = () => { S.updatedAt = Date.now(); store(KEY, S); window.dispatchEvent(new CustomEvent('noon-hifz')); };
  onRemote(KEY, () => { S = Object.assign({ items: [] }, load(KEY, {})); if (open) render(); });

  const name = (s) => (I.isEn ? M.surahs[s][1] : M.surahs[s][0].replace(/^سُورَةُ\s*/, ''));
  const count = (s) => M.surahs[s][4];
  const label = (it) => (it.from === 1 && it.to === count(it.s) ? name(it.s) : `${name(it.s)} ${I.num(it.from)}–${I.num(it.to)}`);
  const today = () => dayKey();
  const due = () => S.items.filter((it) => it.due <= today()).sort((a, b) => a.due.localeCompare(b.due) || a.s - b.s);
  // A review day as people say it: today, tomorrow, or "6 October" (an ISO date reads backwards in RTL).
  const when = (k) => (k === today() ? T('اليوم') : k === addDays(today(), 1) ? T('غداً')
    : new Date(k.replace(/-/g, '/')).toLocaleDateString(I.locale, { day: 'numeric', month: 'long' }));
  const ayat = () => S.items.reduce((n, it) => n + (it.to - it.from + 1), 0);

  function add(s, from, to) {
    from = Math.max(1, Math.min(count(s), from)); to = Math.max(from, Math.min(count(s), to));
    S.items.push({ id: uid(), s, from, to, box: 0, added: today(), due: addDays(today(), 1), reviews: 0 });
    save();
  }
  // well: a box up; shaky: a box down; forgot: back to the start.
  function grade(it, how) {
    it.box = how === 'well' ? Math.min(GAPS.length - 1, it.box + 1) : how === 'shaky' ? Math.max(0, it.box - 1) : 0;
    it.due = addDays(today(), GAPS[it.box]);
    it.last = today();
    it.reviews = (it.reviews || 0) + 1;
    save();
  }

  // ---- the screen: a full page, closed by the back key like Settings ----
  const root = el('div', 'st hz');
  root.hidden = true;
  root.dir = I.isEn ? 'ltr' : 'rtl';
  root.setAttribute('role', 'dialog');
  const bar = el('header', 'st-bar');
  const back = button('st-back', I.isEn ? '←' : '→', () => history.back(), T('رجوع'));
  bar.append(back, el('h2', 'st-title', T('متابعة الحفظ')));
  const body = el('div', 'st-body');
  root.append(bar, body);
  document.body.append(root);
  let open = false;
  function show() {
    if (open) return;
    open = true;
    root.hidden = false;
    document.body.classList.add('st-open');
    history.pushState({ hz: 1 }, '');
    render();
  }
  function hide() {
    open = false;
    root.hidden = true;
    document.body.classList.remove('st-open');
  }
  addEventListener('popstate', () => { if (open) hide(); });

  function render() {
    body.replaceChildren();
    const d = due();
    const head = el('div', 'hz-head');
    head.append(stat(I.num(S.items.length), 'مقطعاً محفوظاً'), stat(I.num(ayat()), 'آية'), stat(I.num(d.length), 'للمراجعة اليوم'));
    body.append(head);

    // Today's reviews.
    const g = el('section', 'st-group');
    g.append(el('h3', 'st-group-name', T('مراجعة اليوم')));
    if (!d.length) g.append(el('p', 'st-note', T(S.items.length ? 'لا مراجعة اليوم. أحسنت، ثبّتك الله.' : 'أضف ما حفظته بالأسفل، ونذكّرك بمراجعته في وقته.')));
    else {
      const list = el('div', 'st-list');
      d.forEach((it) => {
        const r = el('div', 'hz-row');
        const txt = el('div', 'hz-text');
        txt.append(el('b', '', label(it)), el('small', '', it.last ? `${T('آخر مراجعة')}: ${when(it.last)}` : T('أول مراجعة')));
        const read = button('btn btn-quiet', T('اقرأ'), () => { history.back(); setTimeout(() => window.noonQuran && window.noonQuran.openAyah(it.s + 1, it.from), 150); });
        const acts = el('div', 'hz-acts');
        acts.append(
          button('hz-g hz-well', T('أتقنتها'), () => { grade(it, 'well'); render(); }),
          button('hz-g hz-shaky', T('تعثّرت'), () => { grade(it, 'shaky'); render(); }),
          button('hz-g hz-forgot', T('نسيتها'), () => { grade(it, 'forgot'); render(); })
        );
        r.append(txt, read, acts);
        list.append(r);
      });
      g.append(list);
    }
    body.append(g);

    // Add what you know.
    const a = el('section', 'st-group');
    a.append(el('h3', 'st-group-name', T('أضف محفوظاً')));
    const form = el('div', 'st-list hz-form');
    const sel = el('select', 'ls-select');
    sel.setAttribute('aria-label', T('السورة'));
    M.surahs.forEach((_, k) => sel.append(new Option(`${I.num(k + 1)}. ${name(k)}`, String(k))));
    sel.value = String(S.lastSurah != null ? S.lastSurah : 113);
    const from = el('input', 'ls-search'); from.type = 'number'; from.min = '1'; from.setAttribute('aria-label', T('من الآية'));
    const to = el('input', 'ls-search'); to.type = 'number'; to.min = '1'; to.setAttribute('aria-label', T('إلى الآية'));
    const fill = () => { const s = Number(sel.value); from.value = '1'; to.value = String(count(s)); from.max = to.max = String(count(s)); };
    sel.addEventListener('change', fill);
    fill();
    const range = el('div', 'hz-range');
    range.append(el('span', '', T('من الآية')), from, el('span', '', T('إلى')), to);
    const addBtn = button('btn btn-primary', T('أضف'), () => {
      const s = Number(sel.value);
      S.lastSurah = s;
      add(s, Number(from.value) || 1, Number(to.value) || count(s));
      toast(T('أُضيف. ستظهر للمراجعة غداً إن شاء الله.'));
      render();
    });
    form.append(sel, range, addBtn);
    a.append(form);
    body.append(a);

    // Everything you know, with its next review.
    if (S.items.length) {
      const all = el('section', 'st-group');
      all.append(el('h3', 'st-group-name', T('كل المحفوظ')));
      const list = el('div', 'st-list');
      [...S.items].sort((x, y) => x.s - y.s || x.from - y.from).forEach((it) => {
        const r = el('div', 'hz-row');
        const txt = el('div', 'hz-text');
        txt.append(el('b', '', label(it)), el('small', '', `${T('المراجعة القادمة')}: ${when(it.due < today() ? today() : it.due)}`));
        const del = button('link-btn danger', T('حذف'), () => { S.items = S.items.filter((x) => x !== it); save(); render(); });
        r.append(txt, del);
        list.append(r);
      });
      all.append(list);
      body.append(all);
    }
    body.append(el('p', 'st-note', T('المراجعة على فترات تزداد كلما أتقنت: يوم، يومان، ٤، ٧، ١٥، ٣٠، ٦٠ يوماً. وللتسميع: «التسميع والحفظ» في المصحف يخفي الآيات.')));
  }
  function stat(n, what) { const s = el('div', 'hz-stat'); s.append(el('b', '', n), el('span', '', T(what))); return s; }

  // The phone's back key closes it through the history, like Settings.
  window.noonHifz = { open: show, summary: () => ({ items: S.items.length, due: due().length, next: due()[0] ? label(due()[0]) : '' }) };
})();
