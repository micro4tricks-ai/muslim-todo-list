// ---------- My prayers: the five prayers (in congregation, on time, late, missed), the twelve
// sunnah rak'ahs, witr and duha, and a count of prayers to make up ----------
(() => {
  'use strict';
  const { T, I, el, button, load, store, dayKey, addDays, toast, onRemote } = window.noonUI;
  const X = window.NOON_EXTRAS || { texts: {} };
  const KEY = 'noon-sweep-prayers';
  const root = document.getElementById('prayerLog');
  if (!root) return;
  const PRAYERS = [['fajr', 'الفجر'], ['dhuhr', 'الظهر'], ['asr', 'العصر'], ['maghrib', 'المغرب'], ['isha', 'العشاء']];
  const STATES = [['jamaah', 'جماعة'], ['ontime', 'في وقتها'], ['late', 'متأخرة'], ['missed', 'فاتتني']];
  // The twelve rak'ahs (at-Tirmidhi 415) and the other voluntary prayers.
  const SUNNAH = [['fajrB', 'سنة الفجر (٢)', 2], ['dhuhrB', 'قبل الظهر (٤)', 4], ['dhuhrA', 'بعد الظهر (٢)', 2], ['maghribA', 'بعد المغرب (٢)', 2], ['ishaA', 'بعد العشاء (٢)', 2]];
  const EXTRA = [['witr', 'الوتر'], ['duha', 'الضحى'], ['qiyam', 'قيام الليل']];
  let S = Object.assign({ log: {}, qada: {} }, load(KEY, {}));
  const save = () => { S.updatedAt = Date.now(); store(KEY, S); window.dispatchEvent(new CustomEvent('noon-prayers')); };
  const day = (k) => (S.log[k] = S.log[k] || {});
  let open = false;

  function mark(prayer, state, k = dayKey()) {
    const d = day(k);
    const was = d[prayer];
    d[prayer] = was === state ? undefined : state;
    // A missed prayer joins the list to make up; changing it back takes it off.
    if (state === 'missed' && was !== 'missed') S.qada[prayer] = (S.qada[prayer] || 0) + 1;
    if (was === 'missed' && d[prayer] !== 'missed') S.qada[prayer] = Math.max(0, (S.qada[prayer] || 0) - 1);
    save();
    render();
  }
  function score(k) {
    const d = S.log[k] || {};
    const done = PRAYERS.filter(([p]) => d[p] && d[p] !== 'missed').length;
    const onTime = PRAYERS.filter(([p]) => d[p] === 'jamaah' || d[p] === 'ontime').length;
    const rak = SUNNAH.reduce((a, [s, , n]) => a + (d[s] ? n : 0), 0);
    return { done, onTime, jamaah: PRAYERS.filter(([p]) => d[p] === 'jamaah').length, rak };
  }

  function render() {
    root.replaceChildren();
    const today = dayKey(), d = S.log[today] || {}, sc = score(today);
    const snap = window.noonAstro && window.noonAstro.snapshot(Date.now());
    const box = el('section', 'pr-box');
    const head = el('div', 'view-head');
    head.append(el('h2', '', T('صلواتي')), el('span', 'view-sub', `${I.num(sc.onTime)} / ${I.num(5)} ${T('في وقتها')} · ${I.num(sc.rak)} / ${I.num(12)} ${T('من الرواتب')}`));
    box.append(head);
    const list = el('div', 'pr-list');
    PRAYERS.forEach(([p, name]) => {
      const row = el('div', `pr-row${d[p] ? ` is-${d[p]}` : ''}`);
      const label = el('div', 'pr-name');
      label.append(el('b', '', T(name)));
      if (snap && Number.isFinite(snap.today[p])) label.append(el('small', '', snap.fmtHM(snap.today[p])));
      const seg = el('div', 'pr-states');
      STATES.forEach(([s, t]) => {
        const b = button(`pr-state is-${s}`, T(t), () => mark(p, s));
        b.setAttribute('aria-pressed', String(d[p] === s));
        b.setAttribute('aria-label', `${T(name)}: ${T(t)}`);
        seg.append(b);
      });
      row.append(label, seg);
      list.append(row);
    });
    box.append(list);
    const chips = el('div', 'pr-chips');
    [...SUNNAH, ...EXTRA].forEach(([s, t]) => {
      const b = button('chip', T(t), () => { const x = day(today); x[s] = x[s] ? undefined : 1; save(); render(); });
      b.setAttribute('aria-pressed', String(!!d[s]));
      chips.append(b);
    });
    box.append(el('p', 'hint', T('السنن الرواتب والنوافل:')), chips);

    // The last seven days.
    const week = el('div', 'pr-week');
    for (let i = 6; i >= 0; i--) {
      const k = addDays(today, -i), s = score(k);
      const c = el('span', `pr-day${i === 0 ? ' is-today' : ''}`);
      c.style.setProperty('--p', s.onTime / 5);
      c.title = `${new Date(k.replace(/-/g, '/')).toLocaleDateString(I.locale, { weekday: 'long', day: 'numeric', month: 'short' })}: ${I.num(s.onTime)}/٥`;
      c.append(el('b', '', I.num(s.onTime)), el('small', '', new Date(k.replace(/-/g, '/')).toLocaleDateString(I.locale, { weekday: 'narrow' })));
      week.append(c);
    }
    box.append(week);

    // Prayers to make up.
    const qd = el('details', 'pr-qada');
    qd.open = open;
    qd.addEventListener('toggle', () => { open = qd.open; });
    const total = PRAYERS.reduce((a, [p]) => a + (S.qada[p] || 0), 0);
    qd.append(el('summary', '', `${T('صلوات فائتة للقضاء')}: ${I.num(total)}`));
    const grid = el('div', 'pr-qada-grid');
    PRAYERS.forEach(([p, name]) => {
      const n = S.qada[p] || 0;
      const c = el('div', 'pr-q');
      c.append(el('b', '', T(name)), el('span', 'pr-q-n', I.num(n)),
        button('btn btn-quiet', T('قضيتُ واحدة'), () => { if (n) { S.qada[p] = n - 1; save(); render(); toast(T('تقبّل الله.')); } }),
        button('link-btn', '+', () => { S.qada[p] = n + 1; save(); render(); }, `${T('أضف فائتة')} ${T(name)}`));
      grid.append(c);
    });
    qd.append(grid);
    if (X.texts.qada) qd.append(quote('qada'));
    box.append(qd);
    const why = el('details', 'pr-why');
    why.append(el('summary', '', T('فضل الجماعة والرواتب')));
    ['jamaah', 'rawatib'].forEach((id) => { if (X.texts[id]) why.append(quote(id)); });
    box.append(why);
    root.append(box);
  }
  function quote(id) {
    const t = X.texts[id];
    const q = el('blockquote', 'cal-hadith');
    const a = el('p', 'cal-hadith-ar', t.ar); a.lang = 'ar'; a.dir = 'rtl';
    const e = el('p', 'cal-hadith-en', t.en); e.lang = 'en'; e.dir = 'ltr';
    q.append(...(I.isEn ? [e, a] : [a, e]), el('cite', '', I.isEn ? t.refEn : t.refAr));
    return q;
  }

  onRemote(KEY, () => { S = Object.assign({ log: {}, qada: {} }, load(KEY, {})); render(); });
  window.addEventListener('noon-view', (ev) => { if (ev.detail.view === 'habits') render(); });
  let last = dayKey();
  setInterval(() => { if (last !== dayKey()) { last = dayKey(); render(); } }, 60000);
  window.noonPrayers = { mark: (p, s) => mark(p, s), score, get: (k) => (S.log[k] || {}) };
  render();
})();
