// Tests for the page-turning Mushaf's rules (js/mushaf-core.js). Run: node --test tools/test_mushaf.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

await import('../js/mushaf-core.js');
const C = globalThis.noonMushafCore;
// Page starts as global verse indexes, like NOON_QURAN_META.pages (604 of them in the real data).
const PAGES = [0, 7, 12, 20];
const TOTAL = 30;

test('a page holds the verses from its start up to the next page', () => {
  assert.deepEqual(C.pageRange(PAGES, TOTAL, 1), [0, 7]);
  assert.deepEqual(C.pageRange(PAGES, TOTAL, 2), [7, 12]);
  assert.deepEqual(C.pageRange(PAGES, TOTAL, 4), [20, 30]);
});

test('an open Mushaf shows the odd page on the right and the even one on the left', () => {
  assert.deepEqual(C.spread(1, 604), [1, 2]);
  assert.deepEqual(C.spread(2, 604), [1, 2]);
  assert.deepEqual(C.spread(255, 604), [255, 256]);
  assert.deepEqual(C.spread(604, 604), [603, 604]);
});

test('turning moves a page at a time, or a spread at a time, and stops at both ends', () => {
  assert.equal(C.step(10, 1, false, 604), 11);
  assert.equal(C.step(10, -1, false, 604), 9);
  assert.equal(C.step(10, 1, true, 604), 11); // spread 9–10 → 11–12, shown from its right page
  assert.equal(C.step(11, -1, true, 604), 9);
  assert.equal(C.step(1, -1, false, 604), 1);
  assert.equal(C.step(604, 1, false, 604), 604);
  assert.equal(C.step(603, 1, true, 604), 603);
});

test('in an Arabic book, dragging the page to the right turns forward', () => {
  assert.equal(C.swipeDir(150, 400), 1);
  assert.equal(C.swipeDir(-150, 400), -1);
  assert.equal(C.swipeDir(40, 400), 0); // too short: the page falls back
  assert.equal(C.swipeDir(40, 400, 0.9), 1); // a quick flick still turns
  assert.equal(C.swipeDir(150, 400, 0, 'ltr'), -1); // an English page turns the other way
});

test('the text size is the largest that fits the whole page', () => {
  const fits = (px) => px * 20 <= 600; // 20 lines of px each in a 600px page
  assert.equal(C.fitSize(fits, 12, 48), 30);
  assert.equal(C.fitSize(() => true, 12, 48), 48);
  assert.equal(C.fitSize(() => false, 12, 48), 12); // nothing fits: the smallest, then the page scrolls
});

test('a zoomed page shows whole lines only', () => {
  assert.equal(C.wholeLines(700, 64), 640);
  assert.equal(C.wholeLines(40, 64), 64); // at least one line
});

test('scrolling settles so the top line is complete', () => {
  const lines = [{ top: 0, bottom: 60 }, { top: 60, bottom: 120 }, { top: 120, bottom: 180 }];
  assert.equal(C.cutDelta(lines, 60), 0); // already on a line start
  assert.equal(C.cutDelta(lines, 70), -10); // most of the line is showing: bring all of it in
  assert.equal(C.cutDelta(lines, 110), 10); // little of it is showing: move on to the next line
  assert.equal(C.cutDelta([], 50), 0);
});

test('the reader is told when there is more above or below', () => {
  assert.deepEqual(C.edges(0, 1000, 600), { above: false, below: true });
  assert.deepEqual(C.edges(400, 1000, 600), { above: true, below: false });
  assert.deepEqual(C.edges(0, 600, 600), { above: false, below: false });
});
