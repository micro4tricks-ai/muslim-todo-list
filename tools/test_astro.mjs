// Tests for the prayer times in js/astro.js: high latitudes and the time-zone offset of each date.
// Run: node --test tools/test_astro.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SRC = readFileSync(new URL('../js/astro.js', import.meta.url), 'utf8');

// astro.js is a browser script: run it in a fresh context with the DOM stubbed, the place saved.
function astro(place) {
  const dummy = new Proxy(function () {}, { get: (t, k) => (k === 'hidden' ? true : k === Symbol.toPrimitive ? () => '' : dummy), set: () => true, apply: () => dummy });
  const store = { 'noon-sweep-place': JSON.stringify(place) };
  const ctx = {
    Intl, Date, Math, JSON, Number, String, Object, Array, Proxy, CustomEvent: class {},
    setInterval() {}, setTimeout() {},
    document: { getElementById: () => dummy, createElement: () => dummy },
    localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } },
    navigator: {}
  };
  ctx.window = ctx;
  ctx.window.noonI18n = { t: (s) => s, num: String, tp: (a, s) => s, dur: (h, m) => `${h}:${m}`, days: String, isEn: false, hijriLocale: 'ar-SA-u-ca-islamic-umalqura', locale: 'ar' };
  ctx.dispatchEvent = () => {};
  vm.runInNewContext(SRC, ctx);
  return ctx.window.noonAstro;
}
const LONDON = { country: 'GB', city: 0, method: '', asr: 1, custom: null };
const MAKKAH = { country: 'SA', city: 0, method: '', asr: 1, custom: null };
const KEYS = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];

test('London at midsummer: Fajr and Isha are real times in the short night', () => {
  const s = astro(LONDON).snapshot(Date.UTC(2026, 5, 21, 11)); // noon BST
  const { fajr, sunrise, sunset, isha } = s.today;
  assert.ok(Number.isFinite(fajr) && Number.isFinite(isha), `fajr ${fajr}, isha ${isha}`);
  assert.ok(fajr > 0.5 && fajr < sunrise, `fajr ${fajr}`); // between ~00:30 and sunrise
  assert.ok(isha > sunset && isha < 24.5, `isha ${isha}`);
  // AngleBased: at most angle/60 of the night (sunset to sunrise) from sunrise and from sunset.
  const night = 24 - (sunset - sunrise);
  assert.ok(Math.abs(sunrise - fajr - (18 / 60) * night) < 1e-9);
  assert.ok(Math.abs(isha - sunset - (17 / 60) * night) < 1e-9);
});

test('London at midsummer, after Isha: the next prayer is a real time', () => {
  const s = astro(LONDON).snapshot(Date.UTC(2026, 5, 21, 23, 30)); // 00:30 BST on the 22nd
  assert.ok(Number.isFinite(s.next.h) && Number.isFinite(s.next.inH), JSON.stringify(s.next));
  const s2 = astro(LONDON).snapshot(Date.UTC(2026, 5, 21, 22, 50)); // 23:50 BST, after Isha
  assert.equal(s2.next.key, 'fajr');
  assert.ok(Number.isFinite(s2.next.inH) && s2.next.inH > 0 && s2.next.inH < 4, JSON.stringify(s2.next));
});

test('Makkah: the times are unchanged by the high-latitude rule', () => {
  // Recorded from the code before the change.
  const BEFORE = {
    '2026-06-21': [4.187463553484209, 5.654211943598394, 12.389516774334698, 15.704009571764832, 19.091483521174776, 20.591483521174776],
    '2026-12-21': [5.531641520571801, 6.893275891938616, 12.326267593895782, 15.37726904481665, 17.725868360025615, 19.225868360025615]
  };
  for (const [day, want] of Object.entries(BEFORE)) {
    const [y, m, d] = day.split('-').map(Number);
    const s = astro(MAKKAH).snapshot(Date.UTC(y, m - 1, d, 9));
    KEYS.forEach((k, i) => assert.ok(Math.abs(s.today[k] - want[i]) < 1e-9, `${day} ${k}: ${s.today[k]} vs ${want[i]}`));
  }
});

// The offset of each date is its own: tomorrow's Fajr after a clock change is in tomorrow's time.
for (const [label, eve, morning] of [
  ['spring forward (2026-03-29)', Date.UTC(2026, 2, 28, 22, 30), Date.UTC(2026, 2, 29, 2, 30)],
  ['fall back (2026-10-25)', Date.UTC(2026, 9, 24, 22, 30), Date.UTC(2026, 9, 25, 2, 30)]
]) {
  test(`London, ${label}: tomorrow's Fajr seen the night before matches the day itself`, () => {
    const A = astro(LONDON);
    const night = A.snapshot(eve), day = A.snapshot(morning);
    assert.equal(night.next.key, 'fajr');
    assert.ok(Math.abs(night.next.h - day.today.fajr) < 1e-9, `${night.next.h} vs ${day.today.fajr}`);
    // The wait is real hours: from the evening's instant to Fajr's instant.
    const fajrEpoch = morning - day.nowH * 3600e3 + day.today.fajr * 3600e3;
    assert.ok(Math.abs(night.next.inH - (fajrEpoch - eve) / 3600e3) < 1e-6, `${night.next.inH}`);
  });
}
