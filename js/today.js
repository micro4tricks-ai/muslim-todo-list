// ---------- "My day": the day at a glance under the clock ----------
// The next prayer, tomorrow's fast or season, today's Quran portion and where reading stopped,
// the morning or evening adhkar, and the last thing listened to. Each card opens its place.
(() => {
  'use strict';
  const { T, I, el, button } = window.noonUI;
  const box = el('section', 'today');
  box.setAttribute('aria-label', T('يومي'));
  const quick = document.querySelector('.quick');
  if (quick) quick.after(box); else return;

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

  function render() {
    const cards = [];
    const A = window.noonAstro, Q = window.noonQuran, Z = window.noonAdhkar, L = window.noonListen, N = window.noonSunnah;
    // The next prayer.
    const snap = A && A.snapshot(Date.now());
    if (snap && snap.next) {
      cards.push(card('td-prayer', T('الصلاة القادمة'), `${snap.next.name} ${snap.next.time}`, snap.next.inText,
        () => window.noonSettings && window.noonSettings.open('place')));
    }
    // Tomorrow's fast or season (announced from the evening before).
    try {
      const eve = N && N.plan(Date.now() - 864e5, 1).find((r) => /^eve-/.test(r.key) && r.at <= Date.now() + 864e5 && r.at > Date.now() - 864e5);
      if (eve) cards.push(card('td-fast', T('تذكير'), eve.title, eve.note || '', () => window.noonUI.go('calendar')));
    } catch (_) {}
    // The Quran: today's portion, and where reading stopped.
    if (Q) {
      const p = Q.progress(), last = Q.last && Q.last();
      cards.push(card('td-quran', T('وردك اليوم'), last ? last.label : T('ابدأ القراءة'),
        `${I.num(p.today)} / ${I.num(p.goal)} ${T('صفحات')}`, () => (last ? Q.open(last.i) : window.noonUI.go('quran')), bar(p.today, p.goal)));
    }
    // The morning or evening adhkar.
    if (Z && Z.period) {
      const pr = Z.progress('am-pm'), am = Z.period() === 'am';
      cards.push(card(`td-adhkar${pr.complete ? ' is-done' : ''}`, T(am ? 'أذكار الصباح' : 'أذكار المساء'),
        T(pr.complete ? 'تقبّل الله' : pr.done ? 'أكمل أذكارك' : 'لم تبدأ بعد'), `${I.num(pr.done)} / ${I.num(pr.total)}`,
        () => Z.open('am-pm'), bar(pr.done, pr.total)));
    }
    // The last thing listened to.
    const last = L && L.last && L.last();
    if (last && last.title) {
      cards.push(card('td-listen', T('تابع الاستماع'), last.title, last.sub || '', () => { window.noonUI.go('listen'); L.resume(); }));
    }
    box.replaceChildren(...cards);
  }

  render();
  setInterval(render, 60000);
  ['noon-adhkar-done', 'noon-place', 'noon-storage', 'noon-view', 'noon-sunnah'].forEach((e) => window.addEventListener(e, () => setTimeout(render, 50)));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
  window.noonToday = { render };
})();
