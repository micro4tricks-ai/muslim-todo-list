// ---------- Views: tabs in the task pane, shared toast, storage helpers ----------
// Loaded before the feature views (notes, cards, habits, adhkar, report).
(() => {
  'use strict';
  const I = window.noonI18n, T = I.t;
  const KEY = 'noon-sweep-view';
  const $ = (id) => document.getElementById(id);

  // ---- small shared helpers for the feature views ----
  const pad = (n) => String(n).padStart(2, '0');
  const dayKey = (t = Date.now()) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const addDays = (key, n) => { const [y, m, d] = key.split('-').map(Number); return dayKey(new Date(y, m - 1, d + n).getTime()); };
  // Saved (and synced) data never brings keys that would reshape the objects it is merged into.
  const SAFE = (k, v) => (k === '__proto__' || k === 'constructor' || k === 'prototype' ? undefined : v);
  function load(key, fallback) {
    try { const v = JSON.parse(localStorage.getItem(key), SAFE); return v && typeof v === 'object' ? v : fallback; } catch (_) { return fallback; }
  }
  function store(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* kept in memory */ }
  }
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }
  function button(cls, text, onClick, label) {
    const b = el('button', cls, text);
    b.type = 'button';
    if (label) b.setAttribute('aria-label', label);
    if (onClick) b.addEventListener('click', onClick);
    return b;
  }
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  // A light touch of vibration on the phone, the same everywhere; off in Settings › «سهولة الاستخدام».
  function buzz(pattern = 10) {
    try { if (localStorage.getItem('noon-haptics') === '0') return; } catch (_) {}
    if (navigator.vibrate) { try { navigator.vibrate(pattern); } catch (_) {} }
  }
  window.noonBuzz = buzz;
  // The controls that mark something done or move between screens answer with a tick.
  document.addEventListener('click', (ev) => {
    const b = ev.target.closest && ev.target.closest('.status, .habit-tick, .pr-state, .bnav-item, .more-item, .screen-back');
    if (b) buzz(b.matches('.status, .habit-tick') ? 15 : 8);
  }, true);
  // While something loads: grey lines in the shape of what is coming, and a short caption.
  function skeleton(label, rows = 3) {
    const box = el('div', 'skel');
    box.setAttribute('role', 'status');
    box.setAttribute('aria-busy', 'true');
    for (let i = 0; i < rows; i++) box.append(el('span', 'skel-line'));
    box.append(el('small', 'skel-cap', label));
    return box;
  }

  // Brief message at the top of the page, with an optional action button.
  function toast(msg, action) {
    const box = $('toasts');
    const t = el('div', 'toast');
    t.setAttribute('role', 'status');
    t.append(el('span', '', msg));
    if (action) t.append(button('toast-act', action.label, () => { action.run(); t.remove(); }));
    t.append(button('toast-x', '×', () => t.remove(), T('إغلاق')));
    box.append(t);
    setTimeout(() => t.remove(), action && action.sticky ? 60000 : 7000);
  }

  // When sync brings a newer copy of a key, the owning view reloads it.
  const listeners = {};
  window.addEventListener('noon-storage', (ev) => (listeners[ev.detail.key] || []).forEach((fn) => fn()));
  const onRemote = (key, fn) => { (listeners[key] = listeners[key] || []).push(fn); };

  window.noonUI = { T, I, $, el, button, load, store, dayKey, addDays, uid, toast, onRemote, skeleton };

  // ---- tabs ----
  const tabs = [...document.querySelectorAll('.views [data-view]')];
  let current = 'tasks';
  try { current = localStorage.getItem(KEY) || 'tasks'; } catch (_) {}
  if (!tabs.some((b) => b.dataset.view === current)) current = 'tasks';
  // ---- phones: each section is a screen of its own ----
  // On a narrow screen the home screen holds the clock, the day's cards and the tasks; every other
  // section opens as its own screen, from the top, with a bar to go back. The phone's back key and
  // the browser's back button return home (each screen is a step in the page's history). Wide
  // screens keep everything on one page with the tab bar.
  const PHONE = matchMedia('(max-width: 860px)');
  const screenOf = (view) => (PHONE.matches && view !== 'tasks' ? view : 'home');
  const bar = document.createElement('div');
  bar.className = 'screen-bar';
  bar.dir = I.isEn ? 'ltr' : 'rtl';
  const backBtn = document.createElement('button');
  backBtn.type = 'button';
  backBtn.className = 'screen-back';
  backBtn.setAttribute('aria-label', T('رجوع إلى الرئيسية'));
  backBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const barTitle = document.createElement('h2');
  barTitle.className = 'screen-title';
  bar.append(backBtn, barTitle);
  const host = document.querySelector('.todo');
  if (host) host.prepend(bar);
  const tabLabel = (view) => { const b = document.querySelector(`.views [data-view="${view}"] span`); return b ? b.textContent : ''; };
  function home() {
    // Back the way we came when the screen was a step in the history; otherwise straight home.
    if (history.state && history.state.screen) history.back();
    else show('tasks');
  }
  backBtn.addEventListener('click', home);
  let popping = false;
  function setScreen(view) {
    const screen = screenOf(view);
    document.body.dataset.screen = screen;
    document.documentElement.classList.toggle('in-screen', screen !== 'home'); // scroll targets stop under the title bar
    barTitle.textContent = screen === 'home' ? '' : tabLabel(view);
    if (popping || !PHONE.matches) return;
    const st = history.state;
    if (screen !== 'home') {
      if (st && st.screen === view) return;
      if (st && st.screen) history.replaceState({ screen: view }, '');
      else history.pushState({ screen: view }, '');
    }
  }
  addEventListener('popstate', (ev) => {
    const st = ev.state;
    // Only the page's own screen steps; the Mushaf, Settings and other panels keep their own.
    if (st && !st.screen) return;
    const want = st ? st.screen : 'tasks';
    if (want === current && document.body.dataset.screen === screenOf(want)) return;
    popping = true;
    try { show(want); } finally { popping = false; }
    if (PHONE.matches) scrollTo(0, 0);
  });
  // A rotation or a resized window across the line: home on the phone side.
  PHONE.addEventListener('change', () => setScreen(current));

  function show(view, focus) {
    current = view;
    try { localStorage.setItem(KEY, view); } catch (_) {}
    tabs.forEach((b) => {
      const on = b.dataset.view === view;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
      if (on && focus) b.focus();
    });
    document.querySelectorAll('.view').forEach((v) => { v.hidden = v.dataset.view !== view; });
    setScreen(view);
    window.dispatchEvent(new CustomEvent('noon-view', { detail: { view } }));
  }
  tabs.forEach((b) => b.addEventListener('click', () => show(b.dataset.view)));
  // Arrow keys move between tabs.
  document.querySelector('.views').addEventListener('keydown', (ev) => {
    const i = tabs.findIndex((b) => b.dataset.view === current);
    const dir = { ArrowRight: I.isEn ? 1 : -1, ArrowLeft: I.isEn ? -1 : 1, Home: -Infinity, End: Infinity }[ev.key];
    if (dir === undefined) return;
    ev.preventDefault();
    const n = Math.max(0, Math.min(tabs.length - 1, Number.isFinite(dir) ? (i + dir + tabs.length) % tabs.length : (dir < 0 ? 0 : tabs.length - 1)));
    show(tabs[n].dataset.view, true);
  });
  // Open a section and bring it on screen (from shortcuts, reminders and the quick bar).
  function go(view) {
    show(view);
    // A phone screen opens at its top.
    if (PHONE.matches) { scrollTo(0, 0); return; }
    // The tab bar when it shows; on phones it gives way to the bottom navigation, so the section itself.
    const nav = document.querySelector('.views');
    const target = nav && nav.offsetParent ? nav : $(`view-${view}`);
    if (!target) return;
    // A jump, then a check that it got there: on phones a smooth scroll was cut short by the section
    // filling in below the clock, and the page stayed where it was.
    target.scrollIntoView({ block: 'start' });
    [250, 800].forEach((ms) => setTimeout(() => {
      if (current === view && Math.abs(target.getBoundingClientRect().top) > 8) target.scrollIntoView({ block: 'start' });
    }, ms));
  }
  document.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-go]');
    if (b && !b.closest('.qr')) go(b.dataset.go);
  });
  window.noonUI.show = show;
  // The phone's back key (MainActivity in the app) asks here first: focus mode closes, and a screen
  // inside a tab (a book, a reciter) steps back. Settings and the Mushaf use the page's history instead.
  window.noonBack = () => {
    if (document.body.classList.contains('st-open') || document.body.classList.contains('qr-open')) return false;
    const fm = window.noonFocusMode;
    if (fm && fm.isOpen && fm.isOpen()) { fm.close(); return true; }
    const b = document.querySelector(`.view[data-view="${current}"]:not([hidden]) [data-back]`);
    if (b) { b.click(); return true; }
    return false;
  };
  window.noonUI.go = go;
  window.noonUI.currentView = () => current;
  window.noonUI.home = home;
  // Phones open on the home screen; wide screens on the section used last. A screen step left in the
  // history by a reload would make the first press of back do nothing, so it is cleared.
  if (history.state && history.state.screen) history.replaceState(null, '');
  show(PHONE.matches ? 'tasks' : current);
})();
