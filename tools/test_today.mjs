// Tests for choosing and ordering the home screen's cards (js/today-core.js). Run: node --test tools/test_today.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

await import('../js/today-core.js');
const C = globalThis.noonTodayCore;

test('with nothing chosen, the cards shown before stay as they were', () => {
  const ids = C.visible({});
  assert.deepEqual(ids, ['prayer', 'ramadan', 'qibla', 'fast', 'quran', 'adhkar', 'hifz', 'remind', 'invite', 'listen']);
  assert.ok(C.arrange({}).some((c) => c.id === 'tasbih' && !c.on), 'the new cards are offered, switched off');
});

test('a card switched off is hidden, one switched on appears', () => {
  let cfg = C.toggle({}, 'qibla', false);
  cfg = C.toggle(cfg, 'tasbih', true);
  const ids = C.visible(cfg);
  assert.ok(!ids.includes('qibla'));
  assert.ok(ids.includes('tasbih'));
});

test('moving a card swaps it with its neighbour, and stops at both ends', () => {
  let cfg = C.move({}, 'quran', -1);
  assert.deepEqual(C.visible(cfg).slice(0, 5), ['prayer', 'ramadan', 'qibla', 'quran', 'fast']);
  cfg = C.move(cfg, 'prayer', -1);
  assert.equal(C.visible(cfg)[0], 'prayer');
  const all = C.arrange(cfg).map((c) => c.id);
  cfg = C.move(cfg, all[all.length - 1], 1);
  assert.deepEqual(C.arrange(cfg).map((c) => c.id), all);
});

test('moving among the shown cards skips the hidden ones in between', () => {
  let cfg = C.toggle({}, 'fast', false);
  cfg = C.move(cfg, 'quran', -1, true);
  assert.deepEqual(C.visible(cfg).slice(0, 4), ['prayer', 'ramadan', 'quran', 'qibla']);
});

test('the Ramadan card (2.6.0) joins a saved order after the prayer card, switched on', () => {
  // A saved order from 2.5 (every card but Ramadan), with the prayer card moved down.
  const cfg = { order: ['qibla', 'quran', 'prayer', 'fast', 'adhkar', 'hifz', 'remind', 'invite', 'listen', 'library', 'hadith', 'book', 'tasbih', 'khatma', 'radio'] };
  const ids = C.arrange(cfg).map((c) => c.id);
  assert.deepEqual(ids.slice(0, 5), ['qibla', 'quran', 'prayer', 'ramadan', 'fast']);
  assert.ok(C.visible(cfg).includes('ramadan'));
});

test('unknown or repeated cards in a saved order are dropped, new ones added in their place', () => {
  const cfg = { order: ['radio', 'nope', 'radio', 'prayer'], on: { radio: true } };
  const ids = C.arrange(cfg).map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(!ids.includes('nope'));
  assert.equal(ids[0], 'radio');
  assert.equal(ids.length, C.ALL.length);
});

test('the choices never change the saved object in place', () => {
  const cfg = { order: ['prayer', 'qibla'], on: {} };
  const copy = JSON.parse(JSON.stringify(cfg));
  C.move(cfg, 'qibla', -1); C.toggle(cfg, 'qibla', false);
  assert.deepEqual(cfg, copy);
});
