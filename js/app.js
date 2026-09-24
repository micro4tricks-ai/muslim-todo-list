// ---------- Installable app: offline copy, "Install the app" button, home-screen shortcuts ----------
(() => {
  'use strict';
  const { I } = window.noonUI;
  const $ = (id) => document.getElementById(id);
  const native = !!window.noonNative;
  const standalone = native || matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  if (standalone) document.documentElement.classList.add('is-app');

  // Offline copy of the page (the Android app already carries its files).
  if (!native && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
  }

  // Install button: the browser's own prompt where there is one (Chrome, Edge, Android),
  // otherwise a page with the steps for each phone.
  const btn = $('installBtn');
  let deferred = null;
  const guide = () => { location.href = 'install.html' + (I.isEn ? '?lang=en' : ''); };
  addEventListener('beforeinstallprompt', (ev) => { ev.preventDefault(); deferred = ev; });
  addEventListener('appinstalled', () => { btn.hidden = true; deferred = null; });
  if (!standalone) {
    btn.hidden = false;
    btn.addEventListener('click', async () => {
      if (!deferred) { guide(); return; }
      deferred.prompt();
      try { await deferred.userChoice; } catch (_) {}
      deferred = null;
    });
  }

  // Home-screen shortcuts: ?view=adhkar opens a section, ?focus=1 opens focus mode.
  const p = new URLSearchParams(location.search);
  const view = p.get('view');
  if (view && document.querySelector(`.views [data-view="${CSS.escape(view)}"]`)) window.noonUI.show(view);
  if (p.get('focus') === '1' && window.noonFocusMode) setTimeout(() => window.noonFocusMode.open(), 300);
  if (view || p.has('focus')) {
    p.delete('view'); p.delete('focus');
    const q = p.toString();
    history.replaceState(null, '', location.pathname + (q ? '?' + q : '') + location.hash);
  }
})();
