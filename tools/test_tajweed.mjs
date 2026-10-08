// Tests for the tajweed rules read from the coloured Mushaf text (js/tajweed-core.js).
// Run: node --test tools/test_tajweed.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

await import('../js/tajweed-core.js');
await import('../js/tajweed-rules.js');
const C = globalThis.noonTajweedCore;
const RULES = globalThis.NOON_TAJWEED_RULES;
const TAJ = JSON.parse(readFileSync(new URL('../quran/tajweed.json', import.meta.url), 'utf8'));

test('a plain mark gives its letters and where they are', () => {
  const p = C.parse('بِسْمِ [h:1[ٱ]للَّهِ');
  assert.equal(p.plain, 'بِسْمِ ٱللَّهِ');
  assert.deepEqual(p.marks, [{ code: 'h', start: 7, end: 8 }]);
});

test('a mark inside another keeps both, and no bracket is left in the text', () => {
  const p = C.parse('قَالُ[o[ُوٓ[s[اْ]] رَبَّنَا');
  assert.equal(p.plain, 'قَالُُوٓاْ رَبَّنَا');
  assert.deepEqual(p.marks, [{ code: 'o', start: 5, end: 10 }, { code: 's', start: 8, end: 10 }]);
  const segs = C.segments('قَالُ[o[ُوٓ[s[اْ]] رَبَّنَا');
  assert.equal(segs.map((s) => s.text).join(''), p.plain);
  assert.deepEqual(segs.map((s) => [s.code, s.m]), [[null, []], ['o', [0]], ['s', [0, 1]], [null, []]]);
});

test('a rule that reaches the next word names both words', () => {
  const r = C.rules('مِ[f:18[ن ق]َبْلِكَ وَبِ');
  assert.deepEqual(r, [{ code: 'f', items: [{ word: 'مِن قَبْلِكَ', ks: [0] }] }]);
});

test('the same word twice under one rule is listed once', () => {
  const r = C.rules('[q[ق]َدْ [q[ق]َدْ');
  assert.equal(r.length, 1);
  assert.deepEqual(r[0].items, [{ word: 'قَدْ', ks: [0, 1] }]);
});

test('an unclosed or stray bracket does not break the verse', () => {
  assert.equal(C.parse('أَ]بَ').plain, 'أَ]بَ');
  assert.equal(C.parse('[n[ا').plain, 'ا');
});

test('every one of the 6236 verses parses, and every rule points at letters in the verse', () => {
  assert.equal(TAJ.length, 6236);
  let count = 0;
  TAJ.forEach((t, i) => {
    const p = C.parse(t);
    assert.ok(!/\[[a-z](?::\d+)?\[/.test(p.plain) && !/[[\]]/.test(p.plain), `verse ${i} keeps a mark`);
    for (const m of p.marks) {
      assert.ok(m.start < m.end && m.end <= p.plain.length, `verse ${i}: empty or outside mark`);
      assert.ok(p.plain.slice(m.start, m.end).trim(), `verse ${i}: mark on spaces only`);
      assert.ok(RULES[m.code], `verse ${i}: unknown rule ${m.code}`);
      count++;
    }
    assert.equal(C.segments(t).map((s) => s.text).join(''), p.plain, `verse ${i}: segments lose text`);
    for (const g of C.rules(t)) for (const it of g.items) assert.ok(p.plain.includes(it.word), `verse ${i}: word not in verse`);
  });
  assert.ok(count > 59000, `only ${count} rules`);
});

test('every rule has a name and a short explanation in Arabic and English', () => {
  for (const [k, r] of Object.entries(RULES)) {
    for (const f of ['ar', 'en', 'defAr', 'defEn']) assert.ok(r[f] && r[f].length > 2, `${k}.${f}`);
  }
});
