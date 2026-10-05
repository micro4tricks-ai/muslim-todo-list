// Tests for the reminder rules (js/reminders-core.js): when a reminder rings, repeats, snoozes and
// is done. Run: node --test tools/test_reminders.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

await import('../js/reminders-core.js');
const R = globalThis.noonRemindCore;

const at = (y, m, d, h, min = 0) => new Date(y, m - 1, d, h, min).getTime();
const MIN = 60000;

test('quick choices: half an hour, an hour, tonight at 9, tomorrow at 8', () => {
  const now = at(2026, 10, 5, 14, 10);
  const q = Object.fromEntries(R.quickTimes(now).map((c) => [c.id, c.at]));
  assert.equal(q.m30, now + 30 * MIN);
  assert.equal(q.h1, now + 60 * MIN);
  assert.equal(q.tonight, at(2026, 10, 5, 21));
  assert.equal(q.morning, at(2026, 10, 6, 8));
});

test('"tonight" is left out once it is nearly 9 pm', () => {
  const ids = R.quickTimes(at(2026, 10, 5, 20, 50)).map((c) => c.id);
  assert.ok(!ids.includes('tonight'));
});

test('"after the next prayer" is a quarter of an hour after it, when the prayer time is known', () => {
  const prayer = at(2026, 10, 5, 15, 20);
  const q = R.quickTimes(at(2026, 10, 5, 14, 10), prayer).find((c) => c.id === 'prayer');
  assert.equal(q.at, prayer + 15 * MIN);
  assert.ok(!R.quickTimes(at(2026, 10, 5, 14, 10)).some((c) => c.id === 'prayer'));
});

test('a one-time reminder rings once, inside the window asked for', () => {
  const r = { id: 'a', at: at(2026, 10, 5, 21), repeat: 'none' };
  assert.deepEqual(R.occurrences(r, at(2026, 10, 5, 0), at(2026, 10, 7, 0)), [r.at]);
  assert.deepEqual(R.occurrences(r, at(2026, 10, 6, 0), at(2026, 10, 7, 0)), []);
  assert.deepEqual(R.occurrences({ ...r, done: true }, at(2026, 10, 5, 0), at(2026, 10, 7, 0)), []);
});

test('a daily reminder rings at the same clock time each day', () => {
  const r = { id: 'd', at: at(2026, 10, 5, 7, 30), repeat: 'daily' };
  assert.deepEqual(R.occurrences(r, at(2026, 10, 6, 0), at(2026, 10, 8, 23)),
    [at(2026, 10, 6, 7, 30), at(2026, 10, 7, 7, 30), at(2026, 10, 8, 7, 30)]);
});

test('a weekly reminder rings on the same weekday', () => {
  const r = { id: 'w', at: at(2026, 10, 9, 10), repeat: 'weekly' }; // a Friday
  assert.deepEqual(R.occurrences(r, at(2026, 10, 1, 0), at(2026, 10, 31, 0)),
    [at(2026, 10, 9, 10), at(2026, 10, 16, 10), at(2026, 10, 23, 10), at(2026, 10, 30, 10)]);
});

test('due now: rang in the last half hour and not announced yet on this device', () => {
  const now = at(2026, 10, 5, 21, 5);
  const items = [
    { id: 'a', at: at(2026, 10, 5, 21), repeat: 'none' },
    { id: 'b', at: at(2026, 10, 5, 20), repeat: 'none' }, // over an hour ago: missed, not shown late
    { id: 'c', at: at(2026, 10, 5, 22), repeat: 'none' } // later
  ];
  const due = R.dueNow(items, now, {});
  assert.deepEqual(due.map((d) => d.r.id), ['a']);
  assert.equal(due[0].key, `a@${at(2026, 10, 5, 21)}`);
  assert.deepEqual(R.dueNow(items, now, { [due[0].key]: now }), []);
});

test('a one-time reminder is done once it has rung; a repeating one stays', () => {
  const one = R.afterRing({ id: 'a', at: 5, repeat: 'none' }, 5);
  assert.equal(one.done, true);
  const daily = R.afterRing({ id: 'd', at: 5, repeat: 'daily' }, 5);
  assert.ok(!daily.done);
});

test('snooze: rings again ten minutes later, also for a repeating reminder', () => {
  const now = at(2026, 10, 5, 21, 1);
  const one = R.snooze({ id: 'a', at: at(2026, 10, 5, 21), repeat: 'none', done: true }, now);
  assert.equal(one.done, false);
  assert.deepEqual(R.occurrences(one, now, now + 864e5), [now + 10 * MIN]);
  const daily = R.snooze({ id: 'd', at: at(2026, 10, 5, 21), repeat: 'daily' }, now);
  assert.deepEqual(R.occurrences(daily, now, at(2026, 10, 6, 22)), [now + 10 * MIN, at(2026, 10, 6, 21)]);
  // Once the snoozed ring has gone off it is cleared.
  assert.equal(R.afterRing(daily, now + 10 * MIN).snooze, undefined);
});

test('a snoozed one-time reminder rings only at the new time, and is done after it', () => {
  const first = at(2026, 10, 5, 21);
  const now = first + MIN;
  const one = R.snooze(R.afterRing({ id: 'a', at: first, repeat: 'none' }, first), now);
  const later = now + 10 * MIN;
  // Another device that never announced the first ring must not show it again.
  assert.deepEqual(R.dueNow([one], later, {}).map((d) => d.t), [later]);
  const after = R.afterRing(one, later);
  assert.equal(after.done, true);
  assert.deepEqual(R.occurrences(after, first - MIN, later + 864e5), []);
});

test('next ring: for the badge on the item', () => {
  const now = at(2026, 10, 5, 22);
  assert.equal(R.nextAt({ id: 'd', at: at(2026, 10, 5, 21), repeat: 'daily' }, now), at(2026, 10, 6, 21));
  assert.equal(R.nextAt({ id: 'a', at: at(2026, 10, 5, 21), repeat: 'none' }, now), null);
});

test('done one-time reminders are dropped after a week', () => {
  const now = at(2026, 10, 20, 12);
  const kept = R.prune([
    { id: 'old', at: at(2026, 10, 5, 21), repeat: 'none', done: true },
    { id: 'recent', at: at(2026, 10, 18, 21), repeat: 'none', done: true },
    { id: 'daily', at: at(2026, 10, 1, 7), repeat: 'daily' }
  ], now);
  assert.deepEqual(kept.map((r) => r.id), ['recent', 'daily']);
});

test('a one-time reminder missed while the app was closed is dropped after a week too', () => {
  const now = at(2026, 10, 20, 12);
  const kept = R.prune([
    { id: 'missed', at: at(2026, 10, 5, 21), repeat: 'none' },
    { id: 'coming', at: at(2026, 10, 21, 9), repeat: 'none' }
  ], now);
  assert.deepEqual(kept.map((r) => r.id), ['coming']);
});
