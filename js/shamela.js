// ---------- The Shamela library on this computer (the desktop app only) ----------
// The desktop app (desktop/, src/shamela.rs) downloads a shelf of classical books when asked, keeps it
// in its data folder and serves its files as shamela://; the books are the website's own format
// (tools/build_shamela_packs.py), so the library's book page and the reader open them as they are.
// On the website and on Android there is no such library and this file does nothing.
(() => {
  'use strict';
  const tauri = window.__TAURI__;
  if (!tauri || !tauri.core) return;
  const BASE = navigator.userAgent.includes('Windows') ? 'https://shamela.localhost/' : 'shamela://localhost/';
  const invoke = (cmd, args) => tauri.core.invoke(cmd, args);
  let shelves = [], installed = new Set(), online = false;
  const books = new Map();      // slug -> the book, for the library and the reader
  const byShelf = new Map();    // shelf -> its books
  const busy = new Map();       // shelf -> [bytes so far, all bytes] while downloading
  let ready = null, redraw = null;

  async function loadShelf(c) {
    const res = await fetch(`${BASE}cat-${c}.json`);
    if (!res.ok) throw new Error(res.status);
    const list = (await res.json()).map((b) => Object.assign(b, { en: b.ar, authorEn: b.author, cat: c, shamela: true }));
    byShelf.set(c, list);
    list.forEach((b) => books.set(b.slug, b));
  }
  function refresh() {
    ready = (async () => {
      const c = await invoke('shamela_catalog');
      shelves = Array.isArray(c.shelves) ? c.shelves : [];
      installed = new Set(c.installed || []);
      online = !!c.online;
      books.clear(); byShelf.clear();
      await Promise.all([...installed].map((k) => loadShelf(k).catch(() => installed.delete(k))));
    })().catch(() => {});
    return ready;
  }
  if (tauri.event) tauri.event.listen('shamela-progress', (ev) => { const [c, got, all] = ev.payload; busy.set(c, [got, all]); if (redraw) redraw(c); });
  refresh();

  // ---- the screen: the shelves to download, and the books of those on this computer ----
  function render(root, ui) {
    const { T, I, el, button, toast, back, open, sizeText, deathText } = ui;
    const head = el('div', 'view-head');
    head.append(back('المكتبة', { name: 'home' }), el('h2', '', T('المكتبة الشاملة')));
    root.append(head);
    const intro = el('div', 'lib-about');
    intro.append(el('p', '', T('كتب المتقدّمين من المكتبة الشاملة: لمؤلفين توفّوا قبل سنة ١٣٥٠هـ، بنص المؤلف وحده دون حواشي المحققين ومقدماتهم. حمِّل الفن الذي تريده مرة واحدة، ثم اقرأ كتبه وابحث فيها دون إنترنت.')));
    const total = shelves.reduce((a, s) => a + s.size, 0);
    if (shelves.length) intro.append(el('p', 'hint', `${I.num(shelves.length)} ${T('فنّاً')} · ${I.num(shelves.reduce((a, s) => a + s.books, 0))} ${T('كتاباً')} · ${sizeText(total)}`));
    root.append(intro);
    const box = el('div', 'sh-list');
    root.append(box);
    const draw = () => {
      box.replaceChildren();
      if (!shelves.length) {
        box.append(el('p', 'empty', T(online ? 'لم تُنشر كتب المكتبة الشاملة بعد.' : 'تحتاج قائمة الفنون اتصالاً بالإنترنت أول مرة.')));
        return;
      }
      // A filter over the titles and authors of the books on this computer.
      if (books.size) {
        const q = el('input'); q.type = 'search'; q.className = 'lib-book-q'; q.placeholder = T('ابحث عن كتاب أو مؤلف'); q.setAttribute('aria-label', T('ابحث عن كتاب أو مؤلف'));
        const found = el('div', 'lib-grid');
        q.addEventListener('input', () => {
          const n = ui.norm(q.value.trim()).trim();
          found.replaceChildren();
          if (n.length < 2) return;
          [...books.values()].filter((b) => ui.norm(`${b.ar} ${b.author}`).includes(n)).slice(0, 60).forEach((b) => found.append(card(b)));
          if (!found.childNodes.length) found.append(el('p', 'hint', T('لا نتائج.')));
        });
        const f = el('div', 'lib-tools'); f.append(q);
        box.append(f, found);
      }
      shelves.forEach((s) => box.append(shelf(s)));
    };
    function card(b) {
      const c = button('lib-book lib-full', '', () => open(b.slug));
      c.append(el('b', '', b.ar), el('span', '', [b.author, deathText(b.death)].filter(Boolean).join(' · ')),
        el('small', '', `${I.num(b.pages)} ${T('صفحة')}`));
      return c;
    }
    function shelf(s) {
      const has = installed.has(s.id);
      const d = el('details', 'lib-shelf');
      d.dataset.shelf = String(s.id);
      const sum = el('summary');
      sum.append(el('b', '', s.name), el('span', 'hint', `${I.num(s.books)} ${T('كتاباً')} · ${sizeText(s.size)}${has ? ` · ${T('على جهازك')}` : ''}`));
      d.append(sum);
      const acts = el('div', 'hadith-acts');
      const prog = el('p', 'hint sh-prog');
      const p = busy.get(s.id);
      if (p) prog.textContent = `${T('جارٍ التحميل…')} ${p[1] ? Math.round((p[0] / p[1]) * 100) : 0}%`;
      if (!has && !p) acts.append(button('btn btn-primary', `${T('تحميل')} (${sizeText(s.size)})`, () => install(s)));
      if (has) acts.append(button('btn btn-quiet', T('حذف من الجهاز'), () => remove(s)));
      d.append(acts, prog);
      if (has) {
        const list = byShelf.get(s.id) || [];
        const grid = el('div', 'lib-grid');
        let upto = 0;
        const more = button('btn btn-quiet lib-more', T('المزيد'), () => page());
        const page = () => { const end = Math.min(list.length, upto + 60); for (; upto < end; upto++) grid.append(card(list[upto])); more.hidden = upto >= list.length; };
        d.addEventListener('toggle', () => { if (d.open && !upto) page(); });
        d.append(grid, more);
        more.hidden = true;
      }
      if (p) d.open = true;
      return d;
    }
    async function install(s) {
      busy.set(s.id, [0, s.size]);
      draw();
      try {
        await invoke('shamela_install', { cat: s.id });
        busy.delete(s.id);
        await refresh();
        toast(`${T('حُمِّل')}: ${s.name}`);
      } catch (e) {
        busy.delete(s.id);
        toast(T('تعذّر التحميل. تأكد من الاتصال بالإنترنت وحاول مرة أخرى.'));
      }
      if (root.isConnected) draw();
    }
    async function remove(s) {
      await invoke('shamela_remove', { cat: s.id }).catch(() => {});
      await refresh();
      if (root.isConnected) draw();
    }
    redraw = (c) => {
      const d = box.querySelector(`[data-shelf="${c}"] .sh-prog`);
      const p = busy.get(c);
      if (d && p) d.textContent = `${T('جارٍ التحميل…')} ${p[1] ? Math.round((p[0] / p[1]) * 100) : 0}%`;
    };
    box.append(ui.skeleton(T('جارٍ تحميل القائمة…'), 3));
    (ready || refresh()).then(() => { if (root.isConnected) draw(); });
  }

  window.noonShamela = {
    book: (slug) => books.get(slug),
    // Is this file one of the library's on this computer (books/s<id>/...)?
    owns: (path) => /^s\d+\//.test(path) && books.has(path.split('/')[0]),
    url: (path) => `${BASE}books/${path}`,
    ready: () => ready,
    render
  };
})();
