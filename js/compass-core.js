// ---------- Compass: true north and a steady needle (pure functions, no page) ----------
// A phone's compass finds magnetic north; the qibla is measured from true (geographic) north.
// declination() gives the difference from the World Magnetic Model (js/wmm-data.js, NOAA NCEI),
// smoother() turns the sensor's shaky readings into a needle that glides, the short way round
// north, ignoring a single wild reading but following a real turn, and jitter() tells when the
// readings scatter so much that the phone should be calibrated. Tested by tools/test_compass.mjs
// against NOAA's official test values.
(function (root) {
  'use strict';
  const RAD = Math.PI / 180;
  const norm = (a) => ((a % 360) + 360) % 360;
  // Signed difference b − a, in −180…180.
  const diff = (a, b) => ((b - a + 540) % 360) - 180;

  // Decimal year of a date (2026.5 is the middle of 2026).
  function decimalYear(d) {
    const y = d.getUTCFullYear();
    const start = Date.UTC(y, 0, 1), end = Date.UTC(y + 1, 0, 1);
    return y + (d.getTime() - start) / (end - start);
  }

  // Magnetic declination (degrees, east positive) at a geodetic latitude/longitude, for a decimal
  // year, at an altitude in km above the WGS84 ellipsoid. The usual WMM computation: geodetic to
  // spherical coordinates, Schmidt semi-normalised Legendre functions, the field summed to degree 12.
  const cache = new Map();
  function prepare(model) {
    if (cache.has(model)) return cache.get(model);
    const N = 12;
    const c = [], cd = [];
    for (let n = 0; n <= N; n++) { c.push(new Array(N + 1).fill(0)); cd.push(new Array(N + 1).fill(0)); }
    // g in c[m][n], h in c[n][m-1] — the packing of the original geomag program.
    for (const [n, m, g, h, gd, hd] of model.coef) {
      c[m][n] = g; cd[m][n] = gd;
      if (m !== 0) { c[n][m - 1] = h; cd[n][m - 1] = hd; }
    }
    // Schmidt normalisation of the coefficients.
    const snorm = [[1]];
    const k = [];
    for (let n = 0; n <= N; n++) { k.push(new Array(N + 1).fill(0)); }
    for (let n = 1; n <= N; n++) {
      snorm[n] = [];
      snorm[n][0] = snorm[n - 1][0] * (2 * n - 1) / n;
      let j = 2;
      for (let m = 0; m <= n; m++) {
        k[m][n] = ((n - 1) * (n - 1) - m * m) / ((2 * n - 1) * (2 * n - 3));
        if (m > 0) {
          const flnmj = ((n - m + 1) * j) / (n + m);
          snorm[n][m] = snorm[n][m - 1] * Math.sqrt(flnmj);
          j = 1;
          c[n][m - 1] *= snorm[n][m];
          cd[n][m - 1] *= snorm[n][m];
        }
        c[m][n] *= snorm[n][m];
        cd[m][n] *= snorm[n][m];
      }
    }
    const p = { N, c, cd, k, epoch: model.epoch };
    cache.set(model, p);
    return p;
  }

  function declination(lat, lon, year, model, altKm) {
    const { N, c, cd, k, epoch } = prepare(model);
    const alt = altKm || 0;
    const dt = year - epoch;
    const a = 6378.137, b = 6356.7523142, re = 6371.2;
    const a2 = a * a, b2 = b * b, c2 = a2 - b2, a4 = a2 * a2, b4 = b2 * b2, c4 = a4 - b4;
    const rlat = lat * RAD, rlon = lon * RAD;
    const srlat = Math.sin(rlat), crlat = Math.cos(rlat), srlat2 = srlat * srlat, crlat2 = crlat * crlat;
    const sp = [0, Math.sin(rlon)], cp = [1, Math.cos(rlon)];
    for (let m = 2; m <= N; m++) { sp[m] = sp[1] * cp[m - 1] + cp[1] * sp[m - 1]; cp[m] = cp[1] * cp[m - 1] - sp[1] * sp[m - 1]; }
    // Geodetic to spherical.
    const q = Math.sqrt(a2 - c2 * srlat2), q1 = alt * q, q2 = ((q1 + a2) / (q1 + b2)) ** 2;
    const ct = srlat / Math.sqrt(q2 * crlat2 + srlat2), st = Math.sqrt(1 - ct * ct);
    const r = Math.sqrt(alt * alt + 2 * q1 + (a4 - c4 * srlat2) / (q * q));
    const d = Math.sqrt(a2 * crlat2 + b2 * srlat2);
    const ca = (alt + d) / r, sa = (c2 * crlat * srlat) / (r * d);
    const aor = re / r;
    let ar = aor * aor, br = 0, bt = 0, bp = 0, bpp = 0;
    const P = [], dP = [], pp = [1];
    for (let n = 0; n <= N; n++) { P.push(new Array(N + 1).fill(0)); dP.push(new Array(N + 1).fill(0)); }
    P[0][0] = 1;
    for (let n = 1; n <= N; n++) {
      ar *= aor;
      for (let m = 0; m <= n; m++) {
        // Legendre functions (Gauss normalised) and their derivatives.
        if (n === m) {
          P[m][n] = st * P[m - 1][n - 1];
          dP[m][n] = st * dP[m - 1][n - 1] + ct * P[m - 1][n - 1];
        } else if (n === 1 && m === 0) {
          P[m][n] = ct * P[m][n - 1];
          dP[m][n] = ct * dP[m][n - 1] - st * P[m][n - 1];
        } else if (n > 1 && n !== m) {
          if (m > n - 2) { P[m][n - 2] = 0; dP[m][n - 2] = 0; }
          P[m][n] = ct * P[m][n - 1] - k[m][n] * P[m][n - 2];
          dP[m][n] = ct * dP[m][n - 1] - st * P[m][n - 1] - k[m][n] * dP[m][n - 2];
        }
        // The coefficients at this date.
        const tc = c[m][n] + dt * cd[m][n];
        const tcH = m === 0 ? 0 : c[n][m - 1] + dt * cd[n][m - 1];
        const par = ar * P[m][n];
        let temp1, temp2;
        if (m === 0) { temp1 = tc * cp[m]; temp2 = tc * sp[m]; } else { temp1 = tc * cp[m] + tcH * sp[m]; temp2 = tc * sp[m] - tcH * cp[m]; }
        bt -= ar * temp1 * dP[m][n];
        bp += m * temp2 * par;
        br += (n + 1) * temp1 * par;
        // At the poles the east component needs its own recursion.
        if (st === 0 && m === 1) {
          pp[n] = n === 1 ? pp[n - 1] : ct * pp[n - 1] - k[m][n] * (pp[n - 2] || 0);
          bpp += m * temp2 * ar * pp[n];
        }
      }
    }
    bp = st === 0 ? bpp : bp / st;
    const bx = -bt * ca - br * sa, by = bp;
    return Math.atan2(by, bx) / RAD;
  }

  const trueHeading = (magnetic, decl) => Math.round(norm(magnetic + decl) * 1e6) / 1e6;

  // A needle that glides: each reading moves it part of the way (more when readings come slower),
  // the short way round north. A reading far from the needle counts only when the next ones agree.
  function smoother(strength) {
    let v = null, lastT = 0, pending = null, pendingN = 0;
    return {
      push(angle, t) {
        angle = norm(angle);
        if (v === null) { v = angle; lastT = t; return v; }
        const d = diff(v, angle);
        if (Math.abs(d) > 45) {
          // A jump: wait for two more readings near it before believing it.
          if (pending !== null && Math.abs(diff(pending, angle)) < 25) pendingN++;
          else { pending = angle; pendingN = 1; }
          if (pendingN < 3) return v;
          v = angle; pending = null; pendingN = 0; lastT = t; return v;
        }
        pending = null; pendingN = 0;
        const dtMs = Math.max(1, Math.min(500, t - lastT));
        lastT = t;
        const k = 1 - Math.pow(1 - strength, dtMs / 33);
        v = norm(v + d * k);
        return v;
      },
      value: () => v,
      reset() { v = null; pending = null; pendingN = 0; }
    };
  }

  // How much a run of readings scatters (circular standard deviation, degrees).
  function jitter(angles) {
    if (angles.length < 2) return 0;
    let s = 0, c = 0;
    for (const a of angles) { s += Math.sin(a * RAD); c += Math.cos(a * RAD); }
    const R = Math.min(1, Math.hypot(s, c) / angles.length);
    return Math.sqrt(-2 * Math.log(Math.max(R, 1e-9))) / RAD;
  }

  // How far to turn (degrees, right positive) for the phone to face the qibla.
  const offset = (qibla, heading) => diff(heading, qibla);

  root.noonCompassCore = { declination, decimalYear, trueHeading, smoother, jitter, offset };
})(typeof window !== 'undefined' ? window : globalThis);
