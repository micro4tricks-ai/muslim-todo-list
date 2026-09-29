// ---------- Report: focus, tasks, habits, Quran and fasting over a day, week, month or any range ----------
(() => {
  'use strict';
  const { T, I, el, button, load, store, dayKey, addDays, toast } = window.noonUI;
  const root = document.getElementById('view-report');
  const NS = 'http://www.w3.org/2000/svg';
  const RANGE_KEY = 'noon-sweep-report-range';
  const dateOf = (key) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); };
  const wd = new Intl.DateTimeFormat(I.locale, { weekday: 'short' });
  const dm = new Intl.DateTimeFormat(I.locale, { day: 'numeric', month: 'short' });
  const longDate = new Intl.DateTimeFormat(I.locale, { weekday: 'long', day: 'numeric', month: 'long' });
  const daysBetween = (a, b) => Math.round((dateOf(b) - dateOf(a)) / 864e5);

  function sessions() { return window.noonFocusPlus ? window.noonFocusPlus.sessions() : []; }
  function minutesOn(day) { return sessions().filter((s) => dayKey(s.start) === day).reduce((a, s) => a + s.minutes, 0); }
  function tasksDoneOn(day) {
    const tasks = window.noonTasks ? window.noonTasks.get() : [];
    return tasks.filter((t) => t.completed && t.completedAt && dayKey(t.completedAt) === day).length;
  }
  const pagesOn = (day) => (window.noonQuran ? window.noonQuran.pagesOn(day) : 0);
  const habitDone = (id, day) => (window.noonHabits && window.noonHabits.doneOn ? window.noonHabits.doneOn(id, day) : false);
  function dur(mins) { return I.dur(Math.floor(mins / 60), mins % 60); }

  function tile(label, value, sub) {
    const t = el('div', 'stat');
    t.append(el('span', 'stat-label', label), el('span', 'stat-value', value));
    if (sub) t.append(el('span', 'stat-sub', sub));
    return t;
  }

  // ---- the range: today, the last 7 or 30 days, or from–to ----
  let R = Object.assign({ kind: 'week', from: addDays(dayKey(), -13), to: dayKey() }, load(RANGE_KEY, {}));
  function range() {
    const today = dayKey();
    if (R.kind === 'day') return { from: today, to: today };
    if (R.kind === 'week') return { from: addDays(today, -6), to: today };
    if (R.kind === 'month') return { from: addDays(today, -29), to: today };
    let from = R.from || today, to = R.to || today;
    if (from > to) [from, to] = [to, from];
    if (daysBetween(from, to) > 365) from = addDays(to, -365);
    return { from, to };
  }
  function rangeBar() {
    const box = el('div', 'report-range');
    const seg = el('div', 'filter');
    seg.setAttribute('role', 'group');
    seg.setAttribute('aria-label', T('مدة التقرير'));
    [['day', 'اليوم'], ['week', 'أسبوع'], ['month', 'شهر'], ['custom', 'مدة أخرى']].forEach(([k, label]) => {
      const b = button('', T(label), () => { R.kind = k; store(RANGE_KEY, R); render(); });
      b.setAttribute('aria-pressed', String(R.kind === k));
      seg.append(b);
    });
    box.append(seg);
    if (R.kind === 'custom') {
      const f = el('div', 'report-dates');
      const a = el('input'); a.type = 'date'; a.value = R.from; a.max = dayKey(); a.setAttribute('aria-label', T('من'));
      const b = el('input'); b.type = 'date'; b.value = R.to; b.max = dayKey(); b.setAttribute('aria-label', T('إلى'));
      const set = () => { if (a.value && b.value) { R.from = a.value; R.to = b.value; store(RANGE_KEY, R); render(); } };
      a.addEventListener('change', set); b.addEventListener('change', set);
      const la = el('label', ''); la.append(el('span', '', T('من')), a);
      const lb = el('label', ''); lb.append(el('span', '', T('إلى')), b);
      f.append(la, lb);
      box.append(f);
    }
    return box;
  }

  function render() {
    if (root.hidden) return; // rebuilt when the tab is opened
    root.replaceChildren();
    const today = dayKey();
    const { from, to } = range();
    const n = daysBetween(from, to) + 1;
    const days = [];
    for (let i = 0; i < n; i++) {
      const k = addDays(from, i);
      days.push({ key: k, mins: minutesOn(k), tasks: tasksDoneOn(k), pages: pagesOn(k) });
    }
    const head = el('div', 'view-head');
    head.append(el('h2', '', T('التقرير')),
      el('span', 'view-sub', n === 1 ? longDate.format(dateOf(from)) : `${dm.format(dateOf(from))} – ${dm.format(dateOf(to))} · ${I.num(n)} ${T('يوماً')}`));
    root.append(head, rangeBar());

    // Totals.
    const focus = days.reduce((a, x) => a + x.mins, 0);
    const count = sessions().filter((s) => { const k = dayKey(s.start); return k >= from && k <= to; }).length;
    const tasks = days.reduce((a, x) => a + x.tasks, 0);
    const pages = days.reduce((a, x) => a + x.pages, 0);
    const habits = window.noonHabits ? window.noonHabits.list() : [];
    let hDone = 0;
    days.forEach((d) => habits.forEach((h) => { if (habitDone(h.id, d.key)) hDone++; }));
    const hRate = habits.length ? Math.round((hDone / (habits.length * n)) * 100) : 0;
    const fasts = days.filter((d) => habitDone('fasting', d.key)).length;
    let streak = 0, d = today;
    if (!minutesOn(d)) d = addDays(d, -1);
    while (minutesOn(d) > 0) { streak++; d = addDays(d, -1); }
    const tiles = el('div', 'stats');
    tiles.append(
      tile(T('وقت التركيز'), dur(focus), `${I.num(count)} ${T('جلسات')}${n > 1 ? ` · ${T('المتوسط')} ${dur(Math.round(focus / n))} ${T('يومياً')}` : ''}`),
      tile(T('مهام أنجزتها'), I.num(tasks), n > 1 ? `${T('المتوسط')} ${I.num(Math.round((tasks / n) * 10) / 10)} ${T('يومياً')}` : T('اليوم')),
      tile(T('العادات'), `${I.num(hRate)}${I.isEn ? '%' : '٪'}`, T('نسبة الإنجاز')),
      tile(T('صفحات القرآن'), I.num(pages), n > 1 ? `${T('المتوسط')} ${I.num(Math.round((pages / n) * 10) / 10)} ${T('يومياً')}` : T('اليوم')),
      tile(T('أيام الصيام'), I.num(fasts), T('صيام تطوع')),
      tile(T('أيام تركيز متتالية'), I.num(streak), streak ? T('استمر!') : T('ابدأ جلسة اليوم')));
    root.append(tiles);

    if (n > 1) {
      // Long ranges are drawn week by week.
      const buckets = n > 31 ? weeks(days) : days.map((x) => ({ key: x.key, label: n <= 7 ? (x.key === today ? T('اليوم') : wd.format(dateOf(x.key))) : String(dateOf(x.key).getDate()), mins: x.mins, tasks: x.tasks, pages: x.pages, isToday: x.key === today, tip: longDate.format(dateOf(x.key)) }));
      const per = n > 31 ? T('أسبوعياً') : T('يومياً');
      const c1 = el('section', 'chart-box');
      c1.append(el('h3', '', `${T('دقائق التركيز')} ${per}`), el('p', 'view-sub', `${T('الإجمالي')}: ${dur(focus)}`), chart(buckets, 'mins', dur));
      root.append(c1);
      if (pages) {
        const c2 = el('section', 'chart-box');
        c2.append(el('h3', '', `${T('صفحات القرآن')} ${per}`), el('p', 'view-sub', `${T('الإجمالي')}: ${I.num(pages)}`), chart(buckets, 'pages', (v) => I.num(v)));
        root.append(c2);
      }
    }

    // Each habit over the range.
    if (habits.length) {
      const hb = el('section', 'chart-box');
      hb.append(el('h3', '', T('العادات في هذه المدة')));
      const ul = el('ul', 'habit-bars');
      habits.forEach((h) => {
        const k = days.filter((x) => habitDone(h.id, x.key)).length;
        const li = el('li');
        const bar = el('span', 'habit-bar'); const fill = el('i'); fill.style.width = `${(k / n) * 100}%`; bar.append(fill);
        li.append(el('span', 'habit-bar-name', h.name), bar, el('span', 'habit-bar-val', `${I.num(k)} / ${I.num(n)}`));
        ul.append(li);
      });
      hb.append(ul);
      root.append(hb);
    }

    // Best time of day, within the range.
    const all = sessions().filter((s) => { const k = dayKey(s.start); return k >= from && k <= to; });
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

  // Seven-day groups, the last one ending today.
  function weeks(days) {
    const out = [];
    for (let end = days.length; end > 0; end -= 7) {
      const part = days.slice(Math.max(0, end - 7), end);
      const a = part[0].key, b = part[part.length - 1].key;
      out.unshift({ key: a, label: dm.format(dateOf(a)), isToday: end === days.length,
        mins: part.reduce((s, x) => s + x.mins, 0), tasks: part.reduce((s, x) => s + x.tasks, 0), pages: part.reduce((s, x) => s + x.pages, 0),
        tip: `${dm.format(dateOf(a))} – ${dm.format(dateOf(b))}` });
    }
    return out;
  }

  // Single-series bar chart: rounded tops on a baseline, value on hover and on the tallest bar.
  function chart(items, field, fmt) {
    const W = 560, H = 190, padL = 8, padR = 8, padT = 22, padB = 30;
    const max = Math.max(field === 'mins' ? 30 : 4, ...items.map((d) => d[field]));
    const step = field !== 'mins' ? Math.max(1, Math.ceil(max / 4)) : max <= 60 ? 15 : max <= 180 ? 30 : max <= 600 ? 120 : 300;
    const top = Math.ceil(max / step) * step;
    const y = (m) => padT + (H - padT - padB) * (1 - m / top);
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('class', 'week-chart');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', items.map((d) => `${d.tip}: ${fmt(d[field])}`).join('، '));
    const mk = (tag, attrs, text) => { const nn = document.createElementNS(NS, tag); for (const k in attrs) nn.setAttribute(k, attrs[k]); if (text !== undefined) nn.textContent = text; svg.append(nn); return nn; };
    for (let v = 0; v <= top; v += step) mk('line', { x1: padL, x2: W - padR, y1: y(v), y2: y(v), class: v === 0 ? 'axis' : 'grid' });
    const slot = (W - padL - padR) / items.length, bw = Math.min(44, slot * 0.62);
    const tallest = items.reduce((a, d, i) => (d[field] > items[a][field] ? i : a), 0);
    const every = Math.ceil(items.length / 10); // at most ~10 labels
    const tip = el('div', 'chart-tip');
    tip.hidden = true;
    items.forEach((d, i) => {
      // Right-to-left pages read time from the right.
      const idx = I.isEn ? i : items.length - 1 - i;
      const cx = padL + slot * idx + slot / 2;
      const v = d[field];
      const h = Math.max(0, y(0) - y(v));
      if (v > 0) {
        const r = Math.min(4, h / 2, bw / 2);
        const x0 = cx - bw / 2, y0 = y(0) - h;
        mk('path', { class: `bar${d.isToday ? ' is-today' : ''}`,
          d: `M${x0},${y(0)} V${y0 + r} Q${x0},${y0} ${x0 + r},${y0} H${x0 + bw - r} Q${x0 + bw},${y0} ${x0 + bw},${y0 + r} V${y(0)} Z` });
      }
      if (i === tallest && v > 0) mk('text', { x: cx, y: y(v) - 7, class: 'bar-val', 'text-anchor': 'middle' }, fmt(v));
      if ((items.length - 1 - i) % every === 0) mk('text', { x: cx, y: H - 10, class: `bar-day${d.isToday ? ' is-today' : ''}`, 'text-anchor': 'middle' }, I.num(d.label));
      const hit = mk('rect', { x: cx - slot / 2, y: padT, width: slot, height: H - padT - padB, class: 'hit' });
      hit.addEventListener('pointerenter', () => {
        tip.replaceChildren(el('b', '', d.tip), el('span', '', `${T('تركيز')}: ${dur(d.mins)}`), el('span', '', `${T('مهام')}: ${I.num(d.tasks)}`),
          el('span', '', `${T('صفحات')}: ${I.num(d.pages)}`));
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
