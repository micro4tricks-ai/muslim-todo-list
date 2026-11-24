// ---------- On a television: the remote's arrows move from button to button ----------
// A television has no touch and no mouse: only the remote's arrows, OK and Back. Here the arrows move
// the focus to the nearest button, link or field on screen in that direction, the one in focus is
// ringed so it shows from the sofa, and when there is nothing more that way the page scrolls on.
// OK presses the button in focus (the browser does that itself), and Back is the app's back key.
// It starts on a television only: the app says so (MainActivity → window.noonTvMode), and a TV's
// browser has no pointer at all. Keys a page handles itself (the Mushaf's arrows turn its pages)
// are left to it.
(() => {
  'use strict';
  let on = false;
  function start() {
    if (on) return;
    on = true;
    document.documentElement.classList.add('is-tv');
  }
  window.noonTvMode = (v) => { if (v) start(); };
  const ua = /\b(Android ?TV|GoogleTV|AFT\w*|BRAVIA|SMART-TV|SmartTV|Tizen|Web0S|webOS)\b/i.test(navigator.userAgent);
  if (ua || matchMedia('(pointer: none)').matches) start();

  const PICK = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';
  // On screen, and not under something else (a sheet or a reader over the page).
  function shownAt(n) {
    const r = n.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return null;
    const x = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2));
    const y = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2));
    if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return null;
    const top = document.elementFromPoint(x, y);
    if (!top) return null;
    const label = top.closest('label'); // a select's or a box's own label counts as the field
    return top === n || n.contains(top) || (label && label === n.closest('label')) ? r : null;
  }
  // The nearest in that direction: the distance along it, and twice the distance across it.
  function nearest(from, dir) {
    const f = from ? from.getBoundingClientRect() : { left: innerWidth, right: innerWidth, top: 0, bottom: 0 };
    const fx = (f.left + f.right) / 2, fy = (f.top + f.bottom) / 2;
    let best = null, score = Infinity;
    document.querySelectorAll(PICK).forEach((n) => {
      if (n === from) return;
      const r = shownAt(n);
      if (!r) return;
      const x = (r.left + r.right) / 2, y = (r.top + r.bottom) / 2;
      let along, across;
      if (dir === 'down') { if (r.top < f.bottom - 4 && y <= fy + 4) return; along = Math.max(0, r.top - f.bottom); across = Math.abs(x - fx); }
      else if (dir === 'up') { if (r.bottom > f.top + 4 && y >= fy - 4) return; along = Math.max(0, f.top - r.bottom); across = Math.abs(x - fx); }
      else if (dir === 'right') { if (r.left < f.right - 4 && x <= fx + 4) return; along = Math.max(0, r.left - f.right); across = Math.abs(y - fy); }
      else { if (r.right > f.left + 4 && x >= fx - 4) return; along = Math.max(0, f.left - r.right); across = Math.abs(y - fy); }
      const s = along + across * 2;
      if (s < score) { score = s; best = n; }
    });
    return best;
  }
  // What scrolls when there is nothing more that way: the box the focus is in, else the page.
  function scroller(n) {
    for (let p = n && n.parentElement; p && p !== document.body; p = p.parentElement) {
      const st = getComputedStyle(p);
      if (/(auto|scroll)/.test(st.overflowY) && p.scrollHeight > p.clientHeight + 4) return p;
    }
    return document.scrollingElement || document.documentElement;
  }
  const DIRS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
  document.addEventListener('keydown', (ev) => {
    if (!on || ev.defaultPrevented || ev.altKey || ev.ctrlKey || ev.metaKey) return;
    const dir = DIRS[ev.key];
    if (!dir) return;
    let a = document.activeElement;
    if (a === document.body || a === document.documentElement) a = null;
    // In a text field, left and right move in the text; on a slider they move the slider.
    if (a && (dir === 'left' || dir === 'right') && (a.matches('textarea, input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"])'))) return;
    const next = nearest(a, dir);
    if (next) {
      ev.preventDefault();
      next.focus({ preventScroll: true });
      next.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
      return;
    }
    if (dir === 'up' || dir === 'down') {
      ev.preventDefault();
      scroller(a).scrollBy({ top: (dir === 'down' ? 1 : -1) * innerHeight * 0.45, behavior: 'smooth' });
    }
  });
})();
