// Tests for the clock's pure rules (js/clock-core.js). Run: node --test tools/test_clock.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

await import('../js/clock-core.js');
const C = globalThis.noonClockCore;
const MIN = 60000;

test('a 20-minute session is one lap, part done', () => {
  assert.deepEqual(C.focusLaps(0, 20 * MIN, 5 * MIN), [{ lap: 0, len: 20, done: 5 }]);
});

test('a 90-minute session fills the outer lap and continues on a second one', () => {
  assert.deepEqual(C.focusLaps(0, 90 * MIN, 70 * MIN), [{ lap: 0, len: 60, done: 60 }, { lap: 1, len: 30, done: 10 }]);
});

test('laps are capped at four and a broken session draws nothing', () => {
  assert.equal(C.focusLaps(0, 600 * MIN, 0).length, 4);
  assert.deepEqual(C.focusLaps(10, 10, 10), []);
  assert.deepEqual(C.focusLaps(10, 5, 10), []);
});

test('sun countdown: sunrise before dawn, sunset by day, tomorrow\'s sunrise at night', () => {
  assert.deepEqual(C.sunCountdown(4, 6, 18), { kind: 'sunrise', inH: 2 });
  assert.deepEqual(C.sunCountdown(15.5, 6, 18), { kind: 'sunset', inH: 2.5 });
  assert.deepEqual(C.sunCountdown(22, 6, 18), { kind: 'sunrise', inH: 8 });
  assert.equal(C.sunCountdown(12, NaN, 18), null);
});

test('slots: one on the classic face, three on the modern face, four on the minimal face', () => {
  assert.deepEqual(C.slotRects('classic', 100, 100, 100).map((s) => s.id), ['A']);
  assert.deepEqual(C.slotRects('modern', 100, 100, 100).map((s) => s.id), ['A', 'B', 'C']);
  assert.deepEqual(C.slotRects('minimal', 100, 100, 100).map((s) => s.id), ['A', 'B', 'C', 'D']);
});

test("the minimal face's four slots sit at 12, 3, 6 and 9 o'clock and do not touch", () => {
  const [top, right, bottom, left] = C.slotRects('minimal', 100, 100, 100);
  assert.ok(top.cy < 100 && Math.abs(top.cx - 100) < 1e-9);
  assert.ok(right.cx > 100 && Math.abs(right.cy - 100) < 1e-9);
  assert.ok(bottom.cy > 100 && Math.abs(bottom.cx - 100) < 1e-9);
  assert.ok(left.cx < 100 && Math.abs(left.cy - 100) < 1e-9);
  assert.ok(Math.hypot(top.cx - right.cx, top.cy - right.cy) > top.r + right.r);
  assert.equal(C.hitSlot(C.slotRects('minimal', 100, 100, 100), 100, 100), null); // the centre stays free for the hands
});

test('a tap inside a slot finds it, edges included; between slots finds none', () => {
  const classic = C.slotRects('classic', 100, 100, 100);
  const a = classic[0];
  assert.equal(C.hitSlot(classic, a.x, a.y), 'A');
  assert.equal(C.hitSlot(classic, a.x + a.w, a.y + a.h), 'A');
  assert.equal(C.hitSlot(classic, 100, 100), null);
  const modern = C.slotRects('modern', 100, 100, 100);
  const [m0, m1] = modern;
  assert.equal(C.hitSlot(modern, m1.cx, m1.cy), 'B');
  assert.equal(C.hitSlot(modern, m0.cx + m0.r, m0.cy), 'A');
  assert.equal(C.hitSlot(modern, (m0.cx + m0.r + m1.cx - m1.r) / 2, m0.cy), null);
});

test('compass point: eight sectors, north at both ends', () => {
  assert.deepEqual([0, 22, 23, 90, 135, 180, 270, 338, 359].map(C.compassPoint), [0, 0, 1, 2, 3, 4, 6, 0, 0]);
});

// Text that cannot shrink any further is cut with an ellipsis instead of spilling into the next slot.
const mono = (t) => t.length * 10; // a 10px-per-character measure
test('ellipsize: text that fits is kept, longer text is cut to fit with an ellipsis', () => {
  assert.equal(C.ellipsize('Fajr', 100, mono), 'Fajr');
  assert.equal(C.ellipsize('A long reminder title', 80, mono), 'A long…');
  assert.ok(mono(C.ellipsize('A long reminder title', 80, mono)) <= 80);
  assert.equal(C.ellipsize('abc', 5, mono), '');
  assert.equal(C.ellipsize('', 50, mono), '');
});
