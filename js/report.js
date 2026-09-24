// ---------- Report: today at a glance, the week's focus, best focus time, distractions ----------
(() => {
  'use strict';
  const { T, I, el, button, dayKey, addDays, toast } = window.noonUI;
  const root = document.getElementById('view-report');
  const NS = 'http://www.w3.org/2000/svg';
  const dateOf = (key) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); };
  const wd = new Intl.DateTimeFormat(I.locale, { weekday: 'short' });
  const longDate = new Intl.DateTimeFormat(I.locale, { weekday: 'long', day: 'numeric', month: 'long' });

  function sessions() { return window.noonFocusPlus ? window.noonFocusPlus.sessions() : []; }
  function minutesOn(day) { return sessions().filter((s) => dayKey(s.start) === day).reduce((a, s) => a + s.minutes, 0); }
  function tasksDoneOn(day) {
    const tasks = window.noonTasks ? window.noonTasks.get() : [];
    return tasks.filter((t) => t.completed && t.completedAt && dayKey(t.completedAt) === day).length;
  }
  function dur(mins) { return I.dur(Math.floor(mins / 60), mins % 60); }

  function tile(label, value, sub) {
    const t = el('div', 'stat');
    t.append(el('span', 'stat-label', label), el('span', 'stat-value', value));
    if (sub) t.append(el('span', 'stat-sub', sub));
    return t;
  }

  function render() {
    if (root.hidden) return; // rebuilt when the tab is opened
    root.replaceChildren();
    const today = dayKey();
    const head = el('div', 'view-head');
    head.append(el('h2', '', T('تقرير التركيز')), el('span', 'view-sub', longDate.format(new Date())));
    root.append(head);

    // Today.
    const todaySessions = sessions().filter((s) => dayKey(s.start) === today);
    const habits = window.noonHabits ? window.noonHabits.summary(today) : { done: 0, total: 0 };
    let streak = 0, d = today;
    if (!minutesOn(d)) d = addDays(d, -1);
    while (minutesOn(d) > 0) { streak++; d = addDays(d, -1); }
    const tiles = el('div', 'stats');
    tiles.append(
      tile(T('تركيز اليوم'), dur(minutesOn(today)), `${I.num(todaySessions.length)} ${T('جلسات')}`),
      tile(T('مهام أنجزتها'), I.num(tasksDoneOn(today)), T('اليوم')),
      tile(T('العادات'), `${I.num(habits.done)} / ${I.num(habits.total)}`, T('اليوم')),
      tile(T('أيام تركيز متتالية'), I.num(streak), streak ? T('استمر!') : T('ابدأ جلسة اليوم')));
    root.append(tiles);

    // Last 7 days of focus minutes.
    const days = [];
    for (let i = 6; i >= 0; i--) { const k = addDays(today, -i); days.push({ key: k, mins: minutesOn(k), tasks: tasksDoneOn(k) }); }
    const weekTotal = days.reduce((a, x) => a + x.mins, 0);
    const chartBox = el('section', 'chart-box');
    chartBox.append(el('h3', '', T('دقائق التركيز في آخر ٧ أيام')), el('p', 'view-sub', `${T('الإجمالي')}: ${dur(weekTotal)}`));
    chartBox.append(weekChart(days));
    root.append(chartBox);

    // Best time of day, once there are enough sessions.
    const all = sessions();
    const best = el('section', 'chart-box');
    best.append(el('h3', '', T('أفضل وقت لتركيزك')));
    if (all.length < 5) {
      best.append(el('p', 'hint', T('بعد ٥ جلسات تركيز مكتملة سنعرض لك الوقت الذي تركّز فيه أكثر.')));
    } else {
      const byHour = new Array(24).fill(0);
      for (const s of all) byHour[new Date(s.start).getHours()] += s.minutes;
      let top = 0;
      byHour.forEach((m, h) => { if (m > byHour[top]) top = h; });
      const hourFmt = new Intl.DateTimeFormat(I.locale, { hour: 'numeric' });
      const label = `${hourFmt.format(new Date(2000, 0, 1, top))} – ${hourFmt.format(new Date(2000, 0, 1, (top + 1) % 24))}`;
      best.append(el('p', 'best-time', label),
        el('p', 'hint', `${T('ركّزت في هذه الساعة')} ${dur(byHour[top])} ${T('من أصل')} ${dur(all.reduce((a, s) => a + s.minutes, 0))}. ${T('حاول أن تضع أصعب مهامك فيها.')}`));
    }
    root.append(best);

    // Distraction box.
    const box = el('section', 'chart-box');
    const items = window.noonFocusPlus ? window.noonFocusPlus.distractions() : [];
    const open = items.filter((x) => !x.done);
    box.append(el('h3', '', `${T('صندوق المشتتات')} (${I.num(open.length)})`));
    if (!items.length) box.append(el('p', 'hint', T('أثناء التركيز، إذا خطرت لك فكرة، اضغط «فكرة مشتتة» واكتبها ثم أكمل. ستجدها هنا لاحقاً.')));
    const ul = el('ul', 'distract-list');
    for (const x of items.slice(0, 30)) {
      const li = el('li', x.done ? 'is-done' : '');
      li.append(el('span', 'distract-text', x.text));
      const acts = el('span', 'distract-acts');
      if (!x.done) {
        acts.append(button('link-btn', T('اجعلها مهمة'), () => {
          if (window.noonTasks && window.noonTasks.add(x.text)) {
            window.noonFocusPlus.setDistraction(x.id, { done: true });
            toast(T('أُضيفت إلى المهام.'));
          }
        }), button('link-btn', T('تم'), () => window.noonFocusPlus.setDistraction(x.id, { done: true })));
      }
      acts.append(button('link-btn danger', T('حذف'), () => window.noonFocusPlus.removeDistraction(x.id)));
      li.append(acts);
      ul.append(li);
    }
    box.append(ul);
    root.append(box);
  }

  // Single-series bar chart: rounded tops on a baseline, value on hover and on the tallest bar.
  function weekChart(days) {
    const W = 560, H = 190, padL = 8, padR = 8, padT = 22, padB = 30;
    const max = Math.max(30, ...days.map((d) => d.mins));
    const step = max <= 60 ? 15 : max <= 180 ? 30 : 60;
    const top = Math.ceil(max / step) * step;
    const y = (m) => padT + (H - padT - padB) * (1 - m / top);
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('class', 'week-chart');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', days.map((d) => `${wd.format(dateOf(d.key))}: ${dur(d.mins)}`).join('، '));
    const mk = (tag, attrs, text) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); if (text !== undefined) n.textContent = text; svg.append(n); return n; };
    for (let v = 0; v <= top; v += step) {
      mk('line', { x1: padL, x2: W - padR, y1: y(v), y2: y(v), class: v === 0 ? 'axis' : 'grid' });
    }
    const slot = (W - padL - padR) / days.length, bw = Math.min(44, slot * 0.56);
    const tallest = days.reduce((a, d, i) => (d.mins > days[a].mins ? i : a), 0);
    const tip = el('div', 'chart-tip');
    tip.hidden = true;
    days.forEach((d, i) => {
      // Right-to-left pages read the week from the right.
      const idx = I.isEn ? i : days.length - 1 - i;
      const cx = padL + slot * idx + slot / 2;
      const h = Math.max(0, y(0) - y(d.mins));
      const isToday = i === days.length - 1;
      if (d.mins > 0) {
        const r = Math.min(4, h / 2, bw / 2);
        const x0 = cx - bw / 2, y0 = y(0) - h;
        mk('path', { class: `bar${isToday ? ' is-today' : ''}`,
          d: `M${x0},${y(0)} V${y0 + r} Q${x0},${y0} ${x0 + r},${y0} H${x0 + bw - r} Q${x0 + bw},${y0} ${x0 + bw},${y0 + r} V${y(0)} Z` });
      }
      if (i === tallest && d.mins > 0) mk('text', { x: cx, y: y(d.mins) - 7, class: 'bar-val', 'text-anchor': 'middle' }, dur(d.mins));
      mk('text', { x: cx, y: H - 10, class: `bar-day${isToday ? ' is-today' : ''}`, 'text-anchor': 'middle' }, isToday ? T('اليوم') : wd.format(dateOf(d.key)));
      // Hover target wider than the bar.
      const hit = mk('rect', { x: cx - slot / 2, y: padT, width: slot, height: H - padT - padB, class: 'hit' });
      hit.addEventListener('pointerenter', () => {
        tip.replaceChildren(el('b', '', longDate.format(dateOf(d.key))), el('span', '', `${T('تركيز')}: ${dur(d.mins)}`), el('span', '', `${T('مهام')}: ${I.num(d.tasks)}`));
        tip.hidden = false;
        tip.style.insetInlineStart = `${((I.isEn ? cx : W - cx) / W) * 100}%`;
      });
      hit.addEventListener('pointerleave', () => { tip.hidden = true; });
    });
    const wrap = el('div', 'chart-wrap');
    wrap.append(svg, tip);
    return wrap;
  }

  window.addEventListener('noon-view', (ev) => { if (ev.detail.view === 'report') render(); });
  ['noon-focuslog', 'noon-distractions'].forEach((e) => window.addEventListener(e, render));
  render();
})();
