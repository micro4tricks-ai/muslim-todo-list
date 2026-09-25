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
      } catch (_) { /* try next source; keep device time if all fail */ }
    }
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
                 lume: '#F4F7F2', accent: '#C4492C', sub: '#C3D8E6', night: '#3C5266' }
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
  const look = () => {
    const l = window.noonLook ? window.noonLook.get() : {};
    return { dial: DIALS[l.dial] || DIALS.ceramic, metal: METALS[l.metal] || METALS.steel };
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
      else g.fillRect(-tw / 2, -R * 0.955, tw, R * 0.04);
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

    // Printed numerals
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
  const cfont = (k, w = 500) => `${w} ${Math.max(9, k * R).toFixed(1)}px ${CFONT}`;
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
  function fitText(g, text, maxW, k, w) {
    let size = k;
    g.font = cfont(size, w);
    while (g.measureText(text).width > maxW && size > 0.03) { size -= 0.003; g.font = cfont(size, w); }
  }

  function drawSunDial(g, snap) {
    const D = T.dial;
    const sx = CX - R * 0.37, sy = CY, rs = R * 0.15;
    const face = () => { g.beginPath(); g.arc(sx, sy, rs, 0, TAU); };
    g.fillStyle = D.sub;
    face(); g.fill();
    if (g.createConicGradient && D.finish === 'sunburst') {
      const sb = g.createConicGradient(0, sx, sy);
      for (let i = 0; i <= 48; i++) sb.addColorStop(i / 48, i % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)');
      g.fillStyle = sb; face(); g.fill();
    }
    insetShadow(g, face, 0.3);
    // 24-hour ring: midnight at the bottom, noon at the top.
    const ang = (h) => (h / 24) * TAU + Math.PI / 2;
    const rr = rs * 0.74;
    g.lineWidth = R * 0.032;
    g.strokeStyle = D.night;
    g.beginPath(); g.arc(sx, sy, rr, 0, TAU); g.stroke();
    const sr = snap.today.sunrise, ss = snap.today.sunset;
    if (Number.isFinite(sr) && Number.isFinite(ss)) {
      g.strokeStyle = '#E3B04B';
      g.beginPath(); g.arc(sx, sy, rr, ang(sr), ang(ss)); g.stroke();
    }
    g.strokeStyle = D.faint;
    g.lineWidth = Math.max(1, R * 0.005);
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2;
      g.beginPath();
      g.moveTo(sx + Math.cos(a) * rs * 0.9, sy + Math.sin(a) * rs * 0.9);
      g.lineTo(sx + Math.cos(a) * rs * 0.98, sy + Math.sin(a) * rs * 0.98);
      g.stroke();
    }
    const a = ang(snap.nowH);
    const isDay = Number.isFinite(sr) && snap.nowH > sr && snap.nowH < ss;
    g.strokeStyle = D.ink;
    g.lineWidth = Math.max(1, R * 0.007);
    g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr); g.stroke();
    g.fillStyle = isDay ? '#F2A516' : '#DCE3EE';
    g.strokeStyle = isDay ? '#B8740C' : '#56607A';
    g.beginPath(); g.arc(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr, R * 0.026, 0, TAU); g.fill(); g.stroke();
    g.fillStyle = D.ink;
    g.beginPath(); g.arc(sx, sy, R * 0.012, 0, TAU); g.fill();
    g.direction = TEXT_DIR;
    g.fillStyle = D.soft;
    g.font = cfont(0.05, 600);
    g.fillText(`${snap.fmtHM(sr, false)} – ${snap.fmtHM(ss, false)}`, sx, sy + rs + R * 0.055);
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
    fitText(g, snap.dateEn, w * 0.9, 0.056, 700);
    g.fillText(snap.dateEn, CX + R * 0.37, y + h * 0.3);
    g.direction = TEXT_DIR;
    g.fillStyle = '#2F6E4E';
    fitText(g, snap.hijri, w * 0.9, 0.058, 600);
    g.fillText(snap.hijri, CX + R * 0.37, y + h * 0.72);
  }

  function drawMoon(g, snap) {
    const mx = CX, my = CY + R * 0.3, rm = R * 0.082;
    const hole = () => { g.beginPath(); g.arc(mx, my, rm * 1.22, 0, TAU); };
    const sky = g.createRadialGradient(mx, my - rm * 0.4, 0, mx, my, rm * 1.22);
    sky.addColorStop(0, '#2C3547');
    sky.addColorStop(1, '#161B25');
    g.fillStyle = sky;
    hole(); g.fill();
    insetShadow(g, hole, 0.5);
    g.fillStyle = 'rgba(255,255,255,0.7)';
    [[-0.85, -0.55, 0.05], [0.9, -0.35, 0.04], [0.7, 0.75, 0.035]].forEach(([dx, dy, r]) => {
      g.beginPath(); g.arc(mx + dx * rm, my + dy * rm, R * r * 0.2, 0, TAU); g.fill();
    });
    g.save();
    g.translate(mx, my);
    if (snap.place.lat < 0) g.scale(-1, 1); // southern hemisphere sees it mirrored
    g.fillStyle = '#39414F';
    g.beginPath(); g.arc(0, 0, rm, 0, TAU); g.fill();
    const f = snap.moon.frac, k = Math.cos(2 * Math.PI * f), rx = Math.abs(k) * rm;
    const lit = g.createRadialGradient(-rm * 0.3, -rm * 0.35, 0, 0, 0, rm);
    lit.addColorStop(0, '#FFFBEF');
    lit.addColorStop(1, '#E4DCC4');
    g.fillStyle = lit;
    g.beginPath();
    if (f < 0.5) {
      g.arc(0, 0, rm, -Math.PI / 2, Math.PI / 2, false);
      g.ellipse(0, 0, rx, rm, 0, Math.PI / 2, -Math.PI / 2, k > 0);
    } else {
      g.arc(0, 0, rm, Math.PI / 2, Math.PI * 1.5, false);
      g.ellipse(0, 0, rx, rm, 0, -Math.PI / 2, Math.PI / 2, k > 0);
    }
    g.fill();
    g.fillStyle = 'rgba(90,85,70,0.12)';
    [[-0.3, -0.25, 0.28], [0.25, 0.1, 0.22], [-0.1, 0.4, 0.18]].forEach(([dx, dy, r]) => {
      g.beginPath(); g.arc(dx * rm, dy * rm, r * rm, 0, TAU); g.fill();
    });
    g.restore();
    g.direction = TEXT_DIR;
    g.fillStyle = T.dial.soft;
    g.font = cfont(0.048, 600);
    g.fillText(snap.moon.name, mx, my + rm * 1.22 + R * 0.05);
  }

  function drawNextPrayer(g, snap) {
    const D = T.dial;
    g.direction = TEXT_DIR;
    g.fillStyle = D.faint;
    fitText(g, snap.place.name, R * 0.5, 0.05, 500);
    g.fillText(snap.place.name, CX, CY - R * 0.45);
    g.fillStyle = D.ink;
    const label = `${snap.next.name} ${snap.next.time}`;
    fitText(g, label, R * 0.62, 0.075, 700);
    g.fillText(label, CX, CY - R * 0.34);
    g.fillStyle = D.accent;
    g.font = cfont(0.054, 600);
    g.fillText(snap.next.inText, CX, CY - R * 0.245);
  }

  function buildComplications(snap) {
    const [c, g] = makeLayer();
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    drawNextPrayer(g, snap);
    drawSunDial(g, snap);
    drawDateWindow(g, snap);
    drawMoon(g, snap);
    return c;
  }

  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { compKey = ''; staticLayer = buildStatic(); });
  canvas.addEventListener('click', () => { if (window.noonAstro) window.noonAstro.open(); });

  // Focus-session ring: like a dive-watch bezel, marks the running session on the
  // minute track (faded = elapsed, bright = remaining, dot = end time).
  function minuteTrackAngle(epochMs) {
    const e = epochMs + offsetMs;
    const d = new Date(e + placeOffset(e));
    return (d.getUTCMinutes() + d.getUTCSeconds() / 60 + d.getUTCMilliseconds() / 60000) * 6 * DEG - Math.PI / 2;
  }
  function drawFocusArc() {
    const f = window.noonFocus && window.noonFocus();
    if (!f || !f.running) return;
    const now = Date.now();
    const col = f.mode === 'focus' ? T.dial.accent : '#3F9A6A';
    const a0 = minuteTrackAngle(f.startEpoch);
    const a1 = minuteTrackAngle(f.endEpoch);
    const span = (f.endEpoch - f.startEpoch) / 3600000 * TAU;
    const done = (Math.min(now, f.endEpoch) - f.startEpoch) / 3600000 * TAU;
    const rr = R * 0.978;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineWidth = R * 0.018;
    if (done > 0.001) {
      ctx.strokeStyle = rgba(col, 0.25);
      ctx.beginPath(); ctx.arc(CX, CY, rr, a0, a0 + done); ctx.stroke();
    }
    if (span - done > 0.001) {
      ctx.strokeStyle = rgba(col, 0.9);
      ctx.beginPath(); ctx.arc(CX, CY, rr, a0 + done, a0 + span); ctx.stroke();
    }
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(CX + Math.cos(a1) * rr, CY + Math.sin(a1) * rr, R * 0.02, 0, TAU);
    ctx.fill();
    ctx.restore();
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
    if (now - lastDraw < FRAME_MS) return;
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
    }).observe(pane);
  }

  function frame(now) {
    const a = handAngles(now);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(staticLayer, 0, 0);
    const snap = window.noonAstro && window.noonAstro.snapshot(Date.now());
    if (snap) {
      const key = snap.key + '|' + canvas.width + 'x' + canvas.height;
      if (key !== compKey || !compLayer) { compLayer = buildComplications(snap); compKey = key; }
      ctx.drawImage(compLayer, 0, 0);
    }
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    drawFocusArc();
    drawHand(HANDS.hour, a.hour);
    drawHand(HANDS.minute, a.minute);
    drawHand(HANDS.second, a.second);
    drawCap();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(glassLayer, 0, 0);
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
  window.addEventListener('noon-look', () => { T = look(); queueResize(); });

  resize();
  startLoop();
})();
