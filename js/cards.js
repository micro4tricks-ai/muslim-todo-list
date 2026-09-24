// ---------- Review cards: decks of question/answer cards with spaced review ----------
// Leitner boxes: a card you know moves up a box and comes back later
// (1, 2, 4, 8, 16 days); a card you miss goes back to box 1 for tomorrow.
(() => {
  'use strict';
  const { T, I, el, button, load, store, uid, dayKey, addDays, onRemote } = window.noonUI;
  const KEY = 'noon-sweep-cards';
  const GAPS = [1, 2, 4, 8, 16];
  const root = document.getElementById('view-cards');
  let S = load(KEY, { decks: [], cards: [] });
  if (!Array.isArray(S.decks) || !Array.isArray(S.cards)) S = { decks: [], cards: [] };
  const save = () => { S.updatedAt = Date.now(); store(KEY, S); };
  const today = () => dayKey();
  const dueIn = (deck) => S.cards.filter((c) => c.deckId === deck.id && c.due <= today());
  let screen = { name: 'decks' }; // decks | deck(id) | review(id, queue, i, flipped)

  function render() {
    root.replaceChildren();
    if (screen.name === 'review') return renderReview();
    if (screen.name === 'deck') return renderDeck(S.decks.find((d) => d.id === screen.id));
    renderDecks();
  }

  // ---- deck list ----
  function renderDecks() {
    const head = el('div', 'view-head');
    head.append(el('h2', '', T('كروت المراجعة والحفظ')));
    root.append(head);
    const form = el('form', 'inline-form');
    const input = el('input');
    input.id = 'newDeck';
    input.placeholder = T('اسم مجموعة جديدة، مثلاً: حفظ سورة الملك');
    input.setAttribute('aria-label', T('اسم المجموعة'));
    form.append(input, button('btn btn-primary', T('إضافة مجموعة')));
    form.lastChild.type = 'submit';
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const name = input.value.trim();
      if (!name) return;
      const d = { id: uid(), name, createdAt: Date.now() };
      S.decks.push(d); save();
      screen = { name: 'deck', id: d.id }; render();
    });
    root.append(form);
    if (!S.decks.length) {
      root.append(el('p', 'empty', T('أنشئ مجموعة لكل ما تريد حفظه: آيات، أحاديث، كلمات إنجليزية، معلومات للمذاكرة. كل كارت فيه سؤال وجوابه، والكروت التي تنساها تعود إليك أسرع.')));
      return;
    }
    const grid = el('div', 'deck-grid');
    for (const d of S.decks) {
      const all = S.cards.filter((c) => c.deckId === d.id);
      const due = dueIn(d).length;
      const learned = all.filter((c) => c.box >= 4).length;
      const card = el('div', 'deck');
      const title = button('deck-open', '', () => { screen = { name: 'deck', id: d.id }; render(); });
      title.append(el('span', 'deck-name', d.name), el('span', 'deck-meta', `${I.num(all.length)} ${T('كارت')} · ${I.num(learned)} ${T('محفوظ')}`));
      const bar = el('div', 'deck-bar');
      const fill = el('span');
      fill.style.width = all.length ? `${Math.round((learned / all.length) * 100)}%` : '0';
      bar.append(fill);
      const review = button('btn btn-primary', due ? `${T('راجع')} (${I.num(due)})` : T('لا مراجعة اليوم'), () => startReview(d));
      review.disabled = !due;
      card.append(title, bar, review);
      grid.append(card);
    }
    root.append(grid);
  }

  // ---- one deck: add, edit and remove cards ----
  function renderDeck(d) {
    if (!d) { screen = { name: 'decks' }; return render(); }
    const head = el('div', 'view-head');
    head.append(button('btn btn-quiet', T('← المجموعات'), () => { screen = { name: 'decks' }; render(); }), el('h2', '', d.name));
    const due = dueIn(d).length;
    const review = button('btn btn-primary', due ? `${T('راجع')} (${I.num(due)})` : T('لا مراجعة اليوم'), () => startReview(d));
    review.disabled = !due;
    head.append(review);
    root.append(head);

    const form = el('form', 'card-form');
    const front = el('textarea'); front.id = 'cardFront'; front.rows = 2; front.dir = 'auto';
    front.placeholder = T('السؤال أو أول الآية');
    const back = el('textarea'); back.id = 'cardBack'; back.rows = 2; back.dir = 'auto';
    back.placeholder = T('الجواب أو باقي الآية');
    const fl = el('label', '', T('الوجه الأمامي')); fl.htmlFor = 'cardFront';
    const bl = el('label', '', T('الوجه الخلفي')); bl.htmlFor = 'cardBack';
    const add = button('btn btn-primary', T('إضافة كارت')); add.type = 'submit';
    form.append(el('div', 'field'), el('div', 'field'), add);
    form.children[0].append(fl, front);
    form.children[1].append(bl, back);
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      if (!front.value.trim() || !back.value.trim()) return;
      S.cards.push({ id: uid(), deckId: d.id, front: front.value.trim(), back: back.value.trim(), box: 1, due: today(), createdAt: Date.now() });
      save(); render();
      document.getElementById('cardFront').focus();
    });
    root.append(form);

    // Paste many at once: one card per line, "question | answer".
    const bulk = el('details', 'bulk');
    bulk.append(el('summary', '', T('إضافة كروت كثيرة مرة واحدة')));
    const ta = el('textarea'); ta.rows = 4; ta.dir = 'auto';
    ta.placeholder = T('كل سطر كارت: السؤال | الجواب');
    ta.setAttribute('aria-label', T('كروت كثيرة'));
    bulk.append(ta, button('btn btn-quiet', T('أضف الكل'), () => {
      let n = 0;
      for (const line of ta.value.split('\n')) {
        const [f, ...rest] = line.split('|');
        const b = rest.join('|').trim();
        if (f && f.trim() && b) { S.cards.push({ id: uid(), deckId: d.id, front: f.trim(), back: b, box: 1, due: today(), createdAt: Date.now() }); n++; }
      }
      if (n) { save(); render(); }
    }));
    root.append(bulk);

    const cards = S.cards.filter((c) => c.deckId === d.id);
    const list = el('ul', 'card-list');
    for (const c of cards) {
      const li = el('li', 'card-row');
      const txt = el('div', 'card-text');
      txt.append(el('p', 'card-front', c.front), el('p', 'card-back', c.back));
      const meta = el('span', 'card-box', `${T('صندوق')} ${I.num(c.box)} · ${c.due <= today() ? T('للمراجعة اليوم') : `${T('المراجعة')} ${dateLabel(c.due)}`}`);
      let armed = null;
      const del = button('link-btn danger', T('حذف'), () => {
        if (!armed) { del.textContent = T('تأكيد الحذف'); armed = setTimeout(() => { armed = null; del.textContent = T('حذف'); }, 3000); return; }
        S.cards = S.cards.filter((x) => x.id !== c.id); save(); render();
      });
      li.append(txt, meta, del);
      list.append(li);
    }
    if (!cards.length) root.append(el('p', 'empty', T('لا توجد كروت في هذه المجموعة بعد.')));
    else root.append(list);

    let armedDeck = null;
    const delDeck = button('link-btn danger', T('حذف المجموعة كلها'), () => {
      if (!armedDeck) { delDeck.textContent = T('تأكيد حذف المجموعة'); armedDeck = setTimeout(() => { armedDeck = null; delDeck.textContent = T('حذف المجموعة كلها'); }, 3000); return; }
      S.decks = S.decks.filter((x) => x.id !== d.id);
      S.cards = S.cards.filter((x) => x.deckId !== d.id);
      save(); screen = { name: 'decks' }; render();
    });
    root.append(delDeck);
  }
  const dateFmt = new Intl.DateTimeFormat(I.locale, { day: 'numeric', month: 'short' });
  function dateLabel(key) { const [y, m, dd] = key.split('-').map(Number); return dateFmt.format(new Date(y, m - 1, dd)); }

  // ---- review: flip the card, then say whether you knew it ----
  function startReview(d) {
    const queue = dueIn(d).sort(() => Math.random() - 0.5).map((c) => c.id);
    if (!queue.length) return;
    screen = { name: 'review', id: d.id, queue, i: 0, flipped: false, right: 0 };
    render();
  }
  function renderReview() {
    const d = S.decks.find((x) => x.id === screen.id);
    const head = el('div', 'view-head');
    head.append(button('btn btn-quiet', T('إنهاء المراجعة'), () => { screen = { name: 'deck', id: screen.id }; render(); }), el('h2', '', d ? d.name : ''));
    root.append(head);
    if (screen.i >= screen.queue.length) {
      const done = el('div', 'review-done');
      done.append(el('p', 'review-score', `${I.num(screen.right)} / ${I.num(screen.queue.length)}`),
        el('p', '', T('أنهيت مراجعة اليوم. الكروت التي نسيتها ستعود إليك غداً.')),
        button('btn btn-primary', T('رجوع للمجموعة'), () => { screen = { name: 'deck', id: screen.id }; render(); }));
      root.append(done);
      return;
    }
    const c = S.cards.find((x) => x.id === screen.queue[screen.i]);
    if (!c) { screen.i++; return render(); }
    root.append(el('p', 'review-progress', `${I.num(screen.i + 1)} / ${I.num(screen.queue.length)}`));
    const flip = el('button', `flip${screen.flipped ? ' is-flipped' : ''}`);
    flip.type = 'button';
    flip.setAttribute('aria-label', screen.flipped ? T('الوجه الخلفي') : T('اقلب الكارت لرؤية الجواب'));
    const inner = el('div', 'flip-inner');
    const f = el('div', 'flip-face flip-front'); f.append(el('p', '', c.front)); f.append(el('span', 'flip-hint', T('اضغط لرؤية الجواب')));
    const b = el('div', 'flip-face flip-back'); b.append(el('p', '', c.back));
    f.dir = b.dir = 'auto';
    inner.append(f, b);
    flip.append(inner);
    flip.addEventListener('click', () => { screen.flipped = !screen.flipped; flip.classList.toggle('is-flipped', screen.flipped); answers.hidden = !screen.flipped; });
    root.append(flip);
    const answers = el('div', 'review-actions');
    answers.hidden = !screen.flipped;
    answers.append(
      button('btn btn-quiet', T('لم أعرفها'), () => grade(c, false)),
      button('btn btn-primary', T('عرفتها'), () => grade(c, true)));
    root.append(answers);
    flip.focus();
  }
  function grade(c, knew) {
    c.box = knew ? Math.min(5, c.box + 1) : 1;
    c.due = addDays(today(), GAPS[c.box - 1]);
    c.reviewedAt = Date.now();
    if (knew) screen.right++;
    screen.i++; screen.flipped = false;
    save(); render();
  }
  // Keyboard during review: Space flips, 1 = missed, 2 = knew.
  document.addEventListener('keydown', (ev) => {
    if (screen.name !== 'review' || root.hidden) return;
    const tag = ev.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    const flip = root.querySelector('.flip');
    if (!flip) return;
    if (ev.code === 'Space') { ev.preventDefault(); ev.stopPropagation(); flip.click(); }
    else if (screen.flipped && (ev.key === '1' || ev.key === '2')) {
      const c = S.cards.find((x) => x.id === screen.queue[screen.i]);
      if (c) grade(c, ev.key === '2');
    }
  }, true);

  onRemote(KEY, () => { if (screen.name === 'review') return; S = load(KEY, { decks: [], cards: [] }); render(); });
  render();
})();
