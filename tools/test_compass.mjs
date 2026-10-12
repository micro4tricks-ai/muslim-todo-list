// Tests for the compass's rules (js/compass-core.js). Run: node --test tools/test_compass.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

await import('../js/wmm-data.js');
await import('../js/compass-core.js');
const C = globalThis.noonCompassCore, W = globalThis.NOON_WMM;

test('the declination matches all of NOAA\'s official WMM2025 test values', () => {
  const rows = readFileSync(new URL('./wmm_testvalues.txt', import.meta.url), 'utf8').split('\n')
    .filter((l) => l.trim() && !l.startsWith('#')).map((l) => l.trim().split(/\s+/).map(Number));
  assert.ok(rows.length >= 100, `${rows.length} rows`);
  for (const [year, alt, lat, lon, decl] of rows) {
    const d = C.declination(lat, lon, year, W, alt);
    assert.ok(Math.abs(d - decl) <= 0.01, `${year} ${alt}km ${lat},${lon}: ${d.toFixed(3)} not ${decl}`);
  }
});

test('a date becomes a decimal year', () => {
  assert.equal(C.decimalYear(new Date(Date.UTC(2025, 0, 1))), 2025);
  assert.ok(Math.abs(C.decimalYear(new Date(Date.UTC(2026, 6, 2, 12))) - 2026.5) < 0.002);
});

test('true heading is the magnetic heading plus the declination, kept within 0–360', () => {
  assert.equal(C.trueHeading(350, 15), 5);
  assert.equal(C.trueHeading(10, -15), 355);
  assert.equal(C.trueHeading(90, 0), 90);
});

test('smoothing goes the short way round north', () => {
  const s = C.smoother(0.5);
  s.push(350, 0);
  const v = s.push(10, 100);
  assert.ok(v > 350 || v < 10, `went the long way: ${v}`); // moved toward 10 through 0, never through 180
});

test('smoothing settles on a steady reading', () => {
  const s = C.smoother(0.3);
  let v;
  for (let t = 0; t < 2000; t += 33) v = s.push(120, t);
  assert.ok(Math.abs(v - 120) < 0.5, String(v));
});

test('a single wild reading is ignored, a lasting turn is followed', () => {
  const s = C.smoother(0.3);
  for (let t = 0; t < 1000; t += 33) s.push(40, t);
  const spike = s.push(220, 1033);
  assert.ok(Math.abs(spike - 40) < 3, `jumped to ${spike}`);
  let v;
  for (let t = 1066; t < 2600; t += 33) v = s.push(220, t);
  assert.ok(Math.abs(v - 220) < 2, `did not follow: ${v}`);
});

test('steady readings are good, scattered ones ask for calibration', () => {
  const calm = C.jitter([100, 101, 99, 100, 102, 100, 99, 101]);
  const wild = C.jitter([100, 140, 70, 120, 60, 150, 90, 130]);
  assert.ok(calm < 3, String(calm));
  assert.ok(wild > 15, String(wild));
  assert.ok(C.jitter([359, 1, 0, 358, 2]) < 3); // spread around north is still steady
});

test('the needle points at the qibla when the phone does', () => {
  assert.equal(C.offset(135, 135), 0);
  assert.equal(C.offset(135, 125), 10); // turn right 10°
  assert.equal(C.offset(5, 355), 10);
  assert.equal(C.offset(355, 5), -10);
});
