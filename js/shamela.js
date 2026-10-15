// ---------- The Shamela library on this device (the desktop app and the Android app) ----------
// The app downloads a shelf of classical books when asked and keeps it on the device: the desktop app
// (desktop/, src/shamela.rs) serves its files as shamela://, the Android app (ShamelaPlugin.java) keeps
// them in its own storage, read through Capacitor's file address. The books are the website's own
// format (tools/build_shamela_packs.py), so the library's book page and the reader open them as they are.
// On the website there is no such library and this file does nothing.
(() => {
  'use strict';
  const tauri = window.__TAURI__ && window.__TAURI__.core ? window.__TAURI__ : null;
  const cap = !tauri && window.noonNative && window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Shamela;
  if (!tauri && !cap) return;
  let BASE = tauri ? (navigator.userAgent.includes('Windows') ? 'https://shamela.localhost/' : 'shamela://localhost/') : '';
  const NAMES = { shamela_catalog: 'catalog', shamela_install: 'install', shamela_remove: 'remove' };
  const invoke = async (cmd, args) => {
    if (tauri) return tauri.core.invoke(cmd, args);
    const r = await cap[NAMES[cmd]](args || {});
    // The folder on the phone, as the page may read it.
    if (r && r.base && !BASE) BASE = window.Capacitor.convertFileSrc(r.base.replace(/\/?$/, '/'));
    return r;
  };
  const SITE = window.Capacitor ? 'https://micro4tricks-ai.github.io/muslim-todo-list/' : '';
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
  // Every shelf's titles (tools/build_shamela_packs.py, on the website): listed before a shelf is downloaded.
  let titles = {};
  let titlesP = null;
  const titlesReady = () => (titlesP = titlesP || fetch(`${SITE}books/shamela-titles.json`).then((r) => (r.ok ? r.json() : {})).then((t) => { titles = t; }).catch(() => { titlesP = null; }));
  const listed = (c) => (titles[c] || []).map(([id, ar, author, death, pages, edition]) => ({ slug: `s${id}`, ar, author, death, pages, edition, cat: c, away: true }));
  // Shamela's short marks for an edition: "ت فلان" (edited by) and "ط دار" (printed by), written out,
  // so the copies of one book (six of تلبيس إبليس) can be told apart.
  const editionText = (e) => String(e || '').trim().replace(/^ت\s+/, 'تحقيق: ').replace(/^ط\s+/, 'طبعة ');
  const progress = (c, got, all) => { busy.set(c, [got, all]); if (redraw) redraw(c); };
  if (tauri && tauri.event) tauri.event.listen('shamela-progress', (ev) => progress(...ev.payload));
  if (cap) cap.addListener('progress', (p) => progress(p.cat, p.got, p.total));
  // Nothing at start (the app opens as fast as before): the list is read when the library is opened,
  // or a while after the start, so a book read last can open from the home screen.
  setTimeout(() => { if (!ready) refresh(); }, 20000);

  // ---- the screen: the shelves to download, and the books of those on this computer ----
  function render(root, ui) {
    const { T, I, el, button, toast, back, open, sizeText, deathText } = ui;
    const head = el('div', 'view-head');
    head.append(back('المكتبة', { name: 'home' }), el('h2', '', T('المكتبة الشاملة')));
    root.append(head);
    const intro = el('div', 'lib-about');
    intro.append(el('p', '', T('كتب المتقدّمين من المكتبة الشاملة: لمؤلفين توفّوا قبل سنة ١٣٥٠هـ، بنص المؤلف وحده دون حواشي المحققين ومقدماتهم. حمِّل القسم الذي تريده مرة واحدة، ثم اقرأ كتبه وابحث فيها دون إنترنت.')));
    const total = shelves.reduce((a, s) => a + s.size, 0);
    if (shelves.length) intro.append(el('p', 'hint', `${I.num(shelves.length)} ${T('قسماً')} · ${I.num(shelves.reduce((a, s) => a + s.books, 0))} ${T('كتاباً')} · ${sizeText(total)}`));
    root.append(intro);
    const box = el('div', 'sh-list');
    root.append(box);
    const draw = () => {
      box.replaceChildren();
      if (!shelves.length) {
        box.append(el('p', 'empty', T(online ? 'لم تُنشر كتب المكتبة الشاملة بعد.' : 'تحتاج قائمة الأقسام اتصالاً بالإنترنت أول مرة.')));
        return;
      }
      // A filter over the titles and authors of every shelf (those not downloaded say so).
      {
        const q = el('input'); q.type = 'search'; q.className = 'lib-book-q'; q.placeholder = T('ابحث عن كتاب أو مؤلف'); q.setAttribute('aria-label', T('ابحث عن كتاب أو مؤلف'));
        const found = el('div', 'lib-grid');
        q.addEventListener('input', () => {
          const n = ui.norm(q.value.trim()).trim();
          found.replaceChildren();
          if (n.length < 2) return;
          const all = shelves.flatMap((s) => (installed.has(s.id) ? byShelf.get(s.id) || [] : listed(s.id)));
          all.filter((b) => ui.norm(`${b.ar} ${b.author} ${b.edition || ''}`).includes(n)).slice(0, 60).forEach((b) => found.append(card(b)));
          if (!found.childNodes.length) found.append(el('p', 'hint', T('لا نتائج.')));
        });
        const f = el('div', 'lib-tools'); f.append(q);
        box.append(f, found);
      }
      shelves.forEach((s) => box.append(shelf(s)));
    };
    function card(b) {
      // A book of a shelf not downloaded yet: its title, and the way to its shelf's download button.
      const c = button(`lib-book lib-full${b.away ? ' is-away' : ''}`, '', () => {
        if (!b.away) { open(b.slug); return; }
        toast(T('حمِّل هذا القسم أولاً لتقرأ كتبه.'));
        const d = box.querySelector(`[data-shelf="${b.cat}"]`);
        if (d) { d.open = true; d.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
      });
      c.append(el('b', '', b.ar), el('span', '', [b.author, deathText(b.death)].filter(Boolean).join(' · ')));
      if (b.edition) c.append(el('span', 'lib-edition', editionText(b.edition)));
      c.append(el('small', '', b.away ? `${I.num(b.pages)} ${T('صفحة')} · ${T('يحتاج تحميل القسم')}` : `${I.num(b.pages)} ${T('صفحة')}`));
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
      {
        const list = has ? byShelf.get(s.id) || [] : listed(s.id);
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
    Promise.all([ready || refresh(), titlesReady()]).then(() => { if (root.isConnected) draw(); });
  }

  window.noonShamela = {
    book: (slug) => books.get(slug),
    // Is this file one of the library's on this computer (books/s<id>/...)?
    owns: (path) => /^s\d+\//.test(path) && books.has(path.split('/')[0]),
    url: (path) => `${BASE}books/${path}`,
    ready: () => ready || refresh(),
    render
  };
})();
