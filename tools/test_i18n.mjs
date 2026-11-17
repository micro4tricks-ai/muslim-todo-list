// Tests for the language helpers (js/i18n.js). Run: node --test tools/test_i18n.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// js/i18n.js expects a page; give it just enough of one, once for each language. For a language
// but Arabic it writes its dictionary's script tag into the page: that file is run here instead.
function load(lang) {
  const written = [];
  const store = { 'noon-sweep-lang': lang };
  const win = {};
  const ctx = {
    window: win,
    localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } },
    location: { search: '', pathname: '/', hash: '' },
    history: { replaceState() {} },
    document: {
      documentElement: { setAttribute() {}, lang: '', dir: '' }, addEventListener() {}, querySelectorAll: () => [],
      write: (h) => written.push(h), currentScript: null, readyState: 'complete', title: '', body: {},
      createTreeWalker: () => ({ nextNode: () => false })
    },
    NodeFilter: { SHOW_TEXT: 4 },
    addEventListener() {},
    URLSearchParams,
    Intl,
  };
  const src = readFileSync(new URL('../js/i18n.js', import.meta.url), 'utf8');
  new Function(...Object.keys(ctx), src)(...Object.values(ctx));
  const I = win.noonI18n;
  if (I.lang !== 'ar') {
    assert.match(written.join(''), new RegExp(`js/lang/${I.lang}\\.js`));
    const dict = readFileSync(new URL(`../js/lang/${I.lang}.js`, import.meta.url), 'utf8');
    new Function(...Object.keys(ctx), dict)(...Object.values(ctx));
  }
  return I;
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

test('an unknown language falls back to Arabic', () => {
  const I = load('xx');
  assert.equal(I.lang, 'ar');
  assert.equal(I.dir, 'rtl');
});

test('Urdu is written right to left, the others left to right', () => {
  const dirs = Object.fromEntries(['ar', 'en', 'ur', 'id', 'tr', 'es'].map((l) => [l, load(l).dir]));
  assert.deepEqual(dirs, { ar: 'rtl', en: 'ltr', ur: 'rtl', id: 'ltr', tr: 'ltr', es: 'ltr' });
  assert.equal(load('ur').latin, false);
  assert.equal(load('tr').latin, true);
});

test('days, percentages and Hijri years in each language', () => {
  assert.equal(load('es').days(1), '1 día');
  assert.equal(load('es').days(5), '5 días');
  assert.equal(load('tr').days(5), '5 gün');
  assert.equal(load('id').days(5), '5 hari');
  assert.equal(load('ur').days(5), '5 دن');
  assert.equal(load('ar').pct(50), '٥٠٪');
  assert.equal(load('tr').pct(50), '%50');
  assert.equal(load('es').pct(50), '50 %');
  assert.equal(load('en').pct(50), '50%');
  assert.equal(load('tr').hijriMonths[8], 'Ramazan');
  assert.equal(load('ur').ah, 'ھ');
});

test('a data item: Arabic, the language’s own text, then English; references by script', () => {
  const o = { ar: 'أذكار الصباح والمساء', en: 'Morning & evening' };
  assert.equal(load('ar').pick(o), o.ar);
  assert.equal(load('en').pick(o), o.en);
  assert.equal(load('tr').pick({ ...o, tr: 'Sabah ve akşam' }), 'Sabah ve akşam');
  const r = { refAr: 'صحيح البخاري ١', refEn: 'Sahih al-Bukhari 1' };
  assert.equal(load('ur').ref(r), r.refAr);
  assert.equal(load('id').ref(r), r.refEn);
});

test('every language has every phrase the English dictionary has', () => {
  const keys = (code) => Object.keys(load(code)._dict());
  const en = new Set(keys('en'));
  for (const code of ['ur', 'id', 'tr', 'es']) {
    const have = new Set(keys(code));
    const missing = [...en].filter((k) => !have.has(k));
    assert.equal(missing.length, 0, `${code} lacks ${missing.length}: ${missing.slice(0, 5).join(' | ')}`);
  }
});
