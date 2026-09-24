// ---------- Adhkar & duas: Hisn al-Muslim and Quran texts with counters ----------
// Texts come from js/adhkar-data.js (generated from the sources; not typed by hand).
// Counts reset each day; finishing the morning/evening adhkar ticks the habit.
(() => {
  'use strict';
  const { T, I, el, button, load, store, dayKey, onRemote } = window.noonUI;
  const DATA = (window.NOON_ADHKAR || { categories: [] }).categories;
  const KEY = 'noon-sweep-adhkar';
  const root = document.getElementById('view-adhkar');
  const blank = () => ({ day: dayKey(), counts: {}, tasbeeh: { phrase: 0, n: 0 } });
  let S = load(KEY, blank());
  const fresh = () => { if (S.day !== dayKey()) { const t = S.tasbeeh; S = blank(); S.tasbeeh = { phrase: t ? t.phrase : 0, n: 0 }; } };
  fresh();
  const save = () => store(KEY, S);
  let open = null; // category id
  let audio = null;

  const TASBEEH = [
    ['سُبْحَانَ اللَّهِ', 'Subhan Allah'], ['الْحَمْدُ لِلَّهِ', 'Alhamdulillah'], ['اللَّهُ أَكْبَرُ', 'Allahu akbar'],
    ['لَا إِلَهَ إِلَّا اللَّهُ', 'La ilaha illa Allah'], ['أَسْتَغْفِرُ اللَّهَ', 'Astaghfirullah'],
    ['اللَّهُمَّ صَلِّ عَلَى مُحَمَّدٍ', 'Allahumma salli ala Muhammad'], ['سُبْحَانَ اللَّهِ وَبِحَمْدِهِ', 'Subhan Allahi wa bihamdihi']
  ];

  const countOf = (cat, item) => ((S.counts[cat] || {})[item.id] || 0);
  const progress = (cat) => {
    const c = DATA.find((x) => x.id === cat);
    const total = c.items.reduce((a, it) => a + it.repeat, 0);
    const done = c.items.reduce((a, it) => a + Math.min(it.repeat, countOf(cat, it)), 0);
    return { done, total, complete: done >= total };
  };
  // Morning until Asr, evening after it (following the chosen city's prayer times).
  function period() {
    const snap = window.noonAstro && window.noonAstro.snapshot(Date.now());
    return snap && snap.nowH >= snap.today.asr ? 'pm' : 'am';
  }

  function render() {
    fresh();
    root.replaceChildren();
    if (open) return renderCategory(DATA.find((c) => c.id === open));
    const head = el('div', 'view-head');
    head.append(el('h2', '', T('الأذكار والأدعية')));
    root.append(head);
    const grid = el('div', 'adhkar-grid');
    for (const c of DATA) {
      const p = progress(c.id);
      const b = button(`adhkar-cat${p.complete ? ' is-done' : ''}`, '', () => { open = c.id; render(); root.scrollIntoView({ block: 'start' }); });
      b.append(el('span', 'adhkar-cat-name', I.isEn ? c.en : c.ar),
        el('span', 'adhkar-cat-meta', p.complete ? T('تمّت اليوم') : `${I.num(c.items.length)} ${T('ذكر')}`));
      const ring = el('span', 'adhkar-ring');
      ring.style.setProperty('--p', p.total ? p.done / p.total : 0);
      b.prepend(ring);
      grid.append(b);
    }
    root.append(grid);
    root.append(tasbeehBox());
    root.append(el('p', 'credit', T('النصوص من حصن المسلم (hisnmuslim.com)، والآيات من المصحف عبر api.alquran.cloud.')));
  }

  function renderCategory(c) {
    if (!c) { open = null; return render(); }
    const head = el('div', 'view-head');
    head.append(button('btn btn-quiet', T('← كل الأذكار'), () => { stopAudio(); open = null; render(); }), el('h2', '', I.isEn ? c.en : c.ar));
    const p = progress(c.id);
    head.append(button('btn btn-quiet', T('إعادة العد'), () => { S.counts[c.id] = {}; save(); render(); }));
    root.append(head);
    const bar = el('div', 'adhkar-progress');
    const fill = el('span'); fill.style.width = `${p.total ? Math.round((p.done / p.total) * 100) : 0}%`;
    bar.append(fill);
    root.append(bar);
    if (c.id === 'am-pm') root.append(el('p', 'hint', T(period() === 'am' ? 'الآن وقت أذكار الصباح. ما بين القوسين [ ] يقال في المساء.' : 'الآن وقت أذكار المساء. ما بين القوسين [ ] هو صيغة المساء.')));

    const list = el('ol', 'dhikr-list');
    for (const it of c.items) {
      const n = countOf(c.id, it), done = n >= it.repeat;
      const li = el('li', `dhikr${done ? ' is-done' : ''}`);
      const text = el('p', 'dhikr-text', it.ar);
      text.lang = 'ar'; text.dir = 'rtl';
      li.append(text);
      if (I.isEn && it.en) li.append(el('p', 'dhikr-en', it.en));
      if (I.isEn && it.tr) li.append(el('p', 'dhikr-tr', it.tr));
      if (it.ref) li.append(el('p', 'dhikr-ref', I.isEn ? it.refEn : it.ref));
      const row = el('div', 'dhikr-row');
      const counter = button('dhikr-count', '', () => {
        if (countOf(c.id, it) >= it.repeat) return;
        (S.counts[c.id] = S.counts[c.id] || {})[it.id] = countOf(c.id, it) + 1;
        if (navigator.vibrate) navigator.vibrate(12);
        save();
        const now = countOf(c.id, it);
        counter.firstChild.textContent = `${I.num(now)} / ${I.num(it.repeat)}`;
        if (now >= it.repeat) { li.classList.add('is-done'); afterCount(c); }
      }, `${T('عدّ')} ${I.num(n)} / ${I.num(it.repeat)}`);
      counter.append(el('span', '', `${I.num(n)} / ${I.num(it.repeat)}`));
      row.append(counter);
      if (it.audio) row.append(button('btn btn-quiet dhikr-play', T('استمع'), (ev) => playAudio(it.audio, ev.currentTarget)));
      li.append(row);
      list.append(li);
    }
    root.append(list);
  }
  function afterCount(c) {
    const p = progress(c.id);
    const fill = root.querySelector('.adhkar-progress span');
    if (fill) fill.style.width = `${Math.round((p.done / p.total) * 100)}%`;
    if (p.complete) {
      window.noonUI.toast(T('تقبّل الله. أتممت هذه الأذكار اليوم.'));
      if (c.id === 'am-pm') window.dispatchEvent(new CustomEvent('noon-adhkar-done', { detail: { cat: c.id, period: period() } }));
      else window.dispatchEvent(new CustomEvent('noon-adhkar-done', { detail: { cat: c.id } }));
    }
  }
  function playAudio(url, btn) {
    if (audio && audio.src === url && !audio.paused) { stopAudio(); return; }
    stopAudio();
    audio = new Audio(url);
    audio.play().catch(() => { btn.textContent = T('تعذّر التشغيل'); });
    btn.textContent = T('إيقاف');
    audio.addEventListener('ended', () => { btn.textContent = T('استمع'); });
    audio._btn = btn;
  }
  function stopAudio() {
    if (!audio) return;
    audio.pause();
    if (audio._btn) audio._btn.textContent = T('استمع');
    audio = null;
  }

  // ---- free tasbeeh counter ----
  function tasbeehBox() {
    const box = el('section', 'tasbeeh');
    box.setAttribute('aria-labelledby', 'tasbeehTitle');
    const title = el('h3', '', T('المسبحة'));
    title.id = 'tasbeehTitle';
    const phrases = el('div', 'tasbeeh-phrases');
    TASBEEH.forEach(([ar, en], i) => {
      const b = button('chip', ar, () => { S.tasbeeh = { phrase: i, n: 0 }; save(); render(); });
      b.lang = 'ar';
      b.title = en;
      b.setAttribute('aria-pressed', String(S.tasbeeh.phrase === i));
      phrases.append(b);
    });
    const [ar] = TASBEEH[S.tasbeeh.phrase] || TASBEEH[0];
    const big = button('tasbeeh-tap', '', () => {
      S.tasbeeh.n++;
      if (navigator.vibrate) navigator.vibrate(S.tasbeeh.n % 33 === 0 ? [30, 60, 30] : 10);
      save();
      big.querySelector('.tasbeeh-n').textContent = I.num(S.tasbeeh.n);
    }, T('سبّح'));
    const phrase = el('span', 'tasbeeh-phrase', ar); phrase.lang = 'ar';
    big.append(phrase, el('span', 'tasbeeh-n', I.num(S.tasbeeh.n)));
    const reset = button('btn btn-quiet', T('تصفير'), () => { S.tasbeeh.n = 0; save(); render(); });
    box.append(title, phrases, big, reset);
    return box;
  }

  // The chosen category stays open across renders; refresh after midnight.
  window.addEventListener('noon-view', (ev) => { if (ev.detail.view !== 'adhkar') stopAudio(); });
  setInterval(() => { if (S.day !== dayKey()) render(); }, 60000);
  onRemote(KEY, () => { S = load(KEY, blank()); render(); });
  window.noonAdhkar = { open(cat) { open = cat; window.noonUI.show('adhkar'); render(); }, progress };
  render();
})();
