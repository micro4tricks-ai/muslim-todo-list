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

  // ---- version, and a check against the latest release ----
  // Only this button speaks for the app's updates: any other "security update" message
  // on the phone does not come from Muslim To-Do List.
  const VERSION = '1.5.1';
  const T = window.noonUI.T;
  const verEl = $('appVersion'), upBtn = $('checkUpdate'), upMsg = $('updateMsg');
  verEl.textContent = `${T('الإصدار')} ${I.num(VERSION)}`;
  const newer = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let k = 0; k < 3; k++) { if ((x[k] || 0) !== (y[k] || 0)) return (x[k] || 0) > (y[k] || 0); } return false; };
  upBtn.addEventListener('click', async () => {
    upMsg.textContent = T('جارٍ التحقق…');
    try {
      // version.json names the release whose APK the website serves (see the Website workflow).
      const r = await fetch(`https://micro4tricks-ai.github.io/muslim-todo-list/version.json?t=${Date.now()}`, { cache: 'no-store' });
      const tag = String((await r.json()).version || '');
      if (!tag) throw new Error('no tag');
      if (!newer(tag, VERSION)) { upMsg.textContent = T('أنت على آخر إصدار.'); return; }
      upMsg.replaceChildren(`${T('يوجد إصدار أحدث:')} ${I.num(tag)} `);
      const a = document.createElement('a');
      if (native) { a.href = 'https://micro4tricks-ai.github.io/muslim-todo-list/muslim-todo-list.apk'; a.textContent = T('تنزيل التحديث'); a.target = '_blank'; a.rel = 'noopener'; }
      else { a.href = location.pathname + location.search; a.textContent = T('إعادة فتح الصفحة'); }
      upMsg.append(a);
    } catch (_) { upMsg.textContent = T('تعذّر التحقق. تأكد من الاتصال بالإنترنت.'); }
  });

  // The language button in the quick bar under the clock.
  const quickLang = $('quickLang');
  if (quickLang) quickLang.addEventListener('click', () => I.setLang(I.isEn ? 'ar' : 'en'));

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
