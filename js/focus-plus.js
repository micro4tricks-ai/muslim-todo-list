// ---------- Focus helpers: distraction box, session log, useful breaks ----------
(() => {
  'use strict';
  const { T, I, el, button, load, store, uid, toast, onRemote } = window.noonUI;
  const DKEY = 'noon-sweep-distractions', LKEY = 'noon-sweep-focuslog';
  const $ = (id) => document.getElementById(id);

  // ---- distraction box: park a stray thought without leaving the session ----
  let D = load(DKEY, { items: [] });
  if (!Array.isArray(D.items)) D = { items: [] };
  const saveD = () => { D.updatedAt = Date.now(); store(DKEY, D); window.dispatchEvent(new CustomEvent('noon-distractions')); };
  function addDistraction(text) {
    text = String(text || '').trim();
    if (!text) return false;
    D.items.unshift({ id: uid(), text, at: Date.now(), done: false });
    D.items = D.items.slice(0, 200);
    saveD();
    return true;
  }
  const form = $('distractForm'), input = $('distractInput');
  $('distractBtn').addEventListener('click', () => { form.hidden = !form.hidden; if (!form.hidden) input.focus(); });
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (addDistraction(input.value)) {
      input.value = '';
      form.hidden = true;
      toast(T('حُفظت في صندوق المشتتات. أكمل تركيزك.'));
    }
  });
  form.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { form.hidden = true; ev.stopPropagation(); } });

  // ---- focus log: one entry per completed focus session ----
  let L = load(LKEY, { sessions: [] });
  if (!Array.isArray(L.sessions)) L = { sessions: [] };
  window.addEventListener('noon-focus-done', (ev) => {
    const d = ev.detail;
    L.sessions.push({ start: d.start, minutes: d.minutes, task: d.taskTitle || '' });
    // Keep a year of history.
    const cutoff = Date.now() - 366 * 864e5;
    L.sessions = L.sessions.filter((s) => s.start >= cutoff);
    L.updatedAt = Date.now();
    store(LKEY, L);
    window.dispatchEvent(new CustomEvent('noon-focuslog'));
  });

  // ---- useful breaks: a suggestion (dhikr, movement, water, eyes) each break ----
  const TIPS = [
    { kind: 'dhikr', text: 'سبحان الله وبحمده، سبحان الله العظيم', count: 33, note: 'كلمتان خفيفتان على اللسان، ثقيلتان في الميزان.' },
    { kind: 'dhikr', text: 'أستغفر الله وأتوب إليه', count: 33, note: 'الاستغفار يمحو الذنوب ويشرح الصدر.' },
    { kind: 'dhikr', text: 'لا حول ولا قوة إلا بالله', count: 33, note: 'كنز من كنوز الجنة.' },
    { kind: 'dhikr', text: 'اللهم صلِّ وسلم على نبينا محمد', count: 10, note: 'من صلى عليه واحدة صلى الله عليه بها عشراً.' },
    { kind: 'move', text: 'قم وامشِ دقيقتين، وحرّك رقبتك وكتفيك ببطء.', note: 'الحركة تنشّط الدورة الدموية وتعيد التركيز.' },
    { kind: 'water', text: 'اشرب كوب ماء.', note: 'قلة الماء تُضعف التركيز حتى لو لم تشعر بالعطش.' },
    { kind: 'eyes', text: 'انظر إلى شيء بعيد لمدة ٢٠ ثانية.', note: 'قاعدة ٢٠-٢٠-٢٠ تريح عينيك من الشاشة.' },
    { kind: 'breath', text: 'خذ ٥ أنفاس عميقة: شهيق ٤ ثوانٍ، وزفير ٦.', note: 'التنفس البطيء يهدّئ التوتر قبل الجلسة التالية.' },
    { kind: 'wudu', text: 'جدّد وضوءك إن استطعت.', note: 'الوضوء يجدد النشاط، وتبقى على طهارة.' }
  ];
  const tipBox = $('breakTip');
  let tipIndex = Math.floor(Math.random() * TIPS.length), tipCount = 0, lastMode = null;
  function renderTip(mode) {
    const onBreak = mode && mode !== 'focus';
    tipBox.hidden = !onBreak;
    if (!onBreak) return;
    const tip = TIPS[tipIndex];
    tipBox.replaceChildren();
    tipBox.append(el('p', 'tip-kind', T({ dhikr: 'ذكر للاستراحة', move: 'حركة', water: 'ماء', eyes: 'راحة للعين', breath: 'تنفس', wudu: 'وضوء' }[tip.kind])));
    const text = el('p', 'tip-text', T(tip.text));
    if (tip.kind === 'dhikr' && !I.isEn) text.lang = 'ar';
    tipBox.append(text, el('p', 'tip-note', T(tip.note)));
    const row = el('div', 'tip-row');
    if (tip.count) {
      const tap = button('tip-count', `${I.num(tipCount)} / ${I.num(tip.count)}`, () => {
        tipCount = Math.min(tip.count, tipCount + 1);
        tap.textContent = `${I.num(tipCount)} / ${I.num(tip.count)}`;
        if (navigator.vibrate) navigator.vibrate(10);
        if (tipCount === tip.count) tap.classList.add('is-done');
      }, T('عدّ'));
      row.append(tap);
    }
    row.append(button('link-btn', T('اقتراح آخر'), () => { tipIndex = (tipIndex + 1) % TIPS.length; tipCount = 0; renderTip(mode); }));
    tipBox.append(row);
  }
  window.addEventListener('noon-focus', (ev) => {
    const mode = ev.detail.mode;
    if (mode !== lastMode) {
      if (mode !== 'focus') { tipIndex = (tipIndex + 1) % TIPS.length; tipCount = 0; }
      lastMode = mode;
      renderTip(mode);
    }
  });

  onRemote(DKEY, () => { D = load(DKEY, { items: [] }); window.dispatchEvent(new CustomEvent('noon-distractions')); });
  onRemote(LKEY, () => { L = load(LKEY, { sessions: [] }); window.dispatchEvent(new CustomEvent('noon-focuslog')); });
  window.noonFocusPlus = {
    addDistraction,
    distractions: () => D.items,
    setDistraction(id, patch) { const d = D.items.find((x) => x.id === id); if (d) { Object.assign(d, patch); saveD(); } },
    removeDistraction(id) { D.items = D.items.filter((x) => x.id !== id); saveD(); },
    sessions: () => L.sessions,
    tip: () => ({ tip: TIPS[tipIndex], count: tipCount })
  };
})();
