// ---------- Library: the six hadith books and al-Muwatta, with gradings, and the Prophet's prayer ﷺ ----------
// The index comes from js/library-meta.js (tools/build_library.py); each section is read on demand
// from github.com/fawazahmed0/hadith-api via jsDelivr (Arabic, English and the gradings) and kept
// by the service worker for reading offline. js/salah-data.js holds the prayer, step by step.
// The full books (js/library-books.js) and the whole Musnad of Ahmad (js/library-local.js) come from
// the user's Shamela copy (tools/build_library_local.py), gzipped under books/ on the website.
(() => {
  'use strict';
  const { T, I, $, el, button, load, store, toast, onRemote } = window.noonUI;
  const LIB = window.NOON_LIBRARY || { books: [] };
  const SALAH = window.NOON_SALAH || { steps: [] };
  const KEY = 'noon-sweep-library';
  const API = 'https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions/';
  const root = $('view-library');
  let S = Object.assign({ marks: [], en: I.isEn, onlyAccepted: false, books: {} }, load(KEY, {}));
  const SHELF = window.NOON_BOOKS || { cats: [], books: [] };
  // The whole Musnad of Ahmad (al-Risalah numbering) takes the place of the caliphs' part.
  const LOCAL = window.NOON_LIBRARY_LOCAL || {};
  if (LOCAL.ahmad) {
    const b = LIB.books.find((x) => x.id === 'ahmad');
    if (b) Object.assign(b, { ar: 'مسند الإمام أحمد', en: 'Musnad Ahmad', count: LOCAL.ahmad.count, sections: LOCAL.ahmad.sections, src: 'local', slug: LOCAL.ahmad.slug, edition: LOCAL.ahmad.edition });
    // Hadiths saved from the old part keep pointing at the same hadith under its al-Risalah number.
    const moved = new Map(LOCAL.ahmad.migrate || []);
    let changed = false;
    S.marks.forEach((m) => { if (m.b === 'ahmad' && !m.v) { if (moved.has(m.n)) m.n = m.num = moved.get(m.n); m.v = 2; changed = true; } });
    if (changed) store(KEY, S);
  }
  // The books live on the website; the Android app leaves them out and reads them from there.
  const BOOKS = window.Capacitor ? 'https://micro4tricks-ai.github.io/muslim-todo-list/books/' : 'books/';
  const save = () => { S.updatedAt = Date.now(); store(KEY, S); };
  let screen = { name: 'home' }; // home | book | section | salah | marks | shelf (a full book) | read (its text)

  const SCHOLARS = {
    'Al-Albani': 'الألباني', 'Shuaib Al Arnaut': 'شعيب الأرناؤوط', 'Ahmad Muhammad Shakir': 'أحمد شاكر',
    'Bashar Awad Maarouf': 'بشار عواد معروف', 'Zubair Ali Zai': 'زبير علي زئي', 'Abu Ghuddah': 'عبد الفتاح أبو غدة',
    'Muhammad Muhyi Al-Din Abdul Hamid': 'محمد محيي الدين عبد الحميد'
  };
  const GRADES = {
    sahih: 'صحيح', hasan: 'حسن', 'hasan sahih': 'حسن صحيح', daif: 'ضعيف', "da'if": 'ضعيف', 'daif jiddan': 'ضعيف جداً',
    maudu: 'موضوع', "mawdu'": 'موضوع', 'sahih lighairihi': 'صحيح لغيره', 'hasan lighairihi': 'حسن لغيره',
    'isnaad sahih': 'إسناده صحيح', 'isnaad hasan': 'إسناده حسن', 'isnaad daif': 'إسناده ضعيف', munkar: 'منكر',
    shadh: 'شاذ', mauquf: 'موقوف', maqtu: 'مقطوع', 'sahih mauquf': 'صحيح موقوف', 'sahih maqtu': 'صحيح مقطوع'
  };
  const gradeText = (g) => (I.isEn ? g : GRADES[String(g).toLowerCase().trim()] || g);
  const gradeKind = (g) => { const x = String(g).toLowerCase(); return /daif|da'if|maudu|mawdu|munkar|shadh/.test(x) ? 'weak' : /sahih|hasan/.test(x) ? 'good' : 'other'; };
  const albani = (h) => (h.grades || []).find((g) => /Albani/.test(g.name));
  const bookOf = (id) => LIB.books.find((b) => b.id === id);
  const bookName = (b) => (I.isEn ? b.en : b.ar);
  const secName = (s) => (I.isEn ? s[2] : s[1] || s[2]);
  const numText = (h) => I.num(String(h.arabicnumber || h.hadithnumber).split('.')[0]);

  // ---- data ----
  const cache = new Map();
  function get(url) {
    if (!cache.has(url)) {
      const p = fetch(url).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
      p.catch(() => cache.delete(url));
      cache.set(url, p);
    }
    return cache.get(url);
  }
  // A gzipped JSON file under books/ (kept on the phone after the first read, for reading offline).
  const gzCache = new Map();
  function gz(path, v) {
    const url = BOOKS + path + (v ? `?v=${v}` : '');
    if (!gzCache.has(url)) {
      const p = (async () => {
        let res = null;
        const box = typeof caches !== 'undefined' ? await caches.open('library-v1').catch(() => null) : null;
        if (box) res = await box.match(url).catch(() => null);
        if (!res) {
          res = await fetch(url);
          if (!res.ok) throw new Error(res.status);
          if (box) box.put(url, res.clone()).catch(() => {});
        }
        const bytes = new Uint8Array(await res.arrayBuffer());
        // The server may have unzipped it already; otherwise unzip it here.
        if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return JSON.parse(new TextDecoder().decode(bytes));
        const text = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
        return JSON.parse(text);
      })();
      p.catch(() => gzCache.delete(url));
      gzCache.set(url, p);
    }
    return gzCache.get(url);
  }
  // Books from hadith-json come as one file, split here by chapter.
  const AB = 'https://cdn.jsdelivr.net/gh/AhmedBaset/hadith-json@main/db/by_book/';
  async function abBook(b) {
    const d = await get(`${AB}${b.path}.json`);
    if (!d._rows) {
      d._rows = d.hadiths.map((h) => ({
        hadithnumber: h.idInBook, arabicnumber: h.idInBook, chapter: String(h.chapterId), ar: tidy(h.arabic),
        en: [h.english && h.english.narrator, h.english && h.english.text].filter(Boolean).join(' ').trim(), grades: []
      }));
    }
    return d._rows;
  }
  async function section(bid, sec) {
    const book = bookOf(bid);
    if (book && book.src === 'ab') return (await abBook(book)).filter((h) => h.chapter === String(sec));
    if (book && book.src === 'local') {
      return (await gz(`${book.slug}/h${sec}.json.gz`, LOCAL.ahmad && LOCAL.ahmad.v)).map(([n, t]) => ({ hadithnumber: n, arabicnumber: n, ar: tidy(t), en: '', grades: [] }));
    }
    const [a, e] = await Promise.all([get(`${API}ara-${bid}/sections/${sec}.min.json`), get(`${API}eng-${bid}/sections/${sec}.min.json`).catch(() => null)]);
    const en = new Map(((e && e.hadiths) || []).map((h) => [h.hadithnumber, h]));
    return a.hadiths.map((h) => {
      const x = en.get(h.hadithnumber) || {};
      return { hadithnumber: h.hadithnumber, arabicnumber: h.arabicnumber, ar: tidy(h.text), en: x.text || '', grades: x.grades || h.grades || [] };
    });
  }

  // The source marks the Prophet's words with plain quotes and direction marks; show them as «…».
  function tidy(t) {
    let open = true;
    return String(t).replace(/\u200f/g, '').replace(/\s*"\s*/g, () => { const q = open ? ' «' : '» '; open = !open; return q; })
      .replace(/\s+([.،:])/g, '$1').replace(/\s+/g, ' ').trim();
  }

  // ================= screens =================
  function render() {
    root.replaceChildren();
    if (screen.name === 'book') return renderBook(bookOf(screen.book));
    if (screen.name === 'section') return renderSection();
    if (screen.name === 'salah') return renderSalah();
    if (screen.name === 'marks') return renderMarks();
    if (screen.name === 'shelf') return renderShelf();
    if (screen.name === 'read') return renderRead();
    if (screen.name === 'tool' && window.noonTools) return window.noonTools.render(screen.tool, root, back('المكتبة', { name: 'home' }));
    renderHome();
  }
  const go = (s) => { window.dispatchEvent(new Event('noon-library-screen')); screen = s; render(); root.scrollIntoView({ block: 'start' }); };
  const back = (label, to) => { const b = button('btn btn-quiet', `${I.isEn ? '←' : '→'} ${T(label)}`, () => go(to)); b.dataset.back = ''; return b; };

  function renderHome() {
    const head = el('div', 'view-head');
    head.append(el('h2', '', T('المكتبة')), el('span', 'view-sub', SHELF.books.length ? `${T('الكتب الستة وموطأ مالك')} · ${I.num(SHELF.books.length)} ${T('كتاباً كاملاً')}` : T('الكتب الستة وموطأ مالك')));
    root.append(head);
    const salah = button('lib-salah', '', () => go({ name: 'salah' }));
    salah.append(el('span', 'lib-salah-kicker', T('من التكبير إلى التسليم')), el('b', '', T('صفة صلاة النبي ﷺ')),
      el('span', '', `${I.num(SALAH.steps.length)} ${T('خطوة، كل خطوة بدليلها من الصحاح — على ترتيب كتاب الشيخ الألباني')}`));
    root.append(salah);
    // Hadith of the day: an-Nawawi's forty, one a day.
    const X = window.NOON_EXTRAS;
    if (X && X.forty.length) {
      const h = X.forty[Math.floor(Date.now() / 864e5) % X.forty.length];
      const card = el('div', 'daily-card');
      const t = el('p', 'daily-text', matn(tidy(h.ar)).slice(0, 420)); t.lang = 'ar'; t.dir = 'rtl';
      card.append(el('span', 'q-kicker', T('حديث اليوم')), t);
      if (S.en || I.isEn) { const e = el('p', 'daily-en', h.en.slice(0, 380)); e.dir = 'ltr'; card.append(e); }
      const ref = `${T('الأربعون النووية')} ${I.num(h.n)}`;
      card.append(el('span', 'hint', ref), button('link-btn', T('مشاركة ككارت'), () => window.noonCard && window.noonCard.shareImage({ kicker: T('حديث اليوم'), title: ref, body: matn(tidy(h.ar)) })));
      root.append(card);
    }
    // Tools.
    if (window.noonTools) {
      root.append(el('h3', 'lib-h', T('أدوات')));
      const tools = el('div', 'tool-grid');
      window.noonTools.list().forEach(([k, icon, ar, en]) => {
        const b = button('tool-btn', '', () => go({ name: 'tool', tool: k }));
        b.append(el('span', 'tool-icon', icon), el('span', '', I.isEn ? en : ar));
        tools.append(b);
      });
      root.append(tools);
    }
    root.append(el('h3', 'lib-h', T('الكتب الستة وموطأ مالك')));
    let grid = el('div', 'lib-grid');
    LIB.books.forEach((b, k) => {
      if (b.src === 'ab' && !LIB.books[k - 1].src) { root.append(grid, el('h3', 'lib-h', T('كتب أخرى'))); grid = el('div', 'lib-grid'); }
      const c = button('lib-book', '', () => go({ name: 'book', book: b.id }));
      c.dataset.book = b.id;
      c.append(el('b', '', bookName(b)), el('span', '', I.isEn ? b.authorEn : b.authorAr),
        el('small', '', `${b.count.toLocaleString(I.isEn ? 'en-GB' : 'ar-EG')} ${T('حديث')} · ${I.num(b.sections.length)} ${T(b.id === 'ahmad' ? 'مسنداً' : 'كتاباً')}`));
      grid.append(c);
    });
    root.append(grid);
    root.append(el('p', 'hint', T('الأربعينات ورياض الصالحين وبلوغ المرام والأدب المفرد والشمائل والمشكاة وسنن الدارمي من مشروع hadith-json المفتوح، بنصّها كما هو (وفيه تخريج المصنّف)، ومن غير أحكام إضافية. ومسند الإمام أحمد كاملاً بترقيم طبعة الرسالة، نصّه من المكتبة الشاملة دون حواشي المحققين.')));
    renderShelves();
    if (S.marks.length) root.append(button('btn btn-quiet', `${T('الأحاديث المحفوظة')} (${I.num(S.marks.length)})`, () => go({ name: 'marks' })));
    root.append(el('p', 'credit', T('النصوص والأحكام من مشروع hadith-api المفتوح (github.com/fawazahmed0/hadith-api)، وعناوين الكتب بالعربية من hadith-json. الترجمة الإنجليزية كما في sunnah.com. يُحمَّل كل باب عند فتحه أول مرة، ثم يبقى للقراءة دون إنترنت.')));
  }

  // ---- one book: its sections, search, a hadith by number ----
  let searchIndex = null; // { book, list: [[hadithnumber, arabicnumber, plain text]] }
  const MARKS = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;
  const norm = (s) => String(s).replace(MARKS, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/\s+/g, ' ');
  function sectionOf(b, hadithnumber) { return b.sections.find((s) => hadithnumber >= s[3] && hadithnumber <= s[4]); }

  function renderBook(b) {
    if (!b) return go({ name: 'home' });
    const head = el('div', 'view-head');
    head.append(back('المكتبة', { name: 'home' }), el('h2', '', bookName(b)));
    root.append(head);
    const tools = el('form', 'lib-tools');
    const q = el('input'); q.type = 'search'; q.placeholder = T('ابحث في الكتاب بكلمة، أو اكتب رقم الحديث');
    q.setAttribute('aria-label', T('بحث في الكتاب'));
    const out = el('div', 'lib-results');
    tools.append(q, button('btn btn-primary', T('بحث')));
    tools.lastChild.type = 'submit';
    tools.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const v = q.value.trim().replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
      if (!v) return;
      if (/^\d+$/.test(v)) return openNumber(b, Number(v));
      out.replaceChildren(el('p', 'hint', T('جارٍ تحميل الكتاب للبحث (مرة واحدة)…')));
      try {
        if (!searchIndex || searchIndex.book !== b.id) {
          const j = b.src === 'ab' ? { hadiths: (await abBook(b)).map((h) => ({ hadithnumber: h.hadithnumber, arabicnumber: h.arabicnumber, text: h.ar })) }
            : b.src === 'local' ? { hadiths: await allLocal(b, (k) => { out.replaceChildren(el('p', 'hint', `${T('جارٍ تحميل الكتاب للبحث (مرة واحدة)…')} ${Math.min(100, Math.round((k / b.sections.length) * 100))}%`)); }) }
            : await get(`${API}ara-${b.id}1.min.json`);
          searchIndex = { book: b.id, list: j.hadiths.map((h) => [h.hadithnumber, h.arabicnumber, norm(h.text), tidy(h.text)]) };
        }
        const needle = norm(v);
        const hits = searchIndex.list.filter((x) => x[2].includes(needle)).slice(0, 50);
        out.replaceChildren(el('p', 'view-sub', hits.length ? `${I.num(hits.length)}${hits.length === 50 ? '+' : ''} ${T('نتيجة')}` : T('لا نتائج. جرّب كلمة أخرى.')));
        hits.forEach(([hn, an, text, raw]) => {
          // The snippet near the match, from the original text (this edition has almost no marks, so positions line up).
          const i = Math.max(0, norm(raw).indexOf(needle));
          text = raw;
          const r = button('lib-hit', '', () => { const s = sectionOf(b, hn); if (s) go({ name: 'section', book: b.id, sec: s[0], focus: hn }); });
          r.append(el('b', '', `${T('حديث')} ${I.num(String(an).split('.')[0])}`), el('span', '', `…${text.slice(Math.max(0, i - 60), i + 90)}…`));
          out.append(r);
        });
      } catch (_) {
        out.replaceChildren(el('p', 'hint', T('البحث يحتاج اتصالاً بالإنترنت أول مرة.')));
      }
    });
    root.append(tools, out);
    const list = el('ol', 'lib-sections');
    b.sections.forEach((s) => {
      const li = el('li');
      const btn = button('lib-sec', '', () => go({ name: 'section', book: b.id, sec: s[0] }));
      btn.append(el('span', 'lib-sec-num', I.num(s[0])), el('b', '', secName(s)),
        el('small', '', `${I.num(String(s[5]).split('.')[0])} – ${I.num(String(s[6]).split('.')[0])}`));
      li.append(btn);
      list.append(li);
    });
    root.append(list);
  }
  // Every section of a local hadith book, a few at a time, for searching it.
  async function allLocal(b, progress) {
    const all = [];
    for (let k = 0; k < b.sections.length; k += 12) {
      const part = await Promise.all(b.sections.slice(k, k + 12).map((s) => section(b.id, s[0])));
      part.forEach((rows) => rows.forEach((h) => all.push({ hadithnumber: h.hadithnumber, arabicnumber: h.arabicnumber, text: h.ar })));
      if (progress) progress(k + 12);
    }
    return all;
  }
  function openNumber(b, n) {
    // Numbers typed are the standard ones; find the section whose range holds them.
    const s = b.sections.find((x) => n >= Math.floor(Number(x[5])) && n <= Math.floor(Number(x[6])));
    if (!s) { toast(T('لا يوجد حديث بهذا الرقم في هذا الكتاب.')); return; }
    go({ name: 'section', book: b.id, sec: s[0], focusNumber: n });
  }

  // ---- one section: its hadiths, 40 at a time ----
  async function renderSection() {
    const b = bookOf(screen.book), s = b && b.sections.find((x) => x[0] === screen.sec);
    if (!s) return go({ name: 'home' });
    const head = el('div', 'view-head');
    head.append(back(bookName(b), { name: 'book', book: b.id }), el('h2', '', secName(s)));
    root.append(head);
    const bar = el('div', 'lib-bar');
    const enBox = el('label', 'check'); const en = el('input'); en.type = 'checkbox'; en.checked = S.en;
    en.addEventListener('change', () => { S.en = en.checked; save(); render(); });
    enBox.append(en, ' ', T('إظهار الترجمة الإنجليزية'));
    bar.append(enBox);
    if (b.id !== 'bukhari' && b.id !== 'muslim' && b.src !== 'ab' && b.src !== 'local') {
      const okBox = el('label', 'check'); const ok = el('input'); ok.type = 'checkbox'; ok.checked = S.onlyAccepted;
      ok.addEventListener('change', () => { S.onlyAccepted = ok.checked; save(); render(); });
      okBox.append(ok, ' ', T('الصحيح والحسن فقط (بحكم الألباني)'));
      bar.append(okBox);
    }
    root.append(bar);
    const list = el('div', 'lib-list');
    list.append(el('p', 'hint', T('جارٍ تحميل الأحاديث…')));
    root.append(list);
    let items;
    try { items = await section(b.id, s[0]); } catch (_) {
      list.replaceChildren(el('p', 'empty', T('تعذّر تحميل هذا الباب. القراءة أول مرة تحتاج اتصالاً بالإنترنت.')));
      return;
    }
    if (screen.sec !== s[0] || screen.book !== b.id) return;
    const shown = S.onlyAccepted ? items.filter((h) => { const g = albani(h); return !g || gradeKind(g.grade) === 'good'; }) : items;
    list.replaceChildren();
    let upto = 0;
    const focus = screen.focus || null, focusNumber = screen.focusNumber || null;
    let target = focus ? shown.findIndex((h) => h.hadithnumber === focus) : focusNumber ? shown.findIndex((h) => Math.floor(Number(h.arabicnumber)) === focusNumber) : -1;
    const more = button('btn btn-quiet lib-more', T('المزيد'), () => page());
    function page(to) {
      const end = Math.min(shown.length, Math.max(upto + 40, (to || 0) + 5));
      for (; upto < end; upto++) list.append(card(b, shown[upto]));
      more.hidden = upto >= shown.length;
    }
    page(target);
    root.append(more);
    if (!shown.length) list.append(el('p', 'empty', T('لا أحاديث بهذا الشرط في هذا الباب.')));
    if (target >= 0) {
      const node = list.children[target];
      if (node) { node.classList.add('is-flash'); setTimeout(() => node.scrollIntoView({ block: 'center' }), 60); }
    }
  }

  function card(b, h) {
    const art = el('article', 'hadith');
    const top = el('div', 'hadith-top');
    top.append(el('b', 'hadith-num', `${bookName(b)} ${numText(h)}`));
    (h.grades || []).forEach((g) => {
      const c = el('span', `grade is-${gradeKind(g.grade)}`, `${gradeText(g.grade)}`);
      c.title = I.isEn ? g.name : (SCHOLARS[g.name] || g.name);
      c.prepend(el('small', '', `${I.isEn ? g.name.replace(/^Al-/, '') : SCHOLARS[g.name] || g.name}: `));
      top.append(c);
    });
    const ar = el('p', 'hadith-ar', h.ar);
    ar.lang = 'ar'; ar.dir = 'rtl';
    art.append(top, ar);
    if (S.en && h.en) { const e = el('p', 'hadith-en', h.en); e.lang = 'en'; e.dir = 'ltr'; art.append(e); }
    const acts = el('div', 'hadith-acts');
    const ref = `${bookName(b)} ${numText(h)}`;
    const marked = () => S.marks.some((m) => m.b === b.id && m.n === h.hadithnumber);
    const markBtn = button('link-btn', T(marked() ? 'إزالة من المحفوظات' : 'حفظ'), () => {
      if (marked()) S.marks = S.marks.filter((m) => !(m.b === b.id && m.n === h.hadithnumber));
      else S.marks.unshift({ b: b.id, n: h.hadithnumber, num: h.arabicnumber, text: h.ar.slice(0, 400), at: Date.now() });
      save();
      markBtn.textContent = T(marked() ? 'إزالة من المحفوظات' : 'حفظ');
    });
    acts.append(markBtn,
      button('link-btn', T('نسخ'), async () => { try { await navigator.clipboard.writeText(`${h.ar}\n[${ref}]`); toast(T('نُسخ الحديث.')); } catch (_) { toast(T('تعذّر النسخ.')); } }),
      button('link-btn', T('مشاركة ككارت'), () => window.noonCard && window.noonCard.shareImage({ kicker: T('حديث شريف'), title: ref, body: matn(h.ar), ref: gradeLine(h) })),
      button('link-btn', T('أضف للكروت'), () => {
        const ok = window.noonCards && window.noonCards.add(T('أحاديث للحفظ'), `${ref}\n${T('ما نص الحديث؟')}`, matn(h.ar));
        toast(T(ok ? 'أُضيف الحديث إلى مجموعة «أحاديث للحفظ».' : 'هذا الحديث موجود في الكروت.'));
      }));
    art.append(acts);
    return art;
  }
  // The Prophet's words, when the text marks them with quotes; otherwise the whole text.
  function matn(t) {
    const m = /«\s*([^»]{20,})»/.exec(String(t));
    return (m ? m[1] : t).trim();
  }
  function gradeLine(h) { const g = albani(h); return g ? `${I.isEn ? 'al-Albani' : 'الألباني'}: ${gradeText(g.grade)}` : ''; }


  // ================= the full books (from Shamela) =================
  const shelfBook = (slug) => SHELF.books.find((x) => x.slug === slug);
  const catName = (c) => { const x = SHELF.cats.find((y) => y[0] === c); return x ? (I.isEn ? x[2] : x[1]) : c; };
  const deathText = (d) => (d && d < 9000 ? `${I.isEn ? 'd.' : 'ت'} ${I.num(d)}${I.isEn ? ' AH' : 'هـ'}` : '');
  const sizeText = (n) => (n >= 1e6 ? `${I.num((n / 1e6).toFixed(1))} ${T('ميجابايت')}` : `${I.num(Math.max(1, Math.round(n / 1e3)))} ${T('كيلوبايت')}`);
  function renderShelves() {
    if (!SHELF.books.length) return;
    root.append(el('h3', 'lib-h', T('كتب كاملة من المكتبة الشاملة')));
    // Recently read first.
    const recent = Object.entries(S.books || {}).sort((a, b) => b[1].at - a[1].at).map(([k]) => shelfBook(k)).filter(Boolean).slice(0, 4);
    if (recent.length) {
      const row = el('div', 'lib-grid');
      recent.forEach((b) => row.append(bookCard(b, true)));
      root.append(el('p', 'view-sub', T('تابع القراءة')), row);
    }
    SHELF.cats.forEach(([c]) => {
      const list = SHELF.books.filter((b) => b.cat === c);
      if (!list.length) return;
      const box = el('details', 'lib-shelf');
      const sum = el('summary');
      sum.append(el('b', '', catName(c)), el('span', 'hint', `${I.num(list.length)} ${T('كتاباً')}`));
      box.append(sum);
      const grid = el('div', 'lib-grid');
      list.forEach((b) => grid.append(bookCard(b)));
      box.append(grid);
      root.append(box);
    });
    root.append(el('p', 'hint', T('نصوص هذه الكتب من المكتبة الشاملة، لمؤلفين توفّوا قبل أكثر من سبعين سنة، بنصّ المؤلف وحده دون حواشي المحققين ومقدماتهم. يُحمَّل كل جزء عند فتحه أول مرة ثم يبقى للقراءة دون إنترنت.')));
  }
  function bookCard(b, withPlace) {
    const c = button('lib-book lib-full', '', () => go({ name: 'shelf', slug: b.slug }));
    c.dataset.cat = b.cat;
    const by = [I.isEn ? b.authorEn : b.author, deathText(b.death)].filter(Boolean).join(' · ');
    c.append(el('b', '', I.isEn ? b.en : b.ar), el('span', '', by));
    const place = S.books && S.books[b.slug];
    c.append(el('small', '', withPlace && place && place.label ? place.label : `${I.num(b.pages)} ${T('صفحة')} · ${sizeText(b.size)}`));
    return c;
  }

  // One book: its source, where you stopped, its contents and a search.
  async function renderShelf() {
    const b = shelfBook(screen.slug);
    if (!b) return go({ name: 'home' });
    const head = el('div', 'view-head');
    head.append(back('المكتبة', { name: 'home' }), el('h2', '', I.isEn ? b.en : b.ar));
    root.append(head);
    const card = el('div', 'lib-about');
    card.append(el('p', '', `${T('المؤلف')}: ${I.isEn ? b.authorEn : b.author}${b.death && b.death < 9000 ? ` (${deathText(b.death)})` : ''}`));
    if (b.edition) card.append(el('p', '', `${T('الطبعة')}: ${b.edition.replace(/^ت\s+/, T('تحقيق') + ' ').replace(/^ط\s+/, T('طبعة') + ' ')}`));
    card.append(el('p', 'hint', `${T('من المكتبة الشاملة، بنص المؤلف دون حواشي المحقق.')} ${I.num(b.pages)} ${T('صفحة')} · ${sizeText(b.size)}`));
    const place = S.books && S.books[b.slug];
    const acts = el('div', 'hadith-acts');
    acts.append(button('btn btn-primary', T(place ? 'تابع القراءة' : 'ابدأ القراءة'), () => go({ name: 'read', slug: b.slug, f: place ? place.f : 0, page: place ? place.p : null })));
    card.append(acts);
    root.append(card);
    // Search in the book: all its files, one at a time, stopping at 60 results.
    const form = el('form', 'lib-tools');
    const q = el('input'); q.type = 'search'; q.placeholder = T('ابحث في الكتاب'); q.setAttribute('aria-label', T('ابحث في الكتاب'));
    const out = el('div', 'lib-results');
    form.append(q, button('btn btn-primary', T('بحث')));
    form.lastChild.type = 'submit';
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const needle = norm(q.value.trim()).trim();
      if (needle.length < 2) return;
      const hits = [];
      try {
        for (let f = 0; f < b.files && hits.length < 60; f++) {
          out.replaceChildren(el('p', 'hint', `${T('جارٍ البحث…')} ${Math.round((f / b.files) * 100)}%`));
          (await gz(`${b.slug}/${f}.json.gz`, b.v)).forEach((pg) => pg[3].forEach((x) => {
            const t = typeof x === 'string' ? x : x[1];
            if (hits.length < 60 && norm(t).includes(needle)) hits.push({ f, page: pg[0], t, where: pageLabel(pg) });
          }));
          if (screen.name !== 'shelf' || screen.slug !== b.slug) return;
        }
      } catch (_) { out.replaceChildren(el('p', 'hint', T('البحث يحتاج اتصالاً بالإنترنت أول مرة.'))); return; }
      out.replaceChildren(el('p', 'view-sub', hits.length ? `${I.num(hits.length)}${hits.length === 60 ? '+' : ''} ${T('نتيجة')}` : T('لا نتائج. جرّب كلمة أخرى.')));
      hits.forEach((h) => {
        // The snippet near the match (positions in the marked text drift a little; close enough for a snippet).
        const i = Math.max(0, norm(h.t).indexOf(needle));
        const r = button('lib-hit', '', () => go({ name: 'read', slug: b.slug, f: h.f, page: h.page }));
        r.append(el('b', '', h.where || T('نتيجة')), el('span', '', `…${h.t.slice(Math.max(0, i - 60), i + 100)}…`));
        out.append(r);
      });
    });
    root.append(form, out);
    // Contents: the main headings, each opening onto the ones under it.
    root.append(el('h3', 'lib-h', T('الفهرس')));
    const tocBox = el('div', 'lib-toc');
    tocBox.append(el('p', 'hint', T('جارٍ تحميل الفهرس…')));
    root.append(tocBox);
    let idx;
    try { idx = await gz(`${b.slug}/index.json.gz`, b.v); } catch (_) {
      tocBox.replaceChildren(el('p', 'empty', T('تعذّر تحميل هذا الكتاب. القراءة أول مرة تحتاج اتصالاً بالإنترنت.')));
      return;
    }
    if (screen.name !== 'shelf' || screen.slug !== b.slug) return;
    tocBox.replaceChildren();
    const toc = idx.toc;
    if (!toc.length) { tocBox.append(el('p', 'hint', T('لا فهرس لهذا الكتاب؛ اقرأه من أوله.'))); return; }
    const top = Math.min(...toc.map((x) => x[1]));
    const link = (x) => button('lib-sec lib-toc-link', x[2], () => go({ name: 'read', slug: b.slug, f: x[3], toc: x[0] }));
    toc.forEach((x, k) => {
      if (x[1] !== top) return;
      const kids = [];
      for (let j = k + 1; j < toc.length && toc[j][1] > top; j++) if (toc[j][1] === top + 1) kids.push(toc[j]);
      if (!kids.length) { tocBox.append(link(x)); return; }
      const d = el('details', 'lib-toc-group');
      const sum = el('summary');
      sum.append(el('span', '', x[2]), el('small', 'hint', I.num(kids.length)));
      d.append(sum);
      d.addEventListener('toggle', () => { if (d.open && d.children.length === 1) { d.append(link(x)); kids.forEach((y) => d.append(link(y))); } });
      tocBox.append(d);
    });
  }
  const pageLabel = (pg) => (pg[2] ? `${pg[1] ? `${T('ج')} ${I.num(pg[1])} · ` : ''}${T('ص')} ${I.num(pg[2])}` : '');

  // A part of a book: its pages, with headings, and the way to the next part.
  async function renderRead() {
    const b = shelfBook(screen.slug);
    if (!b) return go({ name: 'home' });
    const f = Math.max(0, Math.min(b.files - 1, screen.f || 0));
    const head = el('div', 'view-head');
    head.append(back(I.isEn ? b.en : b.ar, { name: 'shelf', slug: b.slug }), el('h2', '', I.isEn ? b.en : b.ar));
    root.append(head);
    const nav = (where) => {
      const n = el('div', `lib-read-nav ${where}`);
      if (f > 0) n.append(button('btn btn-quiet', `${I.isEn ? '←' : '→'} ${T('الجزء السابق')}`, () => go({ name: 'read', slug: b.slug, f: f - 1, end: true })));
      n.append(el('span', 'hint', `${T('الجزء')} ${I.num(f + 1)} / ${I.num(b.files)}`));
      if (f < b.files - 1) n.append(button('btn btn-primary', `${T('الجزء التالي')} ${I.isEn ? '→' : '←'}`, () => go({ name: 'read', slug: b.slug, f: f + 1 })));
      return n;
    };
    root.append(nav('is-top'));
    const box = el('div', 'lib-read');
    box.lang = 'ar'; box.dir = 'rtl';
    box.append(el('p', 'hint', T('جارٍ التحميل…')));
    root.append(box);
    let pages;
    try { pages = await gz(`${b.slug}/${f}.json.gz`, b.v); } catch (_) {
      box.replaceChildren(el('p', 'empty', T('تعذّر تحميل هذا الجزء. القراءة أول مرة تحتاج اتصالاً بالإنترنت.')));
      return;
    }
    if (screen.name !== 'read' || screen.slug !== b.slug || (screen.f || 0) !== f) return;
    box.replaceChildren();
    let target = null;
    pages.forEach((pg) => {
      const sec = el('section', 'lib-pg');
      sec.dataset.page = String(pg[0]);
      pg[3].forEach((x) => {
        if (typeof x === 'string') { sec.append(el('p', '', x)); return; }
        const h = el('h3', 'lib-read-h', x[1]);
        h.dataset.toc = String(x[0]);
        if (screen.toc && x[0] === screen.toc) target = h;
        sec.append(h);
      });
      if (pageLabel(pg)) sec.append(el('span', 'lib-pg-n', pageLabel(pg)));
      if (screen.page && pg[0] === screen.page) target = target || sec;
      box.append(sec);
    });
    root.append(nav('is-bottom'));
    const keep = () => {
      // Where you are: the first page at the top of the screen.
      const secs = box.querySelectorAll('.lib-pg');
      let at = secs[0];
      for (const x of secs) { if (x.getBoundingClientRect().bottom > 90) { at = x; break; } }
      if (!at) return;
      const pg = pages.find((x) => String(x[0]) === at.dataset.page);
      S.books = S.books || {};
      S.books[b.slug] = { f, p: pg[0], at: Date.now(), label: `${T('الجزء')} ${I.num(f + 1)}${pageLabel(pg) ? ` · ${pageLabel(pg)}` : ''}` };
      save();
    };
    let t = 0;
    const onScroll = () => { clearTimeout(t); t = setTimeout(keep, 600); };
    window.addEventListener('scroll', onScroll, { passive: true });
    const stop = () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('noon-library-screen', stop); };
    window.addEventListener('noon-library-screen', stop);
    setTimeout(() => {
      if (target) target.scrollIntoView({ block: 'start' });
      else if (screen.end) box.lastElementChild.scrollIntoView({ block: 'end' });
      else root.scrollIntoView({ block: 'start' }); // the text has come in: back to the top of it
      keep();
    }, 40);
  }

  function renderMarks() {
    const head = el('div', 'view-head');
    head.append(back('المكتبة', { name: 'home' }), el('h2', '', T('الأحاديث المحفوظة')));
    root.append(head);
    if (!S.marks.length) { root.append(el('p', 'empty', T('لا أحاديث محفوظة بعد.'))); return; }
    S.marks.forEach((m) => {
      const b = bookOf(m.b);
      if (!b) return;
      const row = el('div', 'q-mark');
      const open = button('q-mark-open', '', () => { const s = sectionOf(b, m.n); if (s) go({ name: 'section', book: b.id, sec: s[0], focus: m.n }); });
      const t = el('span', 'lib-mark-text', m.text);
      t.lang = 'ar'; t.dir = 'rtl';
      open.append(el('b', '', `${bookName(b)} ${I.num(String(m.num || m.n).split('.')[0])}`), t);
      row.append(open, button('link-btn danger', T('إزالة'), () => { S.marks = S.marks.filter((x) => x !== m); save(); render(); }));
      root.append(row);
    });
  }

  // ---- the Prophet's prayer ﷺ, step by step ----
  function renderSalah() {
    const head = el('div', 'view-head');
    head.append(back('المكتبة', { name: 'home' }), el('h2', '', T('صفة صلاة النبي ﷺ')));
    root.append(head);
    const intro = el('div', 'salah-intro');
    intro.append(el('p', '', T('خطوات الصلاة من التكبير إلى التسليم على ترتيب كتاب «صفة صلاة النبي ﷺ» للشيخ محمد ناصر الدين الألباني رحمه الله، ومع كل خطوة دليلها من الأحاديث الصحيحة بنصّها ومصدرها. الكتاب نفسه محفوظ الحقوق لناشره، فلم ننقل نصّه؛ وللتفصيل والزيادات اقرأه كاملاً:')));
    const links = el('div', 'salah-links');
    const a1 = el('a', 'btn btn-primary', T('اقرأ الكتاب في المكتبة الشاملة')); a1.href = SALAH.book.url; a1.target = '_blank'; a1.rel = 'noopener';
    const a2 = el('a', 'btn btn-quiet', T('أصل صفة الصلاة (المطوّل)')); a2.href = SALAH.book.full; a2.target = '_blank'; a2.rel = 'noopener';
    links.append(a1, a2);
    intro.append(links);
    root.append(intro);
    const ol = el('ol', 'salah-steps');
    SALAH.steps.forEach((st) => {
      const li = el('li', 'salah-step');
      li.append(el('h3', '', I.isEn ? st.en : st.ar));
      st.hadith.forEach((h) => {
        const q = el('blockquote', 'cal-hadith');
        const a = el('p', 'cal-hadith-ar', h.ar); a.lang = 'ar'; a.dir = 'rtl';
        const e = el('p', 'cal-hadith-en', h.en); e.lang = 'en'; e.dir = 'ltr';
        q.append(...(I.isEn ? [e, a] : [a, e]), el('cite', '', I.isEn ? h.refEn : h.refAr));
        li.append(q);
      });
      ol.append(li);
    });
    root.append(ol);
  }

  onRemote(KEY, () => { S = Object.assign(S, load(KEY, {})); if (!root.hidden && screen.name === 'marks') render(); });
  window.addEventListener('noon-view', (ev) => { if (ev.detail.view === 'library' && !root.childNodes.length) render(); });
  window.noonLibrary = { open: (name, tool) => { window.noonUI.go('library'); go({ name: name || 'home', tool }); } };
  render();
})();
