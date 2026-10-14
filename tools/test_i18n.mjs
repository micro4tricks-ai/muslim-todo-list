// Tests for the language helpers (js/i18n.js). Run: node --test tools/test_i18n.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// js/i18n.js expects a page; give it just enough of one, once for each language.
function load(lang) {
  const store = { 'noon-sweep-lang': lang };
  const win = {};
  const ctx = {
    window: win,
    localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } },
    location: { search: '', pathname: '/', hash: '' },
    history: { replaceState() {} },
    document: { documentElement: { setAttribute() {}, lang: '', dir: '' }, addEventListener() {}, querySelectorAll: () => [], readyState: 'complete', title: '', body: {}, createTreeWalker: () => ({ nextNode: () => false }) },
    NodeFilter: { SHOW_TEXT: 4 },
    addEventListener() {},
    URLSearchParams,
    Intl,
  };
  const src = readFileSync(new URL('../js/i18n.js', import.meta.url), 'utf8');
  new Function(...Object.keys(ctx), src)(...Object.values(ctx));
  return win.noonI18n;
}

test('a number of days agrees with its noun in Arabic', () => {
  const I = load('ar');
  assert.equal(I.days(1), 'يوم واحد');
  assert.equal(I.days(2), 'يومان');
  assert.equal(I.days(3), '٣ أيام');
  assert.equal(I.days(10), '١٠ أيام');
  assert.equal(I.days(11), '١١ يوماً');
  assert.equal(I.days(30), '٣٠ يوماً');
  assert.equal(I.days(100), '١٠٠ يوم');
  assert.equal(I.days(103), '١٠٣ أيام');
  assert.equal(I.days(0), '٠ يوم');
});

test('and in English, day or days', () => {
  const I = load('en');
  assert.equal(I.days(1), '1 day');
  assert.equal(I.days(7), '7 days');
});

test('«ص» after a time is AM, and before a page number in a book is p.', () => {
  const I = load('en');
  assert.equal(I.t('ص'), 'AM');
  assert.equal(I.t('م'), 'PM');
  assert.equal(I.tp('page', 'ص'), 'p.');
  assert.equal(load('ar').tp('page', 'ص'), 'ص');
});
