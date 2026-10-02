// ---------- Phones and narrow windows: the bottom navigation and the "More" sheet ----------
// Five places at the thumb (home, Mushaf, Listen, adhkar, more) instead of the grid of ten tabs;
// "More" holds the other sections and tools. The sound bar appears only while a sound plays or
// when opened from here. Wide screens keep the tabs and show none of this (CSS).
(() => {
  'use strict';
  const { T, I, el, button, show, go } = window.noonUI;
  const SVG = {
    home: '<path d="M4 11l8-6.5 8 6.5V20h-5.5v-5.5h-5V20H4z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/>',
    more: '<g fill="currentColor"><circle cx="6" cy="6" r="1.9"/><circle cx="12" cy="6" r="1.9"/><circle cx="18" cy="6" r="1.9"/><circle cx="6" cy="12" r="1.9"/><circle cx="12" cy="12" r="1.9"/><circle cx="18" cy="12" r="1.9"/><circle cx="6" cy="18" r="1.9"/><circle cx="12" cy="18" r="1.9"/><circle cx="18" cy="18" r="1.9"/></g>',
    qibla: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M15.5 8.5l-2 5-5 2 2-5z" fill="currentColor"/>',
    sounds: '<path d="M4 13v-1a8 8 0 0 1 16 0v1M4 13h3v6H4zM17 13h3v6h-3z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
    focus: '<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="13" r="7.5"/><path d="M12 13V9M9.5 3h5"/></g>',
    gear: '<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 2.8l1.6 2.3 2.7-.6.6 2.7 2.3 1.6-1.2 2.5 1.2 2.5-2.3 1.6-.6 2.7-2.7-.6L12 21.2l-1.6-2.3-2.7.6-.6-2.7-2.3-1.6L6 12.7 4.8 10.2l2.3-1.6.6-2.7 2.7.6z"/><circle cx="12" cy="12" r="3"/></g>'
  };
  // A tab's own icon, copied from the tab bar, so both always match.
  const tabIcon = (view) => {
    const s = document.querySelector(`.views [data-view="${view}"] svg`);
    return s ? s.cloneNode(true) : null;
  };
  const svg = (name) => {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true');
    s.innerHTML = SVG[name];
    return s;
  };

  // ---- the bar ----
  const nav = el('nav', 'bnav');
  nav.setAttribute('aria-label', T('التنقل'));
  nav.dir = I.isEn ? 'ltr' : 'rtl';
  const ITEMS = [['home', 'الرئيسية'], ['quran', 'المصحف'], ['listen', 'استماع'], ['adhkar', 'الأذكار'], ['more', 'المزيد']];
  ITEMS.forEach(([id, label]) => {
    const b = button('bnav-item', '', () => pick(id));
    b.dataset.to = id;
    b.append(id === 'home' || id === 'more' ? svg(id) : tabIcon(id) || svg('more'), el('span', '', T(label)));
    nav.append(b);
  });
  document.body.append(nav);

  function mark(id) {
    nav.querySelectorAll('.bnav-item').forEach((b) => b.setAttribute('aria-current', String(b.dataset.to === id)));
  }
  function pick(id) {
    if (id === 'more') { openSheet(); return; }
    closeSheet();
    if (id === 'home') {
      show('tasks');
      scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      mark('home');
      return;
    }
    go(id);
  }
  const current = () => (window.noonUI.currentView ? window.noonUI.currentView() : 'tasks');
  const markCurrent = () => { const v = current(); mark(['quran', 'listen', 'adhkar'].includes(v) ? v : 'home'); };
  window.addEventListener('noon-view', markCurrent);
  markCurrent();

  // ---- the "More" sheet ----
  const veil = el('div', 'more-veil'); veil.hidden = true;
  const sheet = el('div', 'more'); sheet.hidden = true;
  sheet.dir = I.isEn ? 'ltr' : 'rtl';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-label', T('المزيد'));
  const grid = el('div', 'more-grid');
  const SECTIONS = [['tasks', 'المهام'], ['library', 'المكتبة'], ['calendar', 'التقويم'], ['habits', 'عادات وصلواتي'], ['notes', 'ملاحظات'], ['cards', 'كروت'], ['report', 'تقرير']];
  SECTIONS.forEach(([view, label]) => {
    const b = button('more-item', '', () => { closeSheet(); go(view); mark('home'); });
    b.append(tabIcon(view) || svg('more'), el('span', '', T(label)));
    grid.append(b);
  });
  const tool = (icon, label, run) => { const b = button('more-item', '', () => { closeSheet(); run(); }); b.append(svg(icon), el('span', '', T(label))); grid.append(b); };
  tool('qibla', 'القبلة', () => { const q = document.getElementById('qiblaBtn'); if (q) q.click(); });
  tool('sounds', 'أصوات التركيز', () => openSounds());
  tool('focus', 'وضع التركيز', () => window.noonFocusMode && window.noonFocusMode.open());
  tool('gear', 'الإعدادات', () => window.noonSettings && window.noonSettings.open());
  const grab = el('span', 'more-grab');
  sheet.append(grab, el('h2', 'more-title', T('المزيد')), grid);
  document.body.append(veil, sheet);
  let sheetOpen = false;
  function openSheet() {
    sheetOpen = true;
    veil.hidden = sheet.hidden = false;
    document.body.classList.add('more-open');
    mark('more');
  }
  function closeSheet() {
    if (!sheetOpen) return;
    sheetOpen = false;
    veil.hidden = sheet.hidden = true;
    document.body.classList.remove('more-open');
    markCurrent();
  }
  veil.addEventListener('click', closeSheet);
  document.addEventListener('keydown', (ev) => { if (sheetOpen && ev.key === 'Escape') { ev.stopPropagation(); closeSheet(); } }, true);
  // The phone's back key closes the sheet first.
  const before = window.noonBack;
  window.noonBack = () => { if (sheetOpen) { closeSheet(); return true; } return before ? before() : false; };

  // ---- the sound bar: shown while a sound plays, or when opened from "More" ----
  function openSounds() {
    document.body.classList.add('dock-open');
    const t = document.getElementById('dockToggle');
    if (t && t.getAttribute('aria-expanded') !== 'true') t.click();
  }
  const toggle = document.getElementById('dockToggle');
  if (toggle) toggle.addEventListener('click', () => setTimeout(() => {
    if (toggle.getAttribute('aria-expanded') !== 'true') document.body.classList.remove('dock-open');
  }, 0));
})();
