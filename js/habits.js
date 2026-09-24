// ---------- Habits & wird: daily ticks or counts, streaks and a 12-week calendar ----------
(() => {
  'use strict';
  const { T, I, el, button, load, store, dayKey, addDays, uid, onRemote } = window.noonUI;
  const KEY = 'noon-sweep-habits';
  const root = document.getElementById('view-habits');
  const DEFAULTS = [
    { id: 'adhkar-am', name: 'أذكار الصباح', type: 'check', link: 'am' },
    { id: 'adhkar-pm', name: 'أذكار المساء', type: 'check', link: 'pm' },
    { id: 'quran', name: 'ورد القرآن', type: 'count', target: 5, unit: 'صفحات' },
    { id: 'istighfar', name: 'الاستغفار', type: 'count', target: 100, unit: 'مرة' },
    { id: 'qiyam', name: 'قيام الليل', type: 'check' },
    { id: 'fasting', name: 'صيام تطوع', type: 'check' }
  ];
  let S = load(KEY, null);
  if (!S || !Array.isArray(S.habits)) S = { habits: DEFAULTS.map((h) => Object.assign({ createdAt: Date.now() }, h)), log: {} };
  const save = () => { S.updatedAt = Date.now(); store(KEY, S); };
  const val = (h, day) => ((S.log[day] || {})[h.id] || 0);
  const done = (h, day) => (h.type === 'count' ? val(h, day) >= (h.target || 1) : val(h, day) > 0);
  function set(h, day, v) {
    (S.log[day] = S.log[day] || {})[h.id] = Math.max(0, v);
    save();
  }
  // Consecutive days done, counting back from today (or yesterday if today isn't done yet).
  function streak(h) {
    let day = dayKey(), n = 0;
    if (!done(h, day)) day = addDays(day, -1);
    while (done(h, day)) { n++; day = addDays(day, -1); }
    return n;
  }
  const weekday = new Intl.DateTimeFormat(I.locale, { weekday: 'narrow' });
  const longDate = new Intl.DateTimeFormat(I.locale, { weekday: 'long', day: 'numeric', month: 'long' });
  const dateOf = (key) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); };
  let expanded = null;

  function render() {
    root.replaceChildren();
    const today = dayKey();
    const head = el('div', 'view-head');
    const doneCount = S.habits.filter((h) => done(h, today)).length;
    head.append(el('h2', '', T('العادات والورد')), el('span', 'view-sub', `${I.num(doneCount)} / ${I.num(S.habits.length)} ${T('اليوم')}`));
    root.append(head);

    const list = el('ul', 'habit-list');
    for (const h of S.habits) {
      const li = el('li', `habit${done(h, today) ? ' is-done' : ''}`);
      const main = el('div', 'habit-main');
      const name = el('div', 'habit-name');
      name.append(el('span', '', T(h.name)));
      const st = streak(h);
      const streakEl = el('span', `habit-streak${st ? '' : ' is-zero'}`);
      streakEl.innerHTML = '<svg viewBox="0 0 12 14" aria-hidden="true"><path d="M6 0c1 3 5 4 5 8.5A5 5 0 0 1 1 8.5C1 6.4 2 5 3.2 4c0 1.6.7 2.6 1.6 2.6C3.8 4.8 5 2 6 0z" fill="currentColor"/></svg>';
      streakEl.append(`${I.num(st)} ${T(st === 1 ? 'يوم' : 'أيام')}`);
      streakEl.title = T('أيام متتالية');
      name.append(streakEl);
      main.append(name);

      // Today's control: a tick, or a counter toward the target.
      const ctl = el('div', 'habit-ctl');
      if (h.type === 'count') {
        const v = val(h, today);
        ctl.append(
          button('habit-step', '−', () => { set(h, today, v - 1); render(); }, `${T('أنقص')} ${T(h.name)}`),
          el('span', 'habit-val', `${I.num(v)} / ${I.num(h.target)} ${T(h.unit || '')}`),
          button('habit-step', '+', () => { set(h, today, v + 1); render(); }, `${T('زوّد')} ${T(h.name)}`));
      } else {
        const tick = button(`habit-tick${done(h, today) ? ' is-on' : ''}`, '', () => { set(h, today, done(h, today) ? 0 : 1); render(); });
        tick.setAttribute('aria-pressed', String(done(h, today)));
        tick.setAttribute('aria-label', `${T(h.name)}: ${done(h, today) ? T('تم اليوم') : T('لم يتم بعد')}`);
        tick.innerHTML = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.2 5 8.6 9.6 3.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        ctl.append(tick);
      }
      main.append(ctl);
      li.append(main);

      // The last 7 days at a glance; the full 12 weeks on demand.
      const week = el('div', 'habit-week');
      for (let i = 6; i >= 0; i--) {
        const day = addDays(today, -i);
        const dot = el('span', `habit-day${done(h, day) ? ' is-on' : ''}${i === 0 ? ' is-today' : ''}`, weekday.format(dateOf(day)));
        dot.title = `${longDate.format(dateOf(day))}: ${done(h, day) ? T('تم') : T('لم يتم')}`;
        week.append(dot);
      }
      const more = button('link-btn', expanded === h.id ? T('إخفاء') : T('آخر ١٢ أسبوع'), () => { expanded = expanded === h.id ? null : h.id; render(); });
      week.append(more);
      li.append(week);
      if (expanded === h.id) li.append(heatmap(h), habitTools(h));
      list.append(li);
    }
    root.append(list);
    root.append(addForm());
  }

  function heatmap(h) {
    const wrap = el('div', 'heatmap');
    wrap.setAttribute('role', 'img');
    const today = dayKey();
    let total = 0;
    // 12 columns of weeks, oldest first; each cell is one day.
    const start = addDays(today, -(12 * 7 - 1));
    for (let i = 0; i < 12 * 7; i++) {
      const day = addDays(start, i);
      const on = done(h, day);
      if (on) total++;
      const cell = el('span', `heat${on ? ' is-on' : ''}${day === today ? ' is-today' : ''}`);
      cell.title = `${longDate.format(dateOf(day))}: ${on ? T('تم') : T('لم يتم')}`;
      wrap.append(cell);
    }
    wrap.setAttribute('aria-label', `${T(h.name)}: ${I.num(total)} ${T('يوم من آخر ٨٤ يوم')}`);
    const box = el('div', 'heat-box');
    box.append(wrap, el('p', 'hint', `${I.num(total)} ${T('يوم من آخر ٨٤ يوم')}`));
    return box;
  }

  function habitTools(h) {
    const row = el('div', 'habit-tools');
    let armed = null;
    const del = button('link-btn danger', T('حذف العادة'), () => {
      if (!armed) { del.textContent = T('تأكيد الحذف'); armed = setTimeout(() => { armed = null; del.textContent = T('حذف العادة'); }, 3000); return; }
      S.habits = S.habits.filter((x) => x.id !== h.id); save(); expanded = null; render();
    });
    if (h.link) row.append(button('link-btn', T('افتح الأذكار'), () => window.noonAdhkar && window.noonAdhkar.open('am-pm')));
    row.append(del);
    return row;
  }

  function addForm() {
    const form = el('form', 'habit-add');
    const name = el('input'); name.id = 'habitName'; name.placeholder = T('عادة جديدة، مثلاً: قراءة ٢٠ صفحة');
    name.setAttribute('aria-label', T('اسم العادة'));
    const type = el('select'); type.id = 'habitType'; type.setAttribute('aria-label', T('نوع العادة'));
    type.append(new Option(T('مرة في اليوم'), 'check'), new Option(T('عدد في اليوم'), 'count'));
    const target = el('input'); target.id = 'habitTarget'; target.type = 'number'; target.min = '1'; target.value = '10';
    target.setAttribute('aria-label', T('الهدف اليومي'));
    target.hidden = true;
    type.addEventListener('change', () => { target.hidden = type.value !== 'count'; });
    const add = button('btn btn-primary', T('إضافة عادة')); add.type = 'submit';
    form.append(name, type, target, add);
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      if (!name.value.trim()) return;
      S.habits.push({ id: uid(), name: name.value.trim(), type: type.value, target: Math.max(1, Number(target.value) || 1), unit: '', createdAt: Date.now() });
      save(); render();
    });
    return form;
  }

  // Finishing the morning/evening adhkar ticks the matching habit.
  window.addEventListener('noon-adhkar-done', (ev) => {
    if (ev.detail.cat !== 'am-pm') return;
    const h = S.habits.find((x) => x.link === ev.detail.period);
    if (h && !done(h, dayKey())) { set(h, dayKey(), 1); render(); }
  });
  setInterval(() => { if (root.dataset.day !== dayKey()) { root.dataset.day = dayKey(); render(); } }, 60000);
  root.dataset.day = dayKey();
  onRemote(KEY, () => { S = load(KEY, S); render(); });
  window.noonHabits = { summary: (day) => ({ done: S.habits.filter((h) => done(h, day)).length, total: S.habits.length }) };
  render();
})();
