// ---------- Sticky notes: a board of coloured notes, like Windows Sticky Notes ----------
(() => {
  'use strict';
  const { T, I, el, button, load, store, uid, toast, onRemote } = window.noonUI;
  const KEY = 'noon-sweep-notes';
  const COLORS = [['yellow', 'أصفر'], ['green', 'أخضر'], ['pink', 'وردي'], ['purple', 'بنفسجي'], ['blue', 'أزرق'], ['gray', 'رمادي']];
  const root = document.getElementById('view-notes');
  let S = load(KEY, { notes: [] });
  if (!Array.isArray(S.notes)) S = { notes: [] };
  const save = () => store(KEY, S);
  const fmt = new Intl.DateTimeFormat(I.locale, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

  let dragId = null;
  function render() {
    root.replaceChildren();
    const head = el('div', 'view-head');
    head.append(el('h2', '', T('ملاحظات لاصقة')),
      button('btn btn-primary', T('ملاحظة جديدة'), () => addNote()));
    root.append(head);
    if (!S.notes.length) {
      root.append(el('p', 'empty', T('اكتب أي فكرة بسرعة على ورقة ملونة. اسحب الورقة لترتيبها، وثبّت المهم في الأعلى.')));
      return;
    }
    const board = el('div', 'notes-board');
    const sorted = S.notes.slice().sort((a, b) => (b.pinned - a.pinned) || (a.order - b.order));
    for (const n of sorted) board.append(noteEl(n));
    root.append(board);
  }

  function noteEl(n) {
    const card = el('article', `note note-${n.color}${n.pinned ? ' is-pinned' : ''}`);
    card.dataset.id = n.id;
    card.draggable = true;
    const bar = el('div', 'note-bar');
    const swatches = el('div', 'note-colors');
    for (const [c, name] of COLORS) {
      const sw = button(`note-sw note-${c}`, '', () => { n.color = c; touch(n); render(); }, `${T('لون')} ${T(name)}`);
      sw.setAttribute('aria-pressed', String(n.color === c));
      swatches.append(sw);
    }
    const tools = el('div', 'note-tools');
    const pin = button('note-tool', n.pinned ? T('إلغاء التثبيت') : T('تثبيت'), () => { n.pinned = !n.pinned; touch(n); render(); });
    const toTask = button('note-tool', T('اجعلها مهمة'), () => {
      const first = n.text.trim().split('\n')[0];
      if (!first || !window.noonTasks) return;
      window.noonTasks.add(first, { description: n.text.trim().split('\n').slice(1).join('\n').trim() });
      toast(T('أُضيفت إلى المهام.'), { label: T('عرض المهام'), run: () => window.noonUI.show('tasks') });
    });
    let armed = null;
    const del = button('note-tool danger', T('حذف'), () => {
      if (!armed) { del.textContent = T('تأكيد الحذف'); armed = setTimeout(() => { armed = null; del.textContent = T('حذف'); }, 3000); return; }
      S.notes = S.notes.filter((x) => x.id !== n.id); save(); render();
    });
    tools.append(pin, toTask, del);
    bar.append(swatches, tools);
    const text = el('textarea', 'note-text');
    text.value = n.text;
    text.placeholder = T('اكتب هنا…');
    text.setAttribute('aria-label', T('نص الملاحظة'));
    text.dir = 'auto';
    let t = null;
    text.addEventListener('input', () => { n.text = text.value; autosize(text); clearTimeout(t); t = setTimeout(() => touch(n), 400); });
    const when = el('p', 'note-when', fmt.format(n.updatedAt || n.createdAt));
    card.append(bar, text, when);
    requestAnimationFrame(() => autosize(text));
    // Drag to reorder.
    card.addEventListener('dragstart', (ev) => {
      if (ev.target.closest('textarea, button')) { ev.preventDefault(); return; }
      dragId = n.id; card.classList.add('dragging'); ev.dataTransfer.effectAllowed = 'move';
    });
    card.addEventListener('dragend', () => { dragId = null; card.classList.remove('dragging'); });
    card.addEventListener('dragover', (ev) => { if (dragId && dragId !== n.id) { ev.preventDefault(); card.classList.add('drop'); } });
    card.addEventListener('dragleave', () => card.classList.remove('drop'));
    card.addEventListener('drop', (ev) => {
      ev.preventDefault(); card.classList.remove('drop');
      const from = S.notes.find((x) => x.id === dragId);
      if (!from || from.id === n.id) return;
      const order = S.notes.slice().sort((a, b) => a.order - b.order).filter((x) => x.id !== from.id);
      order.splice(order.findIndex((x) => x.id === n.id), 0, from);
      order.forEach((x, i) => { x.order = i; });
      from.pinned = n.pinned;
      touch(from); render();
    });
    return card;
  }
  function autosize(ta) { ta.style.height = 'auto'; ta.style.height = Math.max(96, ta.scrollHeight) + 'px'; }
  function touch(n) { n.updatedAt = Date.now(); save(); }
  function addNote() {
    const n = { id: uid(), text: '', color: COLORS[S.notes.length % COLORS.length][0], pinned: false,
      order: -Date.now(), createdAt: Date.now(), updatedAt: Date.now() };
    S.notes.push(n); save(); render();
    const ta = root.querySelector(`.note[data-id="${n.id}"] textarea`);
    if (ta) ta.focus();
  }

  onRemote(KEY, () => {
    // Keep typing undisturbed: skip a remote refresh while a note is being edited.
    if (root.contains(document.activeElement) && document.activeElement.tagName === 'TEXTAREA') return;
    S = load(KEY, { notes: [] }); render();
  });
  render();
})();
