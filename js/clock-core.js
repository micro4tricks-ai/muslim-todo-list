// ---------- Clock: geometry and time rules (pure functions, no page) ----------
// Where the interactive slots sit on each face, how a long focus session splits into laps
// around the minute track, and how long until sunrise or sunset. Tested by tools/test_clock.mjs.
(function (root) {
  'use strict';
  const MAX_LAPS = 4;

  // Minutes in each 60-minute lap of a focus session (the minute track holds one hour).
  function focusLaps(start, end, now) {
    const total = (end - start) / 60000;
    if (!(total > 0)) return [];
    const done = Math.min(total, Math.max(0, (now - start) / 60000));
    const laps = [];
    for (let k = 0; k * 60 < total && k < MAX_LAPS; k++) {
      const len = Math.min(60, total - k * 60);
      laps.push({ lap: k, len, done: Math.min(len, Math.max(0, done - k * 60)) });
    }
    return laps;
  }

  // The next sunrise or sunset, in hours from now (today's sunrise stands in for tomorrow's).
  function sunCountdown(nowH, sunrise, sunset) {
    if (!Number.isFinite(nowH) || !Number.isFinite(sunrise) || !Number.isFinite(sunset)) return null;
    if (nowH < sunrise) return { kind: 'sunrise', inH: sunrise - nowH };
    if (nowH < sunset) return { kind: 'sunset', inH: sunset - nowH };
    return { kind: 'sunrise', inH: 24 - nowH + sunrise };
  }

  // Slot areas in CSS pixels. Classic: one band above the centre (where the next prayer was).
  // Modern: three round slots in a row below the time. Minimal: four round sub-dials at 12, 3, 6
  // and 9 o'clock, each showing what its owner chose (or nothing).
  function slotRects(face, CX, CY, R) {
    if (face === 'minimal') {
      const r = R * 0.2, d = R * 0.47;
      return [[0, -1], [1, 0], [0, 1], [-1, 0]].map(([dx, dy], i) => {
        const cx = CX + dx * d, cy = CY + dy * d;
        return { id: 'ABCD'[i], shape: 'circle', cx, cy, r, x: cx - r, y: cy - r, w: 2 * r, h: 2 * r };
      });
    }
    if (face === 'modern') {
      const r = R * 0.22, cy = CY + R * 0.42;
      return [-0.47, 0, 0.47].map((dx, i) => {
        const cx = CX + dx * R;
        return { id: 'ABC'[i], shape: 'circle', cx, cy, r, x: cx - r, y: cy - r, w: 2 * r, h: 2 * r };
      });
    }
    const w = R * 0.74, h = R * 0.36, x = CX - w / 2, y = CY - R * 0.56;
    return [{ id: 'A', shape: 'rect', x, y, w, h, cx: CX, cy: y + h / 2, r: h / 2 }];
  }

  function hitSlot(rects, x, y) {
    for (const s of rects) {
      if (s.shape === 'circle' ? Math.hypot(x - s.cx, y - s.cy) <= s.r : x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h) return s.id;
    }
    return null;
  }

  // The longest start of `text` that fits `maxW` with an ellipsis (measure: text → width).
  // A slot's text that cannot shrink any further is cut, never drawn into its neighbour.
  function ellipsize(text, maxW, measure) {
    text = String(text || '');
    if (!text || measure(text) <= maxW) return text;
    const chars = [...text];
    let lo = 0, hi = chars.length - 1, best = '';
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const cut = chars.slice(0, mid).join('').trimEnd() + '…';
      if (measure(cut) <= maxW) { best = cut; lo = mid + 1; } else hi = mid - 1;
    }
    return best;
  }

  // Two labels around a circle (angles in radians): when they are closer than `min` along the
  // short way round, both move apart from their midpoint until they are exactly `min` apart.
  function spreadLabels(a0, a1, min) {
    const TAU = Math.PI * 2;
    const gap = (((a1 - a0) % TAU) + TAU) % TAU;
    if (Math.min(gap, TAU - gap) >= min) return [a0, a1];
    if (gap <= Math.PI) { const mid = a0 + gap / 2; return [mid - min / 2, mid + min / 2]; }
    const mid = a0 - (TAU - gap) / 2;
    return [mid + min / 2, mid - min / 2];
  }

  // The eight compass points, for the qibla's direction in words.
  const POINTS = ['شمال', 'شمال شرق', 'شرق', 'جنوب شرق', 'جنوب', 'جنوب غرب', 'غرب', 'شمال غرب'];

  // 0 = north … 7 = north-west.
  const compassPoint = (deg) => Math.round((((deg % 360) + 360) % 360) / 45) % 8;

  root.noonClockCore = { focusLaps, sunCountdown, slotRects, hitSlot, compassPoint, ellipsize, spreadLabels, POINTS };
})(typeof window !== 'undefined' ? window : globalThis);
