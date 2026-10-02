// ---------- Settings: one screen for everything the app can be set to, laid out like Android's ----------
// The existing panels (location and prayer times, the adhan and alerts, appearance, account sync,
// the version) move into its pages, each keeping its own code; this file arranges and navigates.
// The phone's back button steps back through the pages (browser history).
(() => {
  'use strict';
  const { T, I, $, el, button } = window.noonUI;

  const ICONS = {
    globe: '<g fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.7 5.6 3.7 9s-1.2 6.4-3.7 9c-2.5-2.6-3.7-5.6-3.7-9S9.5 5.6 12 3z"/></g>',
    pin: '<path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="10" r="2.4" fill="currentColor"/>',
    bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2H4.5zM10 20.5a2 2 0 0 0 4 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>',
    palette: '<path d="M12 3a9 9 0 0 0 0 18c1.3 0 2-.9 1.6-2-.4-1.2.3-2.4 1.6-2.4H17a4 4 0 0 0 4-4C21 7 17 3 12 3z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="7.5" cy="11.5" r="1.3" fill="currentColor"/><circle cx="10" cy="7.5" r="1.3" fill="currentColor"/><circle cx="14.5" cy="7.5" r="1.3" fill="currentColor"/>',
    font: '<path d="M4 19L9.5 5h1L16 19M6.2 14h7.6M16.5 19c0-2.4 1.2-3.6 3.2-3.6 1 0 1.8.3 2.3.8V19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
    cloud: '<path d="M7 18.5h10.5a4 4 0 0 0 .4-8A6 6 0 0 0 6.4 9.2 4.7 4.7 0 0 0 7 18.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
    info: '<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.1"/></g>',
    back: '<path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
    chevron: '<path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
    gear: '<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 2.8l1.6 2.3 2.7-.6.6 2.7 2.3 1.6-1.2 2.5 1.2 2.5-2.3 1.6-.6 2.7-2.7-.6L12 21.2l-1.6-2.3-2.7.6-.6-2.7-2.3-1.6L6 12.7 4.8 10.2l2.3-1.6.6-2.7 2.7.6z"/><circle cx="12" cy="12" r="3"/></g>'
  };
  function icon(name, cls) {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true');
    if (cls) s.setAttribute('class', cls);
    s.innerHTML = ICONS[name];
    return s;
  }

  // ---- the screen ----
  const root = el('div', 'st');
  root.hidden = true;
  root.dir = I.isEn ? 'ltr' : 'rtl';
  root.lang = I.isEn ? 'en' : 'ar';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  const barTitle = el('h2', 'st-title');
  const backBtn = button('st-back', '', () => history.back(), T('رجوع'));
  backBtn.append(icon('back'));
  const bar = el('header', 'st-bar');
  bar.append(backBtn, barTitle);
  const body = el('div', 'st-body');
  const store = el('div'); store.hidden = true; // pages not on screen keep their panels here
  // The welcome steps' footer: where you are, and the way on.
  const foot = el('footer', 'st-foot'); foot.hidden = true;
  const dots = el('span', 'st-dots');
  const skip = button('link-btn st-skip', T('تخطي'), () => finishWizard());
  const next = button('btn btn-primary st-next', T('التالي'), () => nextStep());
  foot.append(skip, dots, next);
  root.append(bar, body, foot, store);
  document.body.append(root);

  // The panels that move in. The adhan settings leave the location panel for a page of their own.
  const pa = document.querySelector('#placePanel .pa-box');
  const versionLine = document.querySelector('.app-version');
  const shortcuts = document.querySelector('.shortcuts');
  [pa, $('placePanel'), $('lookPanel'), $('syncPanel'), versionLine, shortcuts].forEach((n) => { if (n) store.append(n); });

  const lookName = () => {
    const m = (window.noonLook && window.noonLook.get().mode) || 'auto';
    return T({ auto: 'تلقائي (حسب الجهاز)', light: 'فاتح', dark: 'داكن' }[m] || 'تلقائي (حسب الجهاز)');
  };
  const fontNames = () => {
    const L = window.noonLook, g = L.get();
    const ar = (L.fonts.ar.find((f) => f[0] === g.fontAr) || L.fonts.ar[0]);
    const en = (L.fonts.en.find((f) => f[0] === g.fontEn) || L.fonts.en[0]);
    return `${I.isEn ? ar[1] : ar[2]} · ${en[1] || T('مثل الخط العربي')}`;
  };
  const PAGES = {
    lang: { title: 'اللغة', icon: 'globe', sub: () => (I.isEn ? 'English' : 'العربية'), build: buildLang },
    place: { title: 'الموقع ومواقيت الصلاة', icon: 'pin', sub: () => $('placeName').textContent, node: () => $('placePanel'), open: () => window.noonPlace && window.noonPlace.open() },
    adhan: { title: 'الأذان والتنبيهات', icon: 'bell', node: () => pa,
      sub: () => (window.noonDevice && window.noonDevice.status() && !window.noonDevice.ok() ? `⚠ ${T('يحتاج ضبطاً')}` : T($('paEnabled').checked ? 'مفعّلة' : 'متوقفة')) },
    look: { title: 'الألوان والخلفية', icon: 'palette', sub: lookName, node: () => $('lookPanel'), open: () => window.noonLook.open() },
    fonts: { title: 'الخطوط', icon: 'font', sub: fontNames, build: buildFonts },
    account: { title: 'الحساب والمزامنة', icon: 'cloud', sub: () => $('syncLabel').textContent, node: () => $('syncPanel') },
    about: { title: 'حول التطبيق', icon: 'info', sub: () => $('appVersion').textContent, build: buildAbout },
    welcome: { title: 'أهلاً بك', icon: 'info', sub: () => '', build: buildWelcome }
  };
  const GROUPS = [['عام', ['lang', 'place', 'adhan']], ['المظهر', ['look', 'fonts']], ['الحساب', ['account']], ['', ['about']]];

  let page = null; // null = closed, 'home', or a page id
  let depth = 0;   // our steps in the history, so back closes the screen at the right one
  function show(id) {
    // Panels on screen go back to the store before the page changes (the about page borrows two).
    [...body.querySelectorAll(':scope > .st-hosted')].forEach((n) => { n.classList.remove('st-hosted'); store.append(n); });
    [versionLine, shortcuts].forEach((n) => { if (n && n.parentNode !== store) store.append(n); });
    body.replaceChildren();
    page = id;
    root.dataset.page = id;
    if (id === 'home') { barTitle.textContent = T('الإعدادات'); renderHome(); }
    else {
      const P = PAGES[id];
      barTitle.textContent = T(P.title);
      if (P.node) {
        const n = P.node();
        n.hidden = false;
        n.classList.add('st-hosted');
        body.append(n);
        if (P.open) P.open();
        n.hidden = false;
      } else P.build(body);
    }
    body.scrollTop = 0;
    paintWizard(id);
  }
  function renderHome() {
    const head = el('div', 'st-hero');
    head.append(icon('gear', 'st-hero-icon'), el('b', '', T('مسلم تو دو')), el('span', '', T('كل إعدادات التطبيق في مكان واحد')));
    body.append(head);
    GROUPS.forEach(([name, ids]) => {
      const g = el('section', 'st-group');
      if (name) g.append(el('h3', 'st-group-name', T(name)));
      const list = el('div', 'st-list');
      ids.forEach((id) => {
        const P = PAGES[id];
        const r = button('st-row', '', () => go(id));
        const txt = el('span', 'st-row-text');
        let sub = '';
        try { sub = P.sub(); } catch (_) {}
        txt.append(el('b', '', T(P.title)), el('small', '', sub));
        r.append(el('span', `st-ico st-ico-${id}`), txt, icon('chevron', 'st-chev'));
        r.querySelector('.st-ico').append(icon(P.icon));
        r.dataset.page = id;
        list.append(r);
      });
      g.append(list);
      body.append(g);
    });
  }

  // ---- navigation: each page is a step in the history, so the phone's back button works ----
  function open(id) {
    const wasClosed = page === null;
    if (wasClosed) {
      root.hidden = false;
      document.body.classList.add('st-open');
      history.pushState({ st: 'home' }, '');
      depth = 1;
      show('home');
    }
    if (id && id !== 'home') go(id);
    else if (!wasClosed) show('home');
  }
  function go(id) { history.pushState({ st: id }, ''); depth++; show(id); }
  function close() {
    wiz = null;
    show('home');
    [...body.children].forEach((n) => n.remove());
    page = null;
    depth = 0;
    root.hidden = true;
    document.body.classList.remove('st-open');
  }
  addEventListener('popstate', (ev) => {
    if (page === null) return;
    depth--;
    const st = ev.state && ev.state.st;
    if (depth <= 0) { if (wiz) markDone(); close(); } else show(st && PAGES[st] ? st : 'home');
  });
  document.addEventListener('keydown', (ev) => {
    if (page !== null && ev.key === 'Escape') { ev.stopPropagation(); ev.preventDefault(); history.back(); }
  }, true);

  // The old ways in now lead here: the clock's location and look chips, and the sync button.
  const redirect = (id, to) => {
    const b = $(id);
    if (b) b.addEventListener('click', (ev) => { ev.stopImmediatePropagation(); ev.preventDefault(); open(to); }, true);
  };
  redirect('placeChip', 'place');
  redirect('lookChip', 'look');
  redirect('syncBtn', 'account');
  ['settingsBtn', 'quickSettings'].forEach((id) => { const b = $(id); if (b) b.addEventListener('click', () => open('home')); });

  // ---- pages built here ----
  function choice(label, sample, on, pick, sampleFont) {
    const b = button('st-choice', '', pick);
    b.setAttribute('aria-pressed', String(on));
    const t = el('span', 'st-choice-text');
    t.append(el('b', '', label));
    if (sample) { const s = el('span', 'st-sample', sample); if (sampleFont) s.style.fontFamily = sampleFont; t.append(s); }
    const mark = el('span', 'st-radio'); if (on) mark.append(icon('check'));
    b.append(t, mark);
    return b;
  }
  function buildLang(box) {
    const list = el('div', 'st-list');
    list.append(
      choice('العربية', '', !I.isEn, () => { if (I.isEn) { keepStep(); I.setLang('ar'); } }),
      choice('English', '', I.isEn, () => { if (!I.isEn) { keepStep(); I.setLang('en'); } })
    );
    box.append(list, el('p', 'st-note', T('تُعاد الصفحة بعد تغيير اللغة.')));
  }
  function buildFonts(box) {
    const L = window.noonLook;
    const preview = el('div', 'st-preview');
    const pv1 = el('b', '', 'مهام اليوم · Today’s tasks');
    const pv2 = el('span', '', 'سبحان الله وبحمده، سبحان الله العظيم — 1447 ١٤٤٧');
    preview.append(pv1, pv2);
    const lists = el('div', 'st-stack');
    box.append(preview, lists);
    const draw = () => {
      lists.replaceChildren();
      const g = L.get();
      const arG = el('section', 'st-group');
      arG.append(el('h3', 'st-group-name', T('الخط العربي')));
      const arL = el('div', 'st-list');
      L.fonts.ar.forEach(([id, family, name]) => arL.append(choice(I.isEn ? family : name, 'بسم الله الرحمن الرحيم · مهام اليوم ١٢٣', g.fontAr === id,
        () => { L.setFont('ar', id); draw(); }, `"${family}", sans-serif`)));
      arG.append(arL);
      const enG = el('section', 'st-group');
      enG.append(el('h3', 'st-group-name', T('الخط الإنجليزي')));
      const enL = el('div', 'st-list');
      L.fonts.en.forEach(([id, family, name]) => enL.append(choice(family ? name : T(name), 'Today’s tasks · Quran 123', g.fontEn === id,
        () => { L.setFont('en', id); draw(); }, family ? `"${family}", sans-serif` : '')));
      enG.append(enL);
      lists.append(arG, enG);
    };
    draw();
    box.append(el('p', 'st-note', T('الخط الإنجليزي يُستخدم للحروف اللاتينية، والعربي لما سواها. خط المصحف والأحاديث يبقى كما هو.')));
  }
  function buildAbout(box) {
    const card = el('div', 'st-about');
    const logo = el('img', 'st-logo'); logo.src = 'icons/icon-192.png'; logo.alt = '';
    card.append(logo, el('b', '', T('مسلم تو دو')), el('span', '', T('صدقة جارية: مجاني بالكامل، دون إعلانات ودون جمع بيانات.')));
    box.append(card);
    const host = el('div', 'st-list st-pad');
    if (versionLine) { versionLine.hidden = false; host.append(versionLine); }
    box.append(host);
    const links = el('div', 'st-list');
    [['موقع التطبيق', 'https://micro4tricks-ai.github.io/muslim-todo-list/'], ['الكود المصدري على GitHub', 'https://github.com/micro4tricks-ai/muslim-todo-list']].forEach(([t, href]) => {
      const a = el('a', 'st-row'); a.href = href; a.target = '_blank'; a.rel = 'noopener';
      const txt = el('span', 'st-row-text'); txt.append(el('b', '', T(t)), el('small', '', href.replace('https://', '')));
      a.append(txt, icon('chevron', 'st-chev'));
      links.append(a);
    });
    box.append(links);
    if (shortcuts && !matchMedia('(pointer: coarse)').matches) { shortcuts.hidden = false; box.append(shortcuts); }
  }
  // ---- the welcome steps, the first time the app opens ----
  // The same pages as Settings, one after another, with "Next" at the bottom.
  const STEPS = ['welcome', 'lang', 'place', 'adhan', 'fonts'];
  const DONE = 'noon-onboarded', AT = 'noon-onboarding';
  let wiz = null; // { at }
  const store2 = (k, v) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (_) {} };
  const read2 = (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } };
  function wizard(at) {
    at = Math.max(0, Math.min(STEPS.length - 1, at || 0));
    if (page !== null) close();
    wiz = { at };
    root.hidden = false;
    document.body.classList.add('st-open');
    history.pushState({ st: STEPS[at] }, '');
    depth = 1;
    show(STEPS[at]);
  }
  function paintWizard(id) {
    const i = wiz ? STEPS.indexOf(id) : -1;
    root.classList.toggle('is-wizard', i >= 0);
    foot.hidden = i < 0;
    if (i < 0) return;
    wiz.at = i;
    dots.replaceChildren(...STEPS.map((_, k) => el('i', k === i ? 'on' : k < i ? 'done' : '')));
    next.textContent = T(i === STEPS.length - 1 ? 'ابدأ الاستخدام' : i === 0 ? 'لنبدأ' : 'التالي');
    barTitle.textContent = i === 0 ? T('أهلاً بك') : `${T(PAGES[id].title)} · ${I.num(i)}/${I.num(STEPS.length - 1)}`;
  }
  function nextStep() {
    if (!wiz) return;
    if (wiz.at >= STEPS.length - 1) { finishWizard(); return; }
    go(STEPS[wiz.at + 1]);
  }
  function keepStep() { if (wiz) store2(AT, String(wiz.at + 1)); }
  function markDone() { store2(DONE, '1'); store2(AT, null); }
  function finishWizard() {
    markDone();
    const d = depth;
    close();
    if (d > 0) history.go(-d);
    if (window.noonToday) window.noonToday.render();
  }
  function buildWelcome(box) {
    const hero = el('div', 'st-welcome');
    const logo = el('img', 'st-logo'); logo.src = 'icons/icon-192.png'; logo.alt = '';
    hero.append(logo, el('b', 'st-welcome-salam', 'السلام عليكم ورحمة الله'), el('h3', '', T('أهلاً بك في مسلم تو دو')),
      el('p', '', T('رفيقك اليومي حول الصلاة: مجاني بالكامل، دون إعلانات، صدقة جارية.')));
    const feats = el('div', 'st-feats');
    [['📖', 'المصحف بتسعة تفاسير'], ['🕌', 'الأذان في وقته'], ['📻', 'إذاعات القرآن والبث المباشر'], ['📿', 'الأذكار والأدعية'], ['📚', 'مكتبة الحديث'], ['✅', 'المهام والتركيز']]
      .forEach(([e, t]) => { const f = el('span', 'st-feat'); f.append(el('span', '', e), el('span', '', T(t))); feats.append(f); });
    box.append(hero, feats, el('p', 'st-note', T('نجهّز التطبيق معك في أقل من دقيقة: اللغة، ومدينتك، والأذان، والخط.')));
  }
  (() => {
    const resume = read2(AT);
    if (resume !== null) { setTimeout(() => wizard(Number(resume) || 0), 300); return; }
    if (read2(DONE) === '1') return;
    // Someone who has used the app already isn't shown the welcome.
    const used = ['noon-sweep-place', 'noon-sweep-look', 'noon-native-asked', 'noon-sweep-sync-meta', 'noon-sweep-listen', 'noon-sweep-library']
      .some((k) => read2(k) !== null);
    if (used) markDone(); else setTimeout(() => wizard(0), 700);
  })();

  window.noonSettings = {
    wizard: () => wizard(0), open, close: () => { if (page !== null) history.back(); } };
})();
