// ---------- Page-turning Mushaf: page arithmetic and the no-cut rules (pure functions, no page) ----------
// Pages follow the Madinah Mushaf split (NOON_QURAN_META.pages: the first verse of each page).
// An open Mushaf shows the odd page on the right and the even one on the left, and the next page
// lies to the left, so dragging a page to the right turns forward. A page is drawn at the largest
// text size that fits it whole; when the reader zooms past that, the page scrolls by whole lines.
// Tested by tools/test_mushaf.mjs.
(function (root) {
  'use strict';

  // [first, end) verse indexes of a 1-based page.
  function pageRange(pages, total, p) {
    return [pages[p - 1], p < pages.length ? pages[p] : total];
  }

  // [right, left] pages of the spread that holds p.
  function spread(p, total) {
    const right = p % 2 ? p : p - 1;
    return [right, Math.min(total, right + 1)];
  }

  // The page after turning once (dir +1 forward, -1 back), a page or a spread at a time.
  function step(p, dir, two, total) {
    if (!two) return Math.min(total, Math.max(1, p + dir));
    const right = spread(p, total)[0] + 2 * dir;
    return right < 1 || right > total ? spread(p, total)[0] : right;
  }

  // +1 forward, -1 back, 0 stay: from how far the page was dragged (dx, px) across a page of width w.
  // speed: px per ms at release; a quick flick turns even when short.
  function swipeDir(dx, w, speed, dir) {
    const far = Math.abs(dx) > w * 0.22 || (Math.abs(dx) > 24 && (speed || 0) > 0.5);
    if (!far) return 0;
    const sign = dx > 0 ? 1 : -1;
    return dir === 'ltr' ? -sign : sign;
  }

  // The largest size (to half a pixel) for which fits(size) holds, between lo and hi.
  function fitSize(fits, lo, hi) {
    if (fits(hi)) return hi;
    if (!fits(lo)) return lo;
    let a = lo, b = hi; // fits(a), not fits(b)
    while (b - a > 0.5) { const m = Math.round((a + b)) / 2; if (fits(m)) a = m; else b = m; }
    return a;
  }

  // The tallest box of whole lines that fits in avail px.
  const wholeLines = (avail, lineH) => Math.max(1, Math.floor(avail / lineH)) * lineH;

  // How far to scroll (px, negative = up) so that the line cut by the top edge shows whole:
  // back to its start if at least half of it shows, or on to the next line.
  function cutDelta(lines, viewTop) {
    const cut = lines.find((l) => l.top < viewTop - 1 && l.bottom > viewTop + 1);
    if (!cut) return 0;
    return cut.bottom - viewTop >= (cut.bottom - cut.top) / 2 ? cut.top - viewTop : cut.bottom - viewTop;
  }

  const edges = (top, height, view) => ({ above: top > 1, below: top + view < height - 1 });

  root.noonMushafCore = { pageRange, spread, step, swipeDir, fitSize, wholeLines, cutDelta, edges };
})(typeof window !== 'undefined' ? window : globalThis);
