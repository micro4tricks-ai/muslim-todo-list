(() => {
  'use strict';

  // ---------- Timekeeping ----------
  // Real local time. Starts from the device clock, then corrects it against an
  // internet time server (if reachable) and re-syncs every 10 minutes.
  const TAU = Math.PI * 2;
  // Canvas text direction for the page language.
  const TEXT_DIR = window.noonI18n && window.noonI18n.isEn ? 'ltr' : 'rtl';
  const DEG = Math.PI / 180;
  const RESYNC_MS = 10 * 60 * 1000;
  let offsetMs = 0; // internet time minus device time

  // Monotonic epoch clock: anchored once to Date.now(), advanced by performance.now()
  // so the sweep never stutters when the system clock is adjusted.
  const EPOCH_ANCHOR = Date.now() - performance.now();
  const nowEpoch = (perfMs) => EPOCH_ANCHOR + perfMs + offsetMs;

  async function fetchWithTimeout(url, ms) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try {
      const res = await fetch(url, { cache: 'no-store', signal: ctrl.signal });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  const TIME_SOURCES = [
    ['https://worldtimeapi.org/api/timezone/Etc/UTC', (j) => Date.parse(j.utc_datetime)],
    ['https://timeapi.io/api/time/current/zone?timeZone=UTC', (j) => Date.parse(j.dateTime.replace(/Z?$/, 'Z'))]
  ];

  async function syncInternetTime() {
    for (const [url, parse] of TIME_SOURCES) {
      try {
        const t0 = performance.now();
        const json = await fetchWithTimeout(url, 4000);
        const t1 = performance.now();
        const serverMs = parse(json);
        if (!Number.isFinite(serverMs)) continue;
        // Server stamped roughly halfway through the round trip.
        offsetMs = serverMs - (EPOCH_ANCHOR + (t0 + t1) / 2);
        return;
      } catch (_) { /* try next source */ }
    }
    // Last resort online: the website's own server stamps its replies (to the second).
    // Skipped inside the Android app, whose pages are served by the phone itself.
    if (location.protocol !== 'https:' || location.hostname === 'localhost') return; // keep device time
    try {
      const t0 = performance.now();
      const r = await fetch(location.href.split('#')[0], { method: 'HEAD', cache: 'no-store' });
      const t1 = performance.now();
      const serverMs = Date.parse(r.headers.get('date'));
      // Only trust it when the device is clearly off: the header has one-second precision.
      const off = serverMs + 500 - (EPOCH_ANCHOR + (t0 + t1) / 2);
      if (Number.isFinite(off) && Math.abs(off) > 2000) offsetMs = off;
    } catch (_) { /* keep device time */ }
  }

  // Offset of the chosen city's wall clock from UTC (falls back to this device).
  const placeOffset = (epoch) => (window.noonAstro
    ? window.noonAstro.tzOffset(epoch)
    : -new Date(epoch).getTimezoneOffset() * 60000);

  // Angles in radians, 0 = 12 o'clock, clockwise positive. Continuous sweep.
  function handAngles(perfMs) {
    const epoch = nowEpoch(perfMs);
    const d = new Date(epoch + placeOffset(epoch));
    const s = d.getUTCSeconds() + d.getUTCMilliseconds() / 1000;
    const m = d.getUTCMinutes() + s / 60;
    const h = (d.getUTCHours() % 12) + m / 60;
    return {
      second: 6 * DEG * s,
      minute: 6 * DEG * m,
      hour:   30 * DEG * h
    };
  }

  syncInternetTime();
  setInterval(syncInternetTime, RESYNC_MS);

  // ---------- Looks: dial finishes and case metals ----------
  // Each dial sets its own ink, hand/index facet ranges, lume and second-hand accent.
  const DIALS = {
    ceramic:   { base: '#F4F4F0', finish: 'ceramic',  ink: '#2A2E35', soft: '#5B616A', faint: '#8A9097',
                 hand: [[20, 23, 28], [104, 111, 122]], index: [[26, 29, 34], [132, 139, 150]],
                 lume: '#F3F2E8', accent: '#C4492C', sub: '#ECEBE5', night: '#56607A' },
    navy:      { base: '#1E3A5F', finish: 'sunburst', ink: '#F1F4F8', soft: '#C5CFDC', faint: '#8FA0B6',
                 hand: [[122, 131, 144], [250, 251, 253]], index: [[128, 137, 150], [252, 253, 255]],
                 lume: '#E6F2DE', accent: '#E8683F', sub: '#172E4D', night: '#0E1C31' },
    emerald:   { base: '#1E4B39', finish: 'sunburst', ink: '#F2F1E8', soft: '#C9D6CC', faint: '#8FAA9A',
                 hand: [[150, 120, 60], [255, 236, 180]], index: [[150, 120, 60], [255, 238, 188]],
                 lume: '#EEF3DC', accent: '#E0B561', sub: '#173C2D', night: '#0D271C' },
    black:     { base: '#17191D', finish: 'sunburst', ink: '#F2F3F5', soft: '#BFC4CB', faint: '#7F868F',
                 hand: [[118, 124, 132], [248, 249, 250]], index: [[118, 124, 132], [250, 251, 252]],
                 lume: '#E2F3DA', accent: '#E8683F', sub: '#101215', night: '#2A3140' },
    salmon:    { base: '#E6B09A', finish: 'sunburst', ink: '#34261F', soft: '#5E4337', faint: '#8A6758',
                 hand: [[34, 28, 26], [120, 104, 98]], index: [[40, 32, 28], [140, 122, 114]],
                 lume: '#F7F3E6', accent: '#2D4C74', sub: '#DDA38A', night: '#6A4F46' },
    champagne: { base: '#E4D3AC', finish: 'sunburst', ink: '#3A3122', soft: '#65573F', faint: '#8F7F60',
                 hand: [[70, 52, 24], [200, 168, 104]], index: [[90, 68, 30], [236, 206, 140]],
                 lume: '#F7F4E6', accent: '#8E2F2F', sub: '#D9C699', night: '#5F5238' },
    ice:       { base: '#CFE2EE', finish: 'sunburst', ink: '#1C2B39', soft: '#3F5467', faint: '#6F8496',
                 hand: [[22, 34, 48], [110, 128, 146]], index: [[30, 44, 60], [140, 158, 176]],
                 lume: '#F4F7F2', accent: '#C4492C', sub: '#C3D8E6', night: '#3C5266' },
    sage:      { base: '#C9D6C3', finish: 'sunburst', ink: '#26332A', soft: '#4B5C4F', faint: '#7D8C80',
                 hand: [[30, 40, 34], [120, 135, 124]], index: [[36, 48, 40], [140, 156, 144]],
                 lume: '#F4F6EE', accent: '#B5543A', sub: '#BCCBB5', night: '#5B6B5F' },
    lavender:  { base: '#D9D2EA', finish: 'sunburst', ink: '#2C2640', soft: '#524A6B', faint: '#827A99',
                 hand: [[40, 34, 60], [130, 122, 160]], index: [[46, 40, 70], [150, 142, 180]],
                 lume: '#F6F4FA', accent: '#C4492C', sub: '#CDC4E2', night: '#5C5478' },
    sand:      { base: '#E8DCC4', finish: 'sunburst', ink: '#3A2F22', soft: '#66563F', faint: '#93826A',
                 hand: [[60, 46, 30], [150, 128, 100]], index: [[70, 54, 34], [170, 148, 116]],
                 lume: '#FAF6EC', accent: '#2F6E8E', sub: '#DDCFB3', night: '#6B5B44' },
    blush:     { base: '#F1D9D6', finish: 'sunburst', ink: '#3D2628', soft: '#6A4A4D', faint: '#977579',
                 hand: [[60, 36, 40], [150, 116, 120]], index: [[70, 42, 46], [170, 136, 140]],
                 lume: '#FFF7F5', accent: '#8E2F3F', sub: '#E8CBC7', night: '#6E4F53' }
  };
  const METALS = {
    steel: { ring: ['#F4F5F6', '#D2D5D8', '#9DA2A8', '#E6E8EA', '#FBFBFC', '#B3B7BC', '#8C9197', '#D9DCDF', '#F7F8F9', '#AEB3B8'],
             chamfer: ['#80868D', '#C3C7CB', '#FAFBFB'], cap: ['#FFFFFF', '#DDE0E3', '#8A9097', '#5E646B'] },
    gold:  { ring: ['#FFF3CB', '#E9C979', '#B58E3E', '#F2DA96', '#FFF8DC', '#CFA651', '#9A722E', '#E4C27B', '#FFF1C5', '#C79E4B'],
             chamfer: ['#94702E', '#D9B566', '#FFF4CF'], cap: ['#FFFBEA', '#F1D48E', '#B08A3E', '#7E5F22'] },
    rose:  { ring: ['#FCE6DC', '#E4AF99', '#B57A66', '#F0C7B6', '#FFEFE8', '#CF9A86', '#A06653', '#E7BAA8', '#FCE3D8', '#C8917F'],
             chamfer: ['#9A6352', '#D9A591', '#FFEDE5'], cap: ['#FFF5F0', '#EDBFAE', '#B07866', '#7D4F41'] },
    black: { ring: ['#5E636A', '#3B3F45', '#1D2025', '#4B5057', '#6C727A', '#2D3136', '#16181C', '#43474E', '#60656C', '#2A2D32'],
             chamfer: ['#15171A', '#3A3E44', '#6E747C'], cap: ['#9AA0A8', '#5C6168', '#2A2D32', '#15171A'] }
  };
  // The modern face's theme: background and accent from Appearance; text colours follow how light it is.
  function modernTheme(t) {
    t = t || { bg1: '#F4F6F7', bg2: '#DDE5E8', accent: '#0E9AA0' };
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(t.bg1.slice(i, i + 2), 16));
    const light = (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6;
    return Object.assign({ light }, t, light
      ? { ink: '#1E2530', soft: 'rgba(30,37,48,0.66)', faint: 'rgba(30,37,48,0.16)', slot: 'rgba(255,255,255,0.62)', edge: 'rgba(30,37,48,0.10)' }
      : { ink: '#FFFFFF', soft: 'rgba(255,255,255,0.72)', faint: 'rgba(255,255,255,0.16)', slot: 'rgba(255,255,255,0.08)', edge: 'rgba(255,255,255,0.10)' });
  }
  const look = () => {
    const l = window.noonLook ? window.noonLook.get() : {};
    const theme = modernTheme(l.theme);
    return { dial: DIALS[l.dial] || DIALS.ceramic, metal: METALS[l.metal] || METALS.steel,
      face: l.face || 'classic', theme, accent: theme.accent, slots: l.slots || { A: 'prayer' } };
  };
  let T = look();

  const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const shade = (hex, amt) => {
    const [r, g, b] = hexRgb(hex);
    const t = amt < 0 ? 0 : 255, k = Math.abs(amt);
    return `rgb(${Math.round(r + (t - r) * k)},${Math.round(g + (t - g) * k)},${Math.round(b + (t - b) * k)})`;
  };
  const rgba = (hex, a) => { const [r, g, b] = hexRgb(hex); return `rgba(${r},${g},${b},${a})`; };

  // ---------- Canvas setup ----------
  const pane = document.getElementById('clockPane');
  const canvas = document.getElementById('clock');
  const ctx = canvas.getContext('2d');
  let W, H, DPR, R, CX, CY, staticLayer, glassLayer;

  // Key light from the upper-left (unit vector pointing toward the light).
  const LIGHT = (() => { const x = -0.5, y = -0.86, m = Math.hypot(x, y); return { x: x / m, y: y / m }; })();
  const LIGHT_ANGLE = Math.atan2(LIGHT.y, LIGHT.x);

  function makeLayer() {
    const c = document.createElement('canvas');
    c.width = canvas.width;
    c.height = canvas.height;
    const g = c.getContext('2d');
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    return [c, g];
  }
  // Shadow offsets/blur ignore the transform matrix, so scale to device pixels.
  function setShadow(g, color, blur, ox, oy) {
    g.shadowColor = color;
    g.shadowBlur = blur * DPR;
    g.shadowOffsetX = ox * DPR;
    g.shadowOffsetY = oy * DPR;
  }
  function clearShadow(g) {
    g.shadowColor = 'transparent';
    g.shadowBlur = g.shadowOffsetX = g.shadowOffsetY = 0;
  }
  function circlePath(g, x, y, r) {
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
  }
  function roundRectPath(g, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  function mulberry32(a) {
    return () => {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function metalGradient(g, x0, y0, x1, y1, stops) {
    const gr = g.createLinearGradient(x0, y0, x1, y1);
    stops.forEach((c, i) => gr.addColorStop(i / (stops.length - 1), c));
    return gr;
  }
  // Shade a ridged (two-facet) surface given its rotation: returns [leftColor, rightColor].
  function facetShades(angle, dark, light) {
    const c = Math.cos(angle), s = Math.sin(angle);
    const shadeN = (nx, ny) => {
      const k = 0.5 + 0.5 * (nx * LIGHT.x + ny * LIGHT.y);
      const mix = (i) => Math.round(dark[i] + (light[i] - dark[i]) * k);
      return `rgb(${mix(0)},${mix(1)},${mix(2)})`;
    };
    return [shadeN(-c, -s), shadeN(c, s)];
  }

  // ---------- Static layer: case, crown, bezel, dial, track, indices, numerals ----------
  function buildStatic() {
    const [c, g] = makeLayer();
    const rand = mulberry32(1201);
    const RB = R * 1.15;
    const D = T.dial, M = T.metal;

    // Crown at 3 o'clock (drawn first so the case overlaps its stem)
    g.save();
    const cw = R * 0.075, chh = R * 0.17, cx0 = CX + RB - R * 0.02;
    setShadow(g, 'rgba(30,34,42,0.28)', R * 0.03, R * 0.006, R * 0.02);
    g.fillStyle = metalGradient(g, 0, CY - chh / 2, 0, CY + chh / 2, [M.ring[2], M.ring[4], M.ring[0], M.ring[6], M.ring[2]]);
    roundRectPath(g, cx0, CY - chh / 2, cw, chh, R * 0.015);
    g.fill();
    clearShadow(g);
    g.strokeStyle = 'rgba(0,0,0,0.22)';
    g.lineWidth = Math.max(0.6, R * 0.004);
    for (let y = CY - chh / 2 + R * 0.018; y < CY + chh / 2 - R * 0.01; y += R * 0.016) {
      g.beginPath(); g.moveTo(cx0 + R * 0.012, y); g.lineTo(cx0 + cw - R * 0.006, y); g.stroke();
    }
    g.restore();

    // Case shadows (ambient + contact)
    g.save();
    g.fillStyle = M.ring[5];
    circlePath(g, CX, CY, RB);
    setShadow(g, 'rgba(20,24,32,0.30)', R * 0.16, R * 0.03, R * 0.11); g.fill();
    setShadow(g, 'rgba(20,24,32,0.35)', R * 0.025, R * 0.004, R * 0.014); g.fill();
    g.restore();

    // Bezel: conic sheen (anisotropic reflection) + circular brushing
    let bz;
    if (g.createConicGradient) {
      bz = g.createConicGradient(-Math.PI / 2 - 0.35, CX, CY);
      M.ring.concat([M.ring[0]]).forEach((col, i, arr) => bz.addColorStop(i / (arr.length - 1), col));
    } else {
      bz = metalGradient(g, CX - RB, CY - RB, CX + RB, CY + RB, [M.ring[0], M.ring[5], M.ring[3]]);
    }
    g.fillStyle = bz;
    circlePath(g, CX, CY, RB);
    g.fill();
    g.lineWidth = 0.6;
    for (let r = R * 1.05; r < RB - R * 0.02; r += 0.55) {
      const a = rand() * 0.07;
      g.strokeStyle = rand() < 0.5 ? `rgba(255,255,255,${a})` : `rgba(20,24,30,${a * 0.6})`;
      circlePath(g, CX, CY, r);
      g.stroke();
    }
    // Polished outer rim
    g.strokeStyle = metalGradient(g, CX - RB, CY - RB, CX + RB, CY + RB, ['rgba(255,255,255,0.95)', 'rgba(160,165,172,0.4)', 'rgba(40,44,50,0.75)']);
    g.lineWidth = Math.max(1.2, R * 0.016);
    circlePath(g, CX, CY, RB - g.lineWidth / 2);
    g.stroke();
    // Polished inner step ring
    g.strokeStyle = metalGradient(g, CX - RB, CY - RB, CX + RB, CY + RB, ['rgba(40,44,50,0.55)', 'rgba(255,255,255,0.9)']);
    g.lineWidth = Math.max(1, R * 0.008);
    circlePath(g, CX, CY, R * 1.05);
    g.stroke();

    // Inner chamfer (slopes toward the dial: upper-left in shade, lower-right lit)
    g.fillStyle = metalGradient(g, CX - R, CY - R, CX + R, CY + R, M.chamfer);
    g.beginPath();
    g.arc(CX, CY, R * 1.045, 0, TAU);
    g.arc(CX, CY, R, 0, TAU, true);
    g.fill();

    if (T.face === 'modern') {
      const M = T.theme;
      g.save();
      circlePath(g, CX, CY, R);
      g.clip();
      const base = g.createRadialGradient(CX, CY - R * 0.5, 0, CX, CY, R * 1.05);
      base.addColorStop(0, M.bg1);
      base.addColorStop(1, M.bg2);
      g.fillStyle = base;
      g.fillRect(CX - R, CY - R, R * 2, R * 2);
      g.restore();
      // Minute ticks; every fifth is longer.
      g.strokeStyle = M.faint;
      g.lineCap = 'round';
      for (let i = 0; i < 60; i++) {
        const a = i * 6 * DEG - Math.PI / 2, long = i % 5 === 0;
        g.lineWidth = Math.max(1, R * (long ? 0.012 : 0.007));
        g.beginPath();
        g.moveTo(CX + Math.cos(a) * R * (long ? 0.9 : 0.925), CY + Math.sin(a) * R * (long ? 0.9 : 0.925));
        g.lineTo(CX + Math.cos(a) * R * 0.96, CY + Math.sin(a) * R * 0.96);
        g.stroke();
      }
      return c;
    }

    // ---- Dial ----
    g.save();
    circlePath(g, CX, CY, R);
    g.clip();
    const base = g.createRadialGradient(CX - R * 0.3, CY - R * 0.38, 0, CX, CY, R);
    base.addColorStop(0, shade(D.base, 0.1));
    base.addColorStop(0.6, D.base);
    base.addColorStop(1, shade(D.base, -0.08));
    g.fillStyle = base;
    g.fillRect(CX - R, CY - R, R * 2, R * 2);
    if (D.finish === 'sunburst' && g.createConicGradient) {
      // Radial brushing: a bow-tie highlight aligned with the light, plus fine rays.
      const sb = g.createConicGradient(0, CX, CY);
      const N = 180;
      for (let i = 0; i <= N; i++) {
        const th = (i / N) * TAU;
        const glow = Math.cos(2 * (th - LIGHT_ANGLE));
        const v = glow * 0.2 + (i % 2 ? 0.035 : -0.035);
        sb.addColorStop(i / N, v >= 0 ? `rgba(255,255,255,${v.toFixed(3)})` : `rgba(0,0,0,${(-v * 0.9).toFixed(3)})`);
      }
      g.fillStyle = sb;
      g.fillRect(CX - R, CY - R, R * 2, R * 2);
    }
    // Edge vignette where the dial curves under the rehaut
    const vg = g.createRadialGradient(CX, CY, R * 0.72, CX, CY, R);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, D.finish === 'ceramic' ? 'rgba(0,0,0,0.06)' : 'rgba(0,0,0,0.22)');
    g.fillStyle = vg;
    g.fillRect(CX - R, CY - R, R * 2, R * 2);
    // Bezel casting shadow onto the dial edge
    setShadow(g, 'rgba(10,14,20,0.40)', R * 0.035, R * 0.010, R * 0.016);
    g.strokeStyle = '#000';
    g.lineWidth = R * 0.4;
    circlePath(g, CX, CY, R * 1.2);
    g.stroke();
    clearShadow(g);
    g.restore();

    g.strokeStyle = 'rgba(20,24,30,0.4)';
    g.lineWidth = 0.8;
    circlePath(g, CX, CY, R);
    g.stroke();

    // Railway minute track
    g.strokeStyle = rgba(D.soft, 0.8);
    g.lineWidth = Math.max(0.6, R * 0.003);
    circlePath(g, CX, CY, R * 0.915); g.stroke();
    circlePath(g, CX, CY, R * 0.955); g.stroke();
    g.fillStyle = D.soft;
    const tw = Math.max(1, R * 0.006);
    for (let i = 0; i < 60; i++) {
      g.save();
      g.translate(CX, CY);
      g.rotate(i * 6 * DEG);
      if (i % 5 === 0) g.fillRect(-tw, -R * 0.955, tw * 2, R * 0.04);
      else if (T.face !== 'minimal') g.fillRect(-tw / 2, -R * 0.955, tw, R * 0.04);
      g.restore();
    }

    // Applied, faceted hour batons with lume inlay
    const iw = R * 0.038, ih = R * 0.1, iy = -R * 0.9;
    for (let i = 0; i < 12; i++) {
      const ang = i * 30 * DEG;
      const xs = i === 0 ? [-iw * 0.85, iw * 0.85] : [0];
      const [lc, rc] = facetShades(ang, D.index[0], D.index[1]);
      g.save();
      g.translate(CX, CY);
      g.rotate(ang);
      for (const x0 of xs) {
        const x = x0 - iw / 2;
        g.fillStyle = rc;
        roundRectPath(g, x, iy, iw, ih, iw * 0.2);
        setShadow(g, 'rgba(10,12,16,0.35)', R * 0.008, R * 0.004, R * 0.007);
        g.fill();
        clearShadow(g);
        g.save();
        roundRectPath(g, x, iy, iw, ih, iw * 0.2);
        g.clip();
        g.fillStyle = lc; g.fillRect(x, iy, iw / 2, ih);
        g.fillStyle = rc; g.fillRect(x + iw / 2, iy, iw / 2, ih);
        g.restore();
        // lume inlay
        g.fillStyle = D.lume;
        roundRectPath(g, x + iw * 0.28, iy + ih * 0.12, iw * 0.44, ih * 0.76, iw * 0.12);
        g.fill();
        g.strokeStyle = 'rgba(0,0,0,0.25)';
        g.lineWidth = 0.5;
        g.stroke();
      }
      g.restore();
    }

    // Printed numerals (not on the minimal face)
    if (T.face === 'minimal') return c;
    const numR = R * 0.7;
    g.font = `500 ${R * 0.115}px "IBM Plex Sans Arabic", "Helvetica Neue", "Segoe UI", Arial, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (let n = 1; n <= 12; n++) {
      const a = n * 30 * DEG;
      const x = CX + Math.sin(a) * numR;
      const y = CY - Math.cos(a) * numR + R * 0.006;
      g.fillStyle = D.finish === 'ceramic' ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.25)';
      g.fillText(String(n), x + R * 0.002, y + R * 0.003);
      g.fillStyle = D.ink;
      g.fillText(String(n), x, y);
    }
    return c;
  }

  // ---------- Glass layer: sapphire glare + reflections ----------
  function buildGlass() {
    const [c, g] = makeLayer();
    g.save();
    circlePath(g, CX, CY, R * 1.045);
    g.clip();
    const vig = g.createRadialGradient(CX, CY, R * 0.55, CX, CY, R * 1.045);
    vig.addColorStop(0, 'rgba(30,34,42,0)');
    vig.addColorStop(1, 'rgba(30,34,42,0.07)');
    g.fillStyle = vig;
    g.fillRect(CX - R * 1.1, CY - R * 1.1, R * 2.2, R * 2.2);
    g.save();
    g.translate(CX - R * 0.28, CY - R * 0.5);
    g.rotate(-32 * DEG);
    const gl = g.createLinearGradient(0, -R * 0.6, 0, R * 0.55);
    gl.addColorStop(0, 'rgba(255,255,255,0.42)');
    gl.addColorStop(0.45, 'rgba(255,255,255,0.12)');
    gl.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gl;
    g.beginPath();
    g.ellipse(0, 0, R * 1.05, R * 0.55, 0, 0, TAU);
    g.fill();
    g.restore();
    // Anti-reflective coating: a faint violet-blue cast on the shadow side
    const tint = g.createLinearGradient(CX - R, CY - R, CX + R, CY + R);
    tint.addColorStop(0.55, 'rgba(110,120,200,0)');
    tint.addColorStop(1, 'rgba(110,120,200,0.07)');
    g.fillStyle = tint;
    g.fillRect(CX - R * 1.1, CY - R * 1.1, R * 2.2, R * 2.2);
    g.restore();
    g.lineCap = 'round';
    const rim = (a0, a1, alpha, width, rr) => {
      const x0 = CX + Math.cos(a0) * rr, y0 = CY + Math.sin(a0) * rr;
      const x1 = CX + Math.cos(a1) * rr, y1 = CY + Math.sin(a1) * rr;
      const gr = g.createLinearGradient(x0, y0, x1, y1);
      gr.addColorStop(0, 'rgba(255,255,255,0)');
      gr.addColorStop(0.5, `rgba(255,255,255,${alpha})`);
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.strokeStyle = gr;
      g.lineWidth = width;
      g.beginPath();
      g.arc(CX, CY, rr, a0, a1);
      g.stroke();
    };
    rim(190 * DEG, 290 * DEG, 0.9, R * 0.009, R * 1.02);
    rim(15 * DEG, 75 * DEG, 0.45, R * 0.006, R * 1.02);
    return c;
  }

  // ---------- Hands ----------
  const HANDS = {
    hour:   { len: 0.53, tail: 0.1,  w: 0.064, elev: 0.012, hub: 0.07,  kind: 'sword' },
    minute: { len: 0.83, tail: 0.12, w: 0.048, elev: 0.021, hub: 0.056, kind: 'sword' },
    second: { len: 0.93, tail: 0.24, w: 0.011, elev: 0.03,  hub: 0.034, kind: 'needle' }
  };

  function handPath(h) {
    const len = h.len * R, tail = h.tail * R, w = h.w * R / 2;
    ctx.beginPath();
    if (h.kind === 'needle') {
      ctx.moveTo(-w, tail * 0.35);
      ctx.lineTo(-w * 0.55, -len);
      ctx.lineTo(w * 0.55, -len);
      ctx.lineTo(w, tail * 0.35);
      ctx.closePath();
      // round counterweight (same winding as the blade so nonzero fill unions them)
      const cy = tail * 0.72, cr = R * 0.03;
      ctx.moveTo(cr, cy);
      ctx.arc(0, cy, cr, 0, TAU);
    } else {
      // Sword: widest near the hub, long taper to a point.
      ctx.moveTo(-w * 0.55, tail);
      ctx.lineTo(-w, 0);
      ctx.lineTo(-w, -len * 0.74);
      ctx.lineTo(0, -len);
      ctx.lineTo(w, -len * 0.74);
      ctx.lineTo(w, 0);
      ctx.lineTo(w * 0.55, tail);
      ctx.closePath();
    }
    ctx.moveTo(h.hub * R, 0);
    ctx.arc(0, 0, h.hub * R, 0, TAU);
  }

  function drawHand(h, angle) {
    const D = T.dial;
    const isSecond = h.kind === 'needle';
    const e = h.elev * R;
    ctx.save();
    ctx.translate(CX, CY);
    ctx.rotate(angle);
    ctx.fillStyle = isSecond ? D.accent : `rgb(${D.hand[0].join(',')})`;
    handPath(h);
    setShadow(ctx, 'rgba(12,16,24,0.26)', e * 1.6, -LIGHT.x * e * 1.1, -LIGHT.y * e * 1.1);
    ctx.fill();
    setShadow(ctx, 'rgba(12,16,24,0.32)', e * 0.35, -LIGHT.x * e * 0.35, -LIGHT.y * e * 0.35);
    ctx.fill();
    clearShadow(ctx);

    ctx.save();
    handPath(h);
    ctx.clip();
    if (isSecond) {
      const [r, g, b] = hexRgb(D.accent);
      const [lc, rc] = facetShades(angle, [r * 0.7, g * 0.7, b * 0.7], [Math.min(255, r * 1.25), Math.min(255, g * 1.25), Math.min(255, b * 1.25)]);
      ctx.fillStyle = lc; ctx.fillRect(-R, -R * 1.1, R, R * 1.5);
      ctx.fillStyle = rc; ctx.fillRect(0, -R * 1.1, R, R * 1.5);
    } else {
      const [lc, rc] = facetShades(angle, D.hand[0], D.hand[1]);
      ctx.fillStyle = lc; ctx.fillRect(-R, -R * 1.1, R, R * 1.5);
      ctx.fillStyle = rc; ctx.fillRect(0, -R * 1.1, R, R * 1.5);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 0.7;
    ctx.beginPath(); ctx.moveTo(0, h.tail * R); ctx.lineTo(0, -h.len * R); ctx.stroke();
    ctx.restore();

    // Lume: an inlay down the blade, or a dot on the second hand's counterweight
    ctx.fillStyle = D.lume;
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    if (isSecond) {
      ctx.arc(0, h.tail * R * 0.72, R * 0.017, 0, TAU);
    } else {
      const len = h.len * R, w = h.w * R / 2;
      ctx.moveTo(-w * 0.45, -h.hub * R - R * 0.03);
      ctx.lineTo(-w * 0.45, -len * 0.72);
      ctx.lineTo(0, -len * 0.9);
      ctx.lineTo(w * 0.45, -len * 0.72);
      ctx.lineTo(w * 0.45, -h.hub * R - R * 0.03);
      ctx.closePath();
    }
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Hub disc (unrotated so its sheen stays put)
    const hr = h.hub * R;
    const col = isSecond ? hexRgb(D.accent) : D.hand[1];
    const dark = isSecond ? hexRgb(D.accent).map((v) => v * 0.6) : D.hand[0];
    const hg = ctx.createRadialGradient(CX - hr * 0.4, CY - hr * 0.4, 0, CX, CY, hr);
    hg.addColorStop(0, `rgb(${col.map(Math.round).join(',')})`);
    hg.addColorStop(1, `rgb(${dark.map(Math.round).join(',')})`);
    ctx.fillStyle = hg;
    circlePath(ctx, CX, CY, hr);
    ctx.fill();
  }

  function drawCap() {
    const r = R * 0.018, M = T.metal;
    ctx.save();
    setShadow(ctx, 'rgba(20,24,30,0.4)', r * 0.6, -LIGHT.x * r * 0.35, -LIGHT.y * r * 0.35);
    const g = ctx.createRadialGradient(CX - r * 0.35, CY - r * 0.4, 0, CX, CY, r);
    g.addColorStop(0, M.cap[0]);
    g.addColorStop(0.35, M.cap[1]);
    g.addColorStop(0.8, M.cap[2]);
    g.addColorStop(1, M.cap[3]);
    ctx.fillStyle = g;
    circlePath(ctx, CX, CY, r);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    circlePath(ctx, CX - r * 0.3, CY - r * 0.35, r * 0.22);
    ctx.fill();
  }

  // ---------- Complications: next prayer, sun dial, date window, moon phase ----------
  const CFONT = '"IBM Plex Sans Arabic", "Segoe UI", Tahoma, sans-serif';
  const cfont = (k, w = 500, min = 9) => `${w} ${Math.max(min, k * R).toFixed(1)}px ${CFONT}`;
  let compLayer = null, compKey = '';

  // Recessed look: clip to the shape, then fill everything *outside* it so only
  // the soft shadow spills in along the upper-left edge.
  function insetShadow(g, pathFn, strength) {
    g.save();
    pathFn();
    g.clip();
    setShadow(g, `rgba(10,14,20,${strength})`, R * 0.02, R * 0.004, R * 0.008);
    g.fillStyle = '#000';
    pathFn();
    g.rect(CX + R * 3, CY - R * 3, -R * 6, R * 6);
    g.fill('evenodd');
    g.restore();
  }
  // Shrinks the font until the text fits (never below `min` px), then cuts what still does not
  // fit with "…" (reminder and station titles can be any length). Returns the text to draw.
  function fitText(g, text, maxW, k, w, min = 9) {
    text = String(text || '');
    let size = k;
    g.font = cfont(size, w, min);
    while (g.measureText(text).width > maxW && size > 0.03) { size -= 0.003; g.font = cfont(size, w, min); }
    return window.noonClockCore.ellipsize(text, maxW, (t) => g.measureText(t).width);
  }

  // ---------- Slots: what each one shows, and what a tap does ----------
  const I18 = window.noonI18n;
  const tr = (x) => (I18 ? I18.t(x) : x);
  const num = (n) => (I18 && I18.num ? I18.num(n) : String(n));
  const POINTS = ['شمال', 'شمال شرق', 'شرق', 'جنوب شرق', 'جنوب', 'جنوب غرب', 'غرب', 'شمال غرب'];
  // noonQibla.bearing() gives { bearing, km } for the chosen place.
  const qiblaDeg = () => { const q = window.noonQibla && window.noonQibla.bearing(); return q && Number.isFinite(q.bearing) ? q.bearing : null; };
  // round: the modern face's small round slots, which need shorter labels.
  function prayerProgress(snap) {
    const prev = prevPrayerH(snap);
    const gap = (snap.next.h >= prev ? snap.next.h - prev : snap.next.h + 24 - prev) || 1;
    return Math.min(1, Math.max(0, 1 - snap.next.inH / gap));
  }
  function slotData(id, snap, round) {
    const C = window.noonClockCore;
    switch (id) {
      case 'none':
        return { kicker: '', main: '', sub: '', key: 'n' };
      case 'gdate': {
        const opt = (o) => { try { return new Intl.DateTimeFormat(I18 ? I18.locale : 'en-GB', Object.assign({ timeZone: snap.place.tz }, o)).format(Date.now()); } catch (_) { return new Intl.DateTimeFormat(I18 ? I18.locale : 'en-GB', o).format(Date.now()); } };
        if (round) return { kicker: opt({ weekday: 'short' }), main: opt({ day: 'numeric' }), sub: opt({ month: 'long' }), key: `g${snap.dateEn}` };
        return { kicker: tr('التاريخ الميلادي'), main: opt({ weekday: 'long', day: 'numeric', month: 'long' }), sub: opt({ year: 'numeric' }), key: `g${snap.dateEn}` };
      }
      case 'moon':
        return { kicker: tr('القمر'), main: snap.moon.name, sub: '', key: `mo${snap.moon.name}`, moon: true };
      case 'qibla': {
        const b = qiblaDeg();
        if (b === null) return { kicker: tr('القبلة'), main: '—', sub: tr('اختر مدينتك'), key: 'q-' };
        return { kicker: tr('القبلة'), main: `${num(Math.round(b))}°`, sub: tr(POINTS[C.compassPoint(b)]), key: `q${Math.round(b)}` };
      }
      case 'radio': {
        const L = window.noonListen, st = L ? L.state() : 'off', last = L && L.last();
        const on = st === 'playing' || st === 'loading';
        return { kicker: tr('الإذاعة'), main: (last && last.title) || '▶', sub: tr(on ? 'تعمل الآن' : 'اضغط للتشغيل'), key: `r${st}${last ? last.title : ''}`, on };
      }
      case 'sun': {
        const c = C.sunCountdown(snap.nowH, snap.today.sunrise, snap.today.sunset);
        if (!c) return { kicker: tr('الشروق والغروب'), main: '—', sub: '', key: 's-' };
        const at = c.kind === 'sunrise' ? snap.today.sunrise : snap.today.sunset;
        const sr = snap.today.sunrise, ss = snap.today.sunset, day = ss - sr;
        const prog = c.kind === 'sunset' ? (snap.nowH - sr) / day : 1 - c.inH / (24 - day);
        return { kicker: tr(c.kind === 'sunrise' ? 'الشروق' : 'الغروب'), main: snap.fmtHM(at), sub: snap.fmtIn(c.inH), key: `s${c.kind}`, prog };
      }
      case 'hijri': {
        // Round: the day large, the month under it.
        const [day, ...month] = String(snap.hijri).split(' ');
        if (round) return { kicker: tr('هجري'), main: day, sub: month.join(' '), key: 'h' };
        return { kicker: tr('هجري'), main: snap.hijri, sub: snap.dateEn, key: 'h' };
      }
      case 'tasbih': {
        const t = window.noonAdhkar && window.noonAdhkar.tasbeeh ? window.noonAdhkar.tasbeeh() : { n: 0, phrase: '' };
        return { kicker: tr('المسبحة'), main: num(t.n), sub: t.phrase, key: `t${t.n}`, prog: (t.n % 33) / 33 || (t.n ? 1 : 0) };
      }
      case 'reminder': {
        const RM = window.noonReminders, n = RM && RM.upcoming()[0];
        const label = tr(round ? 'تذكير' : 'التذكير القادم');
        if (!n) return { kicker: label, main: tr('لا تذكيرات'), sub: '', key: 'm-' };
        return { kicker: label, main: n.r.title || tr('تذكير'), sub: RM.when(n.t), key: `m${n.r.id}${n.t}` };
      }
      case 'focus': {
        const f = window.noonFocus && window.noonFocus();
        if (!f || !f.running || !Number.isFinite(f.endEpoch)) return { kicker: tr('التركيز'), main: tr('ابدأ'), sub: tr('جلسة تركيز'), key: 'f-' };
        const left = Math.max(0, Math.ceil((f.endEpoch - Date.now()) / 60000));
        const total = (f.endEpoch - f.startEpoch) / 60000;
        return { kicker: tr(f.mode === 'focus' ? 'التركيز' : 'استراحة'), main: I18 ? I18.dur(Math.floor(left / 60), left % 60) : `${left}m`, sub: tr('متبقٍّ'), key: `f${f.mode}${left}`, prog: total > 0 ? 1 - left / total : 0 };
      }
      default:
        if (round) return { kicker: snap.next.name, main: snap.next.time, sub: snap.next.inText, key: `p${snap.next.key}${snap.next.inText}`, prog: prayerProgress(snap) };
        return { kicker: snap.place.name, main: `${snap.next.name} ${snap.next.time}`, sub: snap.next.inText, key: `p${snap.next.key}${snap.next.inText}` };
    }
  }
  function runSlot(id) {
    switch (id) {
      case 'qibla': if (window.noonQibla) window.noonQibla.open(); break;
      case 'radio': {
        const L = window.noonListen;
        if (!L) break;
        const st = L.state();
        if (st === 'playing' || st === 'loading') L.stop(); else if (L.last()) L.resume(); else L.open();
        break;
      }
      case 'hijri': if (window.noonUI) window.noonUI.go('calendar'); break;
      case 'tasbih': if (window.noonAdhkar && window.noonAdhkar.tasbeehTap) window.noonAdhkar.tasbeehTap(); break;
      case 'reminder': if (window.noonReminders) window.noonReminders.open(); break;
      case 'focus': if (window.noonFocusToggle) window.noonFocusToggle(); break;
      default: if (window.noonSettings) window.noonSettings.open('place'); else if (window.noonAstro) window.noonAstro.open();
    }
    compKey = '';
  }

  // Classic and minimal: the slot is a band above the centre, three lines like the old next-prayer text.
  function drawSlotBand(g, rect, d) {
    if (!d.main && !d.kicker) return;
    const D = T.dial, cx = rect.x + rect.w / 2;
    g.direction = TEXT_DIR;
    g.fillStyle = D.faint;
    g.fillText(fitText(g, d.kicker || '', rect.w * 0.7, 0.05, 500), cx, rect.y + rect.h * 0.2);
    g.fillStyle = D.ink;
    g.fillText(fitText(g, d.main || '', rect.w * 0.86, 0.075, 700), cx, rect.y + rect.h * 0.52);
    g.fillStyle = D.accent;
    g.fillText(fitText(g, d.sub || '', rect.w * 0.8, 0.054, 600), cx, rect.y + rect.h * 0.82);
  }

  // A day arc from sunrise (one end) to sunset (the other), the sun on it, and how long until the next one.
  function drawSunDial(g, snap) {
    const D = T.dial;
    const sx = CX - R * 0.37, sy = CY, rs = R * 0.16;
    const face = () => { g.beginPath(); g.arc(sx, sy, rs, 0, TAU); };
    g.fillStyle = D.sub;
    face(); g.fill();
    insetShadow(g, face, 0.3);
    const sr = snap.today.sunrise, ss = snap.today.sunset;
    const c = window.noonClockCore.sunCountdown(snap.nowH, sr, ss);
    const ar = rs * 0.72, ay = sy - rs * 0.02;
    g.lineCap = 'round';
    g.lineWidth = R * 0.016;
    g.strokeStyle = rgba(D.soft, 0.3);
    g.beginPath(); g.arc(sx, ay, ar, Math.PI, TAU); g.stroke();
    if (Number.isFinite(sr) && Number.isFinite(ss)) {
      const p = Math.min(1, Math.max(0, (snap.nowH - sr) / (ss - sr)));
      const isDay = snap.nowH > sr && snap.nowH < ss;
      if (p > 0.01) {
        g.strokeStyle = '#E3B04B';
        g.beginPath(); g.arc(sx, ay, ar, Math.PI, Math.PI + Math.PI * p); g.stroke();
      }
      const a = Math.PI + Math.PI * p, bx = sx + Math.cos(a) * ar, by = ay + Math.sin(a) * ar;
      g.fillStyle = isDay ? '#F2A516' : '#DCE3EE';
      g.strokeStyle = isDay ? '#B8740C' : '#56607A';
      g.lineWidth = Math.max(1, R * 0.006);
      g.beginPath(); g.arc(bx, by, R * 0.024, 0, TAU); g.fill(); g.stroke();
    }
    // Horizon.
    g.strokeStyle = rgba(D.soft, 0.55);
    g.lineWidth = Math.max(1, R * 0.004);
    g.beginPath(); g.moveTo(sx - ar - R * 0.025, ay); g.lineTo(sx + ar + R * 0.025, ay); g.stroke();
    // Inside, under the horizon: the time left in large digits; under the dial: until what.
    // (A sentence does not fit beside the hour numerals on a phone; digits and two words do.)
    g.direction = TEXT_DIR;
    if (c) {
      const mins = Math.max(0, Math.round(c.inH * 60));
      const left = num(`${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`);
      g.fillStyle = D.accent;
      g.direction = 'ltr';
      g.fillText(fitText(g, left, rs * 1.3, 0.075, 700, 11), sx, ay + rs * 0.42);
      g.direction = TEXT_DIR;
      g.fillStyle = D.soft;
      const until = tr(c.kind === 'sunrise' ? 'حتى الشروق' : 'حتى الغروب');
      g.fillText(fitText(g, until, R * 0.42, 0.048, 600, 11), sx, sy + rs + R * 0.06);
    }
  }

  function drawDateWindow(g, snap) {
    const w = R * 0.42, h = R * 0.22, x = CX + R * 0.37 - w / 2, y = CY - h / 2;
    const box = () => roundRectPath(g, x, y, w, h, R * 0.02);
    // polished frame
    g.save();
    roundRectPath(g, x - R * 0.012, y - R * 0.012, w + R * 0.024, h + R * 0.024, R * 0.03);
    g.fillStyle = metalGradient(g, x, y, x + w, y + h, [T.dial.index[1].length ? `rgb(${T.dial.index[1].join(',')})` : '#fff', `rgb(${T.dial.index[0].join(',')})`]);
    setShadow(g, 'rgba(10,14,20,0.3)', R * 0.01, R * 0.003, R * 0.006);
    g.fill();
    g.restore();
    g.fillStyle = '#FFFFFF';
    box(); g.fill();
    insetShadow(g, box, 0.22);
    g.fillStyle = '#23272E';
    g.direction = 'ltr';
    g.fillText(fitText(g, snap.dateEn, w * 0.9, 0.056, 700), CX + R * 0.37, y + h * 0.3);
    g.direction = TEXT_DIR;
    g.fillStyle = '#2F6E4E';
    g.fillText(fitText(g, snap.hijri, w * 0.9, 0.058, 600), CX + R * 0.37, y + h * 0.72);
  }

  // An icon-like moon: lit side with a soft edge, the dark side faintly visible (earthshine), light craters.
  function drawMoon(g, snap, at) {
    const mx = at ? at.x : CX, my = at ? at.y : CY + R * 0.3, rm = at ? at.r : R * 0.085;
    const hole = () => { g.beginPath(); g.arc(mx, my, rm * 1.25, 0, TAU); };
    const sky = g.createRadialGradient(mx, my - rm * 0.5, 0, mx, my, rm * 1.25);
    sky.addColorStop(0, '#26314A');
    sky.addColorStop(1, '#0F1420');
    g.fillStyle = sky;
    hole(); g.fill();
    insetShadow(g, hole, 0.5);
    g.save();
    g.translate(mx, my);
    if (snap.place.lat < 0) g.scale(-1, 1); // southern hemisphere sees it mirrored
    const f = snap.moon.frac, k = Math.cos(2 * Math.PI * f), rx = Math.abs(k) * rm;
    g.fillStyle = '#2B3346';
    g.beginPath(); g.arc(0, 0, rm, 0, TAU); g.fill();
    const lit = () => {
      g.beginPath();
      if (f < 0.5) {
        g.arc(0, 0, rm, -Math.PI / 2, Math.PI / 2, false);
        g.ellipse(0, 0, rx, rm, 0, Math.PI / 2, -Math.PI / 2, k > 0);
      } else {
        g.arc(0, 0, rm, Math.PI / 2, Math.PI * 1.5, false);
        g.ellipse(0, 0, rx, rm, 0, -Math.PI / 2, Math.PI / 2, k > 0);
      }
    };
    const glow = g.createRadialGradient(-rm * 0.35, -rm * 0.4, rm * 0.1, 0, 0, rm);
    glow.addColorStop(0, '#FFFDF4');
    glow.addColorStop(0.75, '#EFE6CC');
    glow.addColorStop(1, '#CFC3A2');
    g.fillStyle = glow;
    lit(); g.fill();
    g.save();
    lit(); g.clip();
    g.fillStyle = 'rgba(120,110,85,0.18)';
    [[-0.32, -0.22, 0.24], [0.28, 0.18, 0.2], [-0.05, 0.45, 0.14]].forEach(([dx, dy, r]) => {
      g.beginPath(); g.arc(dx * rm, dy * rm, r * rm, 0, TAU); g.fill();
    });
    g.restore();
    g.strokeStyle = 'rgba(255,255,255,0.18)';
    g.lineWidth = Math.max(0.6, R * 0.003);
    g.beginPath(); g.arc(0, 0, rm, 0, TAU); g.stroke();
    g.restore();
    if (at) return;
    g.direction = TEXT_DIR;
    g.fillStyle = T.dial.soft;
    g.fillText(fitText(g, snap.moon.name, R * 0.5, 0.048, 600), mx, my + rm * 1.25 + R * 0.05);
  }

  function currentSlots() {
    return window.noonClockCore.slotRects(T.face, CX, CY, R).map((rect) => ({ rect, id: T.slots[rect.id] || 'prayer' }));
  }
  function buildComplications(snap) {
    const [c, g] = makeLayer();
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (T.face === 'modern') { drawModern(g, snap); return c; }
    if (T.face === 'minimal') {
      const D = T.dial;
      const style = { fill: D.sub, ink: D.ink, soft: D.soft, accent: D.accent, track: rgba(D.soft, 0.18), edge: rgba(D.soft, 0.25), sunk: true };
      for (const x of currentSlots()) drawSlotRound(g, x.rect, slotData(x.id, snap, true), x.id, style, snap);
      return c;
    }
    for (const s of currentSlots()) drawSlotBand(g, s.rect, slotData(s.id, snap));
    drawSunDial(g, snap);
    drawMoon(g, snap);
    drawDateWindow(g, snap);
    return c;
  }
  // ---------- The modern face (in the spirit of today's smartwatch faces; everything drawn here) ----------
  const PRAYER_KEYS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
  function drawModern(g, snap) {
    const M = T.theme, A = M.accent;
    // Dates: Hijri, then the Gregorian day in the accent colour.
    g.direction = TEXT_DIR;
    g.fillStyle = M.ink;
    g.fillText(fitText(g, snap.hijri, R * 0.8, 0.068, 600), CX, CY - R * 0.64);
    g.direction = 'ltr';
    g.fillStyle = A;
    g.fillText(fitText(g, snap.dateEn, R * 0.8, 0.054, 700), CX, CY - R * 0.53);
    // Today's prayers: five marks on a line from midnight to midnight, a dot at now.
    const lx = CX - R * 0.62, lw = R * 1.24, ly = CY + R * 0.06;
    g.strokeStyle = M.faint;
    g.lineCap = 'round';
    g.lineWidth = Math.max(2, R * 0.012);
    g.beginPath(); g.moveTo(lx, ly); g.lineTo(lx + lw, ly); g.stroke();
    const xOf = (h) => (TEXT_DIR === 'rtl' ? lx + lw - lw * h / 24 : lx + lw * h / 24);
    // The part of the day already gone, in the accent colour.
    g.strokeStyle = rgba(A, 0.55);
    g.beginPath(); g.moveTo(xOf(0), ly); g.lineTo(xOf(snap.nowH), ly); g.stroke();
    PRAYER_KEYS.forEach((k) => {
      const h = snap.today[k];
      if (!Number.isFinite(h)) return;
      const isNext = snap.next.key === k, tall = R * (isNext ? 0.075 : 0.045);
      g.fillStyle = isNext ? A : M.soft;
      roundRectPath(g, xOf(h) - R * 0.009, ly - tall - R * 0.01, R * 0.018, tall, R * 0.009);
      g.fill();
    });
    g.fillStyle = M.ink;
    g.beginPath(); g.arc(xOf(snap.nowH), ly, R * 0.02, 0, TAU); g.fill();
    g.fillStyle = A;
    g.beginPath(); g.arc(xOf(snap.nowH), ly, R * 0.01, 0, TAU); g.fill();
    g.direction = TEXT_DIR;
    g.fillStyle = M.soft;
    const nextLine = `${snap.next.name} ${snap.next.time} · ${snap.next.inText}`;
    g.fillText(fitText(g, nextLine, lw, 0.05, 600), CX, ly + R * 0.075);
    // Round slots.
    const style = { fill: M.slot, ink: M.ink, soft: M.soft, accent: A, track: M.faint, edge: M.edge, sunk: false };
    for (const x of currentSlots()) drawSlotRound(g, x.rect, slotData(x.id, snap, true), x.id, style, snap);
    // While a focus session runs, the edge belongs to its rings (up to four, further in each hour).
    const fs = window.noonFocus && window.noonFocus();
    if (fs && fs.running) return;
    // Side gauges: start side = how far through the wait for the next prayer, end side = today's wird.
    const towards = prayerProgress(snap);
    const q = window.noonQuran && window.noonQuran.progress ? window.noonQuran.progress() : null;
    const wird = q && q.goal ? Math.min(1, q.today / q.goal) : 0;
    const startSide = TEXT_DIR === 'rtl' ? 0 : Math.PI;
    gauge(g, startSide, towards, A);
    gauge(g, Math.PI - startSide, wird, M.light ? '#C08A1E' : '#E8C064');
    // Sunrise and sunset along the bottom edge.
    curvedText(g, `↑ ${snap.fmtHM(snap.today.sunrise, false)}`, Math.PI * 0.66, R * 0.87);
    curvedText(g, `↓ ${snap.fmtHM(snap.today.sunset, false)}`, Math.PI * 0.34, R * 0.87);
  }
  function prevPrayerH(snap) {
    const hs = PRAYER_KEYS.map((k) => snap.today[k]).filter((h) => Number.isFinite(h) && h <= snap.nowH);
    return hs.length ? hs[hs.length - 1] : (Number.isFinite(snap.today.isha) ? snap.today.isha - 24 : 0);
  }
  // A gauge on one side of the dial (centre angle `side`: 0 = right, π = left), filling upwards.
  function gauge(g, side, p, col) {
    const rr = R * 0.9, half = Math.PI * 0.2;
    const right = Math.cos(side) > 0;
    const a0 = right ? side + half : side - half, a1 = right ? side - half : side + half; // bottom → top
    g.lineCap = 'round';
    g.lineWidth = R * 0.032;
    g.strokeStyle = T.theme.faint;
    g.beginPath(); g.arc(CX, CY, rr, Math.min(a0, a1), Math.max(a0, a1)); g.stroke();
    if (p > 0.01) {
      const end = a0 + (a1 - a0) * p;
      g.strokeStyle = col;
      g.beginPath(); g.arc(CX, CY, rr, Math.min(a0, end), Math.max(a0, end)); g.stroke();
    }
  }
  // Text bent along the bottom of the dial, read left to right.
  function curvedText(g, text, centreAngle, rr) {
    g.save();
    g.direction = 'ltr';
    g.font = cfont(0.05, 600, 10);
    g.fillStyle = T.theme.soft;
    const chars = [...text], widths = chars.map((ch) => g.measureText(ch).width);
    const total = widths.reduce((sum, w) => sum + w, 0);
    let a = centreAngle + total / rr / 2;
    chars.forEach((ch, i) => {
      a -= widths[i] / 2 / rr;
      g.save();
      g.translate(CX + Math.cos(a) * rr, CY + Math.sin(a) * rr);
      g.rotate(a - Math.PI / 2);
      g.fillText(ch, 0, 0);
      g.restore();
      a -= widths[i] / 2 / rr;
    });
    g.restore();
  }
  function drawSlotRound(g, s, d, id, st, snap) {
    if (id === 'none') return;
    g.fillStyle = st.fill;
    g.beginPath(); g.arc(s.cx, s.cy, s.r, 0, TAU); g.fill();
    if (st.sunk) insetShadow(g, () => { g.beginPath(); g.arc(s.cx, s.cy, s.r, 0, TAU); }, 0.28);
    // Thin ring: the track, then how far along (prayer wait, daylight, tasbih, focus).
    const rr = s.r - Math.max(1.5, R * 0.012);
    g.lineCap = 'round';
    g.lineWidth = Math.max(1.5, R * 0.01);
    g.strokeStyle = id === 'radio' && d.on ? st.accent : st.track;
    g.beginPath(); g.arc(s.cx, s.cy, rr, 0, TAU); g.stroke();
    if (Number.isFinite(d.prog) && d.prog > 0.005) {
      g.strokeStyle = st.accent;
      g.beginPath(); g.arc(s.cx, s.cy, rr, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, d.prog)); g.stroke();
    }
    if (d.moon && snap) { drawMoon(g, snap, { x: s.cx, y: s.cy - s.r * 0.08, r: s.r * 0.5 }); }
    else drawIcon(g, id, s.cx, s.cy - s.r * 0.52, s.r * 0.24, st.accent);
    g.direction = TEXT_DIR;
    if (!d.moon) {
      g.fillStyle = st.ink;
      g.fillText(fitText(g, d.main || '', s.r * 1.62, 0.07, 700), s.cx, s.cy + s.r * 0.02);
    }
    g.fillStyle = st.soft;
    const under = d.moon ? d.main : (id === 'prayer' || id === 'sun' || id === 'hijri' || id === 'gdate' || id === 'tasbih' ? d.kicker : d.sub);
    const line = fitText(g, under || '', s.r * 1.5, 0.038, 600);
    if (line && line === String(under)) g.fillText(line, s.cx, s.cy + s.r * 0.5);
  }
  // Small line icons for the round slots (drawn here, no icon font).
  function drawIcon(g, id, x, y, sz, col) {
    g.save();
    g.translate(x, y);
    g.strokeStyle = col; g.fillStyle = col;
    g.lineWidth = Math.max(1.2, sz * 0.16);
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath();
    switch (id) {
      case 'qibla': // the Kaaba: a cube with its band
        g.rect(-sz * 0.55, -sz * 0.5, sz * 1.1, sz * 1.0); g.fill();
        g.fillStyle = 'rgba(255,215,120,0.95)'; g.fillRect(-sz * 0.55, -sz * 0.22, sz * 1.1, sz * 0.18);
        break;
      case 'sun':
        g.arc(0, 0, sz * 0.38, 0, TAU); g.fill();
        for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; g.moveTo(Math.cos(a) * sz * 0.62, Math.sin(a) * sz * 0.62); g.lineTo(Math.cos(a) * sz * 0.9, Math.sin(a) * sz * 0.9); }
        g.stroke();
        break;
      case 'radio':
        g.arc(-sz * 0.35, 0, sz * 0.2, 0, TAU); g.fill();
        g.beginPath(); g.arc(-sz * 0.35, 0, sz * 0.55, -0.7, 0.7); g.stroke();
        g.beginPath(); g.arc(-sz * 0.35, 0, sz * 0.95, -0.6, 0.6); g.stroke();
        break;
      case 'hijri': // a crescent
        g.arc(0, 0, sz * 0.7, 0, TAU); g.fill();
        g.globalCompositeOperation = 'destination-out';
        g.beginPath(); g.arc(sz * 0.32, -sz * 0.18, sz * 0.62, 0, TAU); g.fill();
        break;
      case 'gdate':
        roundRectPath(g, -sz * 0.7, -sz * 0.55, sz * 1.4, sz * 1.15, sz * 0.18); g.stroke();
        g.beginPath(); g.moveTo(-sz * 0.7, -sz * 0.15); g.lineTo(sz * 0.7, -sz * 0.15); g.stroke();
        break;
      case 'tasbih':
        for (let i = 0; i < 5; i++) { const a = Math.PI * (0.15 + i * 0.175); g.moveTo(Math.cos(a) * sz * 0.7 + sz * 0.16, -Math.sin(a) * sz * 0.7 + sz * 0.3); g.arc(Math.cos(a) * sz * 0.7, -Math.sin(a) * sz * 0.7 + sz * 0.3, sz * 0.16, 0, TAU); }
        g.fill();
        break;
      case 'reminder': // a bell
        g.moveTo(-sz * 0.6, sz * 0.45); g.lineTo(sz * 0.6, sz * 0.45); g.stroke();
        g.beginPath(); g.moveTo(-sz * 0.45, sz * 0.45); g.quadraticCurveTo(-sz * 0.5, -sz * 0.6, 0, -sz * 0.6); g.quadraticCurveTo(sz * 0.5, -sz * 0.6, sz * 0.45, sz * 0.45); g.stroke();
        g.beginPath(); g.arc(0, sz * 0.62, sz * 0.14, 0, TAU); g.fill();
        break;
      case 'focus': // a timer
        g.arc(0, sz * 0.12, sz * 0.62, 0, TAU); g.stroke();
        g.beginPath(); g.moveTo(-sz * 0.22, -sz * 0.72); g.lineTo(sz * 0.22, -sz * 0.72); g.moveTo(0, sz * 0.12); g.lineTo(0, -sz * 0.22); g.stroke();
        break;
      default: // the next prayer: a small dome with its crescent
        g.moveTo(-sz * 0.6, sz * 0.5); g.lineTo(-sz * 0.6, sz * 0.05); g.quadraticCurveTo(0, -sz * 0.75, sz * 0.6, sz * 0.05); g.lineTo(sz * 0.6, sz * 0.5); g.closePath(); g.fill();
        g.beginPath(); g.moveTo(0, -sz * 0.5); g.lineTo(0, -sz * 0.8); g.stroke();
    }
    g.restore();
  }

  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { compKey = ''; staticLayer = buildStatic(); });
  canvas.addEventListener('click', (ev) => {
    const box = canvas.getBoundingClientRect();
    const id = window.noonClockCore.hitSlot(window.noonClockCore.slotRects(T.face, CX, CY, R), ev.clientX - box.left, ev.clientY - box.top);
    if (id && T.slots[id] !== 'none') { runSlot(T.slots[id] || 'prayer'); return; }
    if (window.noonAstro) window.noonAstro.open();
  });
  canvas.style.cursor = 'pointer';
  ['noon-tasbeeh', 'noon-reminders'].forEach((e) => window.addEventListener(e, () => { compKey = ''; }));

  // Focus-session ring: like a dive-watch bezel, marks the running session on the
  // minute track (faded = elapsed, bright = remaining, dot = end time).
  function minuteTrackAngle(epochMs) {
    const e = epochMs + offsetMs;
    const d = new Date(e + placeOffset(e));
    return (d.getUTCMinutes() + d.getUTCSeconds() / 60 + d.getUTCMilliseconds() / 60000) * 6 * DEG - Math.PI / 2;
  }
  // The start and end times on the ring, in the chosen city's time like the hands.
  function cityTime(epoch) {
    const d = new Date(epoch + placeOffset(epoch));
    return num(`${d.getUTCHours() % 12 || 12}:${String(d.getUTCMinutes()).padStart(2, '0')}`);
  }
  function drawFocusArc() {
    const f = window.noonFocus && window.noonFocus();
    if (!f || !f.running) return;
    const laps = window.noonClockCore.focusLaps(f.startEpoch, f.endEpoch, Date.now());
    if (!laps.length) return;
    const col = f.mode === 'focus' ? (T.face === 'modern' ? T.accent : T.dial.accent) : '#3F9A6A';
    const a0 = minuteTrackAngle(f.startEpoch);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineWidth = R * 0.018;
    // Over an hour, each further hour continues on a ring a little further in.
    laps.forEach(({ lap, len, done }) => {
      const rr = R * (0.978 - lap * 0.06);
      const span = len / 60 * TAU, d = done / 60 * TAU;
      if (d > 0.001) { ctx.strokeStyle = rgba(col, 0.28); ctx.beginPath(); ctx.arc(CX, CY, rr, a0, a0 + d); ctx.stroke(); }
      if (span - d > 0.001) { ctx.strokeStyle = rgba(col, 0.95); ctx.beginPath(); ctx.arc(CX, CY, rr, a0 + d, a0 + span); ctx.stroke(); }
    });
    const last = laps[laps.length - 1];
    const rEnd = R * (0.978 - last.lap * 0.06), aEnd = a0 + last.len / 60 * TAU;
    ctx.strokeStyle = col;
    ctx.lineWidth = R * 0.01;
    ctx.beginPath();
    ctx.moveTo(CX + Math.cos(a0) * R * 0.93, CY + Math.sin(a0) * R * 0.93);
    ctx.lineTo(CX + Math.cos(a0) * R * 1.01, CY + Math.sin(a0) * R * 1.01);
    ctx.stroke();
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(CX + Math.cos(aEnd) * rEnd, CY + Math.sin(aEnd) * rEnd, R * 0.024, 0, TAU); ctx.fill();
    // Two time labels inside the dial; pushed apart when the session is short.
    const gap = ((aEnd - a0) % TAU + TAU) % TAU;
    const push = gap < 0.6 && laps.length === 1 ? (0.6 - gap) / 2 : 0;
    const label = (a, rr, t) => {
      const txt = cityTime(t);
      const lx = CX + Math.cos(a) * rr, ly = CY + Math.sin(a) * rr;
      ctx.font = cfont(0.046, 700, 11);
      const w = ctx.measureText(txt).width + R * 0.05, h = Math.max(16, R * 0.075);
      ctx.fillStyle = 'rgba(15,18,24,0.8)';
      roundRectPath(ctx, lx - w / 2, ly - h / 2, w, h, h / 2); ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = 'ltr';
      ctx.fillText(txt, lx, ly + 0.5);
    };
    label(a0 - push, R * 0.82, f.startEpoch);
    label(aEnd + push, R * 0.82 - last.lap * R * 0.06, f.endEpoch);
    ctx.restore();
  }

  // The qibla slot's needle turns with the phone, so it is drawn each frame (only while watched).
  let heading = null, unwatch = null;
  function syncCompass() {
    const want = onScreen && !document.hidden && currentSlots().some((x) => x.id === 'qibla');
    if (want && !unwatch && window.noonQibla && window.noonQibla.watch) unwatch = window.noonQibla.watch((h) => { heading = h; });
    if (!want && unwatch) { unwatch(); unwatch = null; heading = null; }
  }
  function drawQiblaNeedles() {
    const b = qiblaDeg();
    if (b === null) return;
    for (const x of currentSlots()) {
      if (x.id !== 'qibla') continue;
      const s = x.rect;
      const round = s.shape === 'circle';
      const r = round ? s.r * 0.86 : s.h * 0.3;
      const cx = round ? s.cx : s.x + s.w * 0.1;
      // Up on the screen is north on a desk, or the way the phone points when the sensor is on.
      const a = (b - (heading === null ? 0 : heading)) * DEG;
      ctx.save();
      ctx.translate(cx, s.cy);
      ctx.rotate(a);
      ctx.fillStyle = T.face === 'modern' ? T.theme.accent : T.dial.accent;
      ctx.beginPath();
      if (round) {
        // A small triangle riding the slot's rim.
        ctx.moveTo(0, -r); ctx.lineTo(r * 0.12, -r + r * 0.2); ctx.lineTo(-r * 0.12, -r + r * 0.2);
      } else {
        ctx.moveTo(0, -r); ctx.lineTo(r * 0.3, r * 0.6); ctx.lineTo(0, r * 0.35); ctx.lineTo(-r * 0.3, r * 0.6);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  // ---------- Loop ----------
  // Phones and tablets: a mechanical-watch sweep (8 steps a second) and 2x pixels
  // look the same to the eye and leave the processor free for scrolling.
  const LITE = matchMedia('(pointer: coarse)').matches || !!window.Capacitor;
  const FRAME_MS = LITE ? 125 : 0;
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, LITE ? 2 : 3);
    const box = pane.getBoundingClientRect();
    W = Math.max(1, box.width);
    H = Math.max(1, box.height);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    CX = W / 2 - Math.min(W, H) * 0.02; // leave room for the crown
    CY = H / 2;
    R = Math.min(W * 0.92, H) * 0.38;
    staticLayer = buildStatic();
    glassLayer = buildGlass();
    compKey = '';
  }

  // Draw only while the clock is on screen.
  let onScreen = true, looping = false, lastDraw = 0;
  function loop(now) {
    if (!onScreen) { looping = false; return; }
    requestAnimationFrame(loop);
    // Hidden behind focus mode, or not due yet.
    if (document.body.classList.contains('fm-open') || now - lastDraw < FRAME_MS) return;
    lastDraw = now;
    frame(now);
  }
  function startLoop() {
    if (looping || !onScreen) return;
    looping = true;
    requestAnimationFrame(loop);
  }
  if (window.IntersectionObserver) {
    new IntersectionObserver((entries) => {
      onScreen = entries[entries.length - 1].isIntersecting;
      startLoop();
      syncCompass();
    }).observe(pane);
  }

  function frame(now) {
    const a = handAngles(now);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(staticLayer, 0, 0);
    const snap = window.noonAstro && window.noonAstro.snapshot(Date.now());
    if (snap) {
      const fr = window.noonFocus && window.noonFocus();
      const key = snap.key + '|' + canvas.width + 'x' + canvas.height + '|' + T.face + '|' + (fr && fr.running ? 'F' : '') + '|' + currentSlots().map((x) => slotData(x.id, snap).key).join(',');
      if (key !== compKey || !compLayer) { compLayer = buildComplications(snap); compKey = key; }
      ctx.drawImage(compLayer, 0, 0);
    }
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (T.face === 'modern') {
      drawSecondsSweep();
      drawFocusArc();
      drawQiblaNeedles();
      drawDigitalTime();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(glassLayer, 0, 0);
      return;
    }
    drawFocusArc();
    drawQiblaNeedles();
    drawHand(HANDS.hour, a.hour);
    drawHand(HANDS.minute, a.minute);
    drawHand(HANDS.second, a.second);
    drawCap();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(glassLayer, 0, 0);
  }

  // The modern face's seconds: the minute ticks light up one by one around the edge.
  function drawSecondsSweep() {
    const f = window.noonFocus && window.noonFocus();
    if (f && f.running) return; // the edge shows the focus rings then
    const e = Date.now() + offsetMs, sec = new Date(e).getUTCSeconds();
    ctx.save();
    ctx.strokeStyle = T.theme.accent;
    ctx.lineCap = 'round';
    for (let i = 0; i <= sec; i++) {
      const a = i * 6 * DEG - Math.PI / 2, long = i % 5 === 0;
      ctx.globalAlpha = i === sec ? 1 : 0.35 + 0.65 * (i / Math.max(1, sec));
      ctx.lineWidth = Math.max(1.2, R * (long ? 0.014 : 0.009));
      ctx.beginPath();
      ctx.moveTo(CX + Math.cos(a) * R * (long ? 0.9 : 0.925), CY + Math.sin(a) * R * (long ? 0.9 : 0.925));
      ctx.lineTo(CX + Math.cos(a) * R * 0.96, CY + Math.sin(a) * R * 0.96);
      ctx.stroke();
    }
    ctx.restore();
  }

  // The modern face's time: hours and minutes drawn once a minute (soft glow, gentle gradient),
  // the seconds in a small accent pill each frame. Canvas text does not make the browser fetch a
  // web font, so the digits' font is asked for once.
  let digitsFont = false, timeLayer = null, timeKey = '';
  const DIGITS = '"Readex Pro", "Inter", "IBM Plex Sans Arabic", "Segoe UI", sans-serif';
  function drawDigitalTime() {
    if (!digitsFont && document.fonts && document.fonts.load) { digitsFont = true; document.fonts.load(`400 40px ${DIGITS}`, '0123456789:').then(() => { timeKey = ''; }).catch(() => {}); }
    const e = Date.now() + offsetMs, d = new Date(e + placeOffset(e));
    const pad = (n) => String(n).padStart(2, '0');
    const hm = `${d.getUTCHours() % 12 || 12}:${pad(d.getUTCMinutes())}`;
    const M = T.theme;
    const key = `${hm}|${canvas.width}x${canvas.height}|${M.bg1}${M.accent}`;
    if (key !== timeKey || !timeLayer) {
      const [c, g] = makeLayer();
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.direction = 'ltr';
      g.font = `400 ${(R * 0.36).toFixed(1)}px ${DIGITS}`;
      const grad = g.createLinearGradient(0, CY - R * 0.42, 0, CY - R * 0.08);
      grad.addColorStop(0, M.ink);
      grad.addColorStop(1, M.light ? shade(M.accent, -0.35) : shade(M.accent, 0.55));
      setShadow(g, rgba(M.accent, M.light ? 0.18 : 0.35), R * 0.06, 0, 0);
      g.fillStyle = grad;
      g.fillText(hm, CX - R * 0.07, CY - R * 0.24);
      clearShadow(g);
      timeLayer = c; timeKey = key;
      timeLayer.secX = CX - R * 0.07 + g.measureText(hm).width / 2 + R * 0.09;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(timeLayer, 0, 0);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    // Seconds in a pill.
    const ss = pad(d.getUTCSeconds());
    ctx.save();
    ctx.font = `600 ${(R * 0.1).toFixed(1)}px ${DIGITS}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = 'ltr';
    const w = ctx.measureText('00').width + R * 0.07, h = R * 0.13, x = timeLayer.secX, y = CY - R * 0.17;
    ctx.fillStyle = M.accent;
    roundRectPath(ctx, x - w / 2, y - h / 2, w, h, h / 2); ctx.fill();
    ctx.fillStyle = M.light ? '#FFFFFF' : M.bg2;
    ctx.fillText(ss, x, y + 0.5);
    ctx.restore();
  }

  let resizeQueued = false;
  const queueResize = () => {
    if (resizeQueued) return;
    resizeQueued = true;
    requestAnimationFrame(() => { resizeQueued = false; resize(); });
  };
  window.addEventListener('resize', queueResize);
  if (window.ResizeObserver) new ResizeObserver(queueResize).observe(pane);
  // Dial or case changed in the appearance panel
  window.addEventListener('noon-look', () => { T = look(); queueResize(); syncCompass(); });
  document.addEventListener('visibilitychange', syncCompass);

  resize();
  startLoop();
})();
