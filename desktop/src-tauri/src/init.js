// Runs in the app window before the website's own scripts. The website is unchanged; here its
// notifications become the system's, and links that leave it open in the default browser.
(function () {
  'use strict';
  if (window.__noonDesktop) return;
  window.__noonDesktop = true;
  var SITE = 'https://micro4tricks-ai.github.io/muslim-todo-list/';
  var tauri = function () { return window.__TAURI__ || null; };

  // The website's reminders and prayer times use the browser's Notification: shown by the system here.
  function notify(title, body) {
    var t = tauri();
    if (!t) return;
    var opts = { title: String(title || ''), body: body ? String(body) : undefined };
    try {
      if (t.notification && t.notification.sendNotification) t.notification.sendNotification(opts);
      else t.core.invoke('plugin:notification|notify', { options: opts });
    } catch (_) { /* no notification; the page shows its own card */ }
  }
  function DesktopNotification(title, options) {
    notify(title, options && options.body);
    this.title = title;
    this.close = function () {};
    this.addEventListener = function () {};
  }
  DesktopNotification.permission = 'granted';
  DesktopNotification.requestPermission = function (cb) { if (typeof cb === 'function') cb('granted'); return Promise.resolve('granted'); };
  try { Object.defineProperty(window, 'Notification', { value: DesktopNotification, configurable: true, writable: true }); } catch (_) {}

  // Links outside the website (and those meant for a new tab) open in the browser.
  function openOutside(href) {
    var t = tauri();
    if (!t) return false;
    try {
      if (t.opener && t.opener.openUrl) t.opener.openUrl(href);
      else t.core.invoke('plugin:opener|open_url', { url: href });
      return true;
    } catch (_) { return false; }
  }
  function leaves(u) { return /^(https?|mailto|tel):$/.test(u.protocol) && u.href.indexOf(SITE) !== 0; }
  document.addEventListener('click', function (ev) {
    var a = ev.target && ev.target.closest ? ev.target.closest('a[href]') : null;
    if (!a || a.hasAttribute('download')) return;
    var u;
    try { u = new URL(a.href, location.href); } catch (_) { return; }
    if (!leaves(u) && a.target !== '_blank') return;
    if (!leaves(u) && a.target === '_blank') { ev.preventDefault(); location.href = u.href; return; }
    if (openOutside(u.href)) ev.preventDefault();
  }, true);
  var open0 = window.open;
  window.open = function (url) {
    try {
      var u = new URL(url, location.href);
      if (leaves(u) && openOutside(u.href)) return null;
    } catch (_) {}
    return open0.apply(window, arguments);
  };

  // For the website's own checks (and its styles): this is the desktop app.
  // (This runs before the page exists, so the mark goes on once there is one.)
  var mark = function () { if (document.documentElement) document.documentElement.setAttribute('data-desktop', '1'); };
  if (document.documentElement) mark(); else document.addEventListener('DOMContentLoaded', mark);
})();
