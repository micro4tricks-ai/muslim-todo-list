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
  function load(key, fallback) {
    try { const v = JSON.parse(localStorage.getItem(key)); return v && typeof v === 'object' ? v : fallback; } catch (_) { return fallback; }
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

  window.noonUI = { T, I, $, el, button, load, store, dayKey, addDays, uid, toast, onRemote };

  // ---- tabs ----
  const tabs = [...document.querySelectorAll('.views [data-view]')];
  let current = 'tasks';
  try { current = localStorage.getItem(KEY) || 'tasks'; } catch (_) {}
  if (!tabs.some((b) => b.dataset.view === current)) current = 'tasks';
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
  window.noonUI.show = show;
  window.noonUI.currentView = () => current;
  show(current);
})();
