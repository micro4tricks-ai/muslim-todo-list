// ---------- Qibla: the direction of the Kaaba from the chosen place, with a live compass on phones ----------
(() => {
  'use strict';
  const { T, I, $, el, button, toast } = window.noonUI;
  const KAABA = [21.422487, 39.826206];
  const R = Math.PI / 180;
  let box = null, rose = null, needle = null, info = null, hint = null, enableBtn = null;
  let heading = null, listening = false, aligned = false;

  function place() {
    const s = window.noonAstro && window.noonAstro.snapshot(Date.now());
    return s ? s.place : null;
  }
  // Initial great-circle bearing from true north, and the distance in km.
  function qibla(lat, lon) {
    const f1 = lat * R, f2 = KAABA[0] * R, dl = (KAABA[1] - lon) * R;
    const y = Math.sin(dl) * Math.cos(f2);
    const x = Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl);
    const bearing = (Math.atan2(y, x) / R + 360) % 360;
    const a = Math.sin((f2 - f1) / 2) ** 2 + Math.cos(f1) * Math.cos(f2) * Math.sin(dl / 2) ** 2;
    return { bearing, km: 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) };
  }

  function build() {
    box = el('div', 'qb');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-labelledby', 'qbTitle');
    box.dir = I.dir;
    box.hidden = true;
    const card = el('div', 'qb-card');
    const head = el('div', 'pp-head');
    const h = el('h2', '', T('اتجاه القبلة'));
    h.id = 'qbTitle';
    head.append(h, button('btn btn-quiet', T('تم'), close));
    const dial = el('div', 'qb-dial');
    const marks = I.isEn ? ['N', 'E', 'S', 'W'] : ['ش', 'ق', 'ج', 'غ'];
    let ticks = '';
    for (let d = 0; d < 360; d += 15) ticks += `<line x1="100" y1="${d % 90 ? 12 : 8}" x2="100" y2="${d % 90 ? 18 : 22}" transform="rotate(${d} 100 100)" />`;
    dial.innerHTML = `
      <svg class="qb-rose" viewBox="0 0 200 200" aria-hidden="true">
        <circle cx="100" cy="100" r="94" class="qb-ring"/>
        <g class="qb-ticks">${ticks}</g>
        ${marks.map((m, k) => `<text x="${100 + 64 * Math.sin(k * Math.PI / 2)}" y="${105 - 64 * Math.cos(k * Math.PI / 2)}" class="qb-mark${k === 0 ? ' is-n' : ''}">${m}</text>`).join('')}
        <g class="qb-needle">
          <line x1="100" y1="100" x2="100" y2="36" />
          <g transform="translate(100 30)"><rect x="-11" y="-11" width="22" height="22" rx="3" class="qb-kaaba"/><rect x="-11" y="-5" width="22" height="3.5" class="qb-band"/></g>
        </g>
        <circle cx="100" cy="100" r="5" class="qb-hub"/>
      </svg>
      <span class="qb-top" aria-hidden="true"></span>`;
    rose = dial.querySelector('.qb-rose');
    needle = dial.querySelector('.qb-needle');
    info = el('p', 'qb-info');
    hint = el('p', 'hint qb-hint');
    enableBtn = button('btn btn-primary', T('تشغيل البوصلة'), enable);
    enableBtn.hidden = !('DeviceOrientationEvent' in window) || !matchMedia('(pointer: coarse)').matches;
    card.append(head, dial, info, enableBtn, hint,
      el('p', 'credit', T('الاتجاه محسوب من موقعك المختار إلى الكعبة المشرفة. أبعد الهاتف عن المعادن والمغناطيس، وحرّكه على شكل رقم ٨ لمعايرة البوصلة.')));
    box.append(card);
    box.addEventListener('click', (ev) => { if (ev.target === box) close(); });
    box.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') close(); });
    document.body.append(box);
  }

  function draw() {
    const p = place();
    if (!p) return;
    const q = qibla(p.lat, p.lon);
    const deg = Math.round(q.bearing);
    const km = Math.round(q.km).toLocaleString(I.isEn ? 'en-GB' : 'ar-EG');
    info.textContent = `${p.name}: ${I.num(deg)}° ${T('من الشمال باتجاه عقارب الساعة')} · ${km} ${T('كم إلى مكة المكرمة')}`;
    needle.setAttribute('transform', `rotate(${q.bearing} 100 100)`);
    if (heading === null) {
      rose.style.transform = '';
      hint.textContent = listening ? T('حرّك الهاتف قليلاً لتبدأ البوصلة…') : T('ضع الهاتف مسطّحاً ووجّه أعلاه نحو الشمال؛ السهم يشير إلى القبلة.');
      return;
    }
    rose.style.transform = `rotate(${-heading}deg)`;
    const off = ((q.bearing - heading + 540) % 360) - 180;
    const ok = Math.abs(off) <= 3;
    box.classList.toggle('is-aligned', ok);
    if (ok && !aligned && window.noonBuzz) window.noonBuzz(60);
    aligned = ok;
    hint.textContent = calibrate ? T('البوصلة غير دقيقة الآن: حرّك الهاتف في الهواء على شكل رقم ٨، وأبعده عن المعادن والمغناطيس.')
      : ok ? T('أنت الآن تتجه إلى القبلة.') : `${T(off > 0 ? 'استدر يميناً' : 'استدر يساراً')} ${I.num(Math.abs(Math.round(off)))}°`;
    hint.classList.toggle('is-warn', calibrate);
  }

  // ---- the heading: one source for the panel, the clock's needle and the qibla card ----
  // In the app, the phone's own compass (CompassPlugin: rotation vector, true north from Android's
  // magnetic model); on the website, the page's orientation events, turned from magnetic to true
  // north with the World Magnetic Model (js/compass-core.js). Either way the needle is smoothed,
  // and scattered readings (or the sensor saying so) ask for calibration.
  const CC = window.noonCompassCore;
  const NATIVE = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Compass;
  const smooth = CC.smoother(0.22);
  const recent = [];
  let calibrate = false, nativeOn = false, nativeAcc = -1, nativeHandle = null, decl = null, declAt = '';
  const declNow = () => {
    const p = place();
    if (!p || !window.NOON_WMM) return 0;
    const key = `${p.lat.toFixed(2)},${p.lon.toFixed(2)},${new Date().toDateString()}`;
    if (key !== declAt) { decl = CC.declination(p.lat, p.lon, CC.decimalYear(new Date()), window.NOON_WMM); declAt = key; }
    return decl;
  };
  function feed(trueH) {
    heading = smooth.push(trueH, performance.now());
    recent.push(trueH);
    if (recent.length > 24) recent.shift();
    calibrate = (nativeOn && nativeAcc >= 0 && nativeAcc <= 1) || (recent.length >= 12 && CC.jitter(recent) > 12);
    watchers.forEach((cb) => cb(heading, { calibrate }));
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; if (box && !box.hidden) draw(); });
  }
  function onOrient(e) {
    let h = null;
    if (typeof e.webkitCompassHeading === 'number') h = e.webkitCompassHeading;
    else if ((e.absolute || e.type === 'deviceorientationabsolute') && e.alpha !== null) h = 360 - e.alpha;
    if (h === null) return;
    const turn = (screen.orientation && screen.orientation.angle) || 0;
    feed(CC.trueHeading(h + turn, declNow())); // both give magnetic north
  }
  const webEvent = () => ('ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation');
  async function startSensor() {
    if (listening) return;
    listening = true;
    if (NATIVE) {
      try {
        const p = place();
        nativeHandle = await NATIVE.addListener('heading', (d) => { nativeAcc = d.accuracy; feed(d.heading); });
        await NATIVE.start(p ? { lat: p.lat, lon: p.lon } : {});
        nativeOn = true;
        return;
      } catch (e) {
        if (nativeHandle) { nativeHandle.remove(); nativeHandle = null; }
        // On the Android emulator any orientation sensor brings the emulator down: no compass there.
        if (/emulator/.test(String((e && e.message) || e))) return;
      }
    }
    addEventListener(webEvent(), onOrient);
  }
  // Watchers outside the panel (the clock's qibla slot, the qibla card) get the heading too. The
  // sensor starts only where it needs no permission prompt (Android, and the app), and stops when
  // nobody is watching or the page is hidden.
  const watchers = new Set();
  const quietSensor = () => !!NATIVE || (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission !== 'function' && matchMedia('(pointer: coarse)').matches);
  function watch(cb) {
    watchers.add(cb);
    if (quietSensor() && !document.hidden) startSensor();
    return () => { watchers.delete(cb); if (!watchers.size && (!box || box.hidden)) stop(); };
  }
  let raf = 0;
  async function enable() {
    try {
      if (!NATIVE && typeof DeviceOrientationEvent.requestPermission === 'function' && (await DeviceOrientationEvent.requestPermission()) !== 'granted') {
        toast(T('لم يُسمح باستخدام البوصلة.'));
        return;
      }
    } catch (_) { /* older browsers need no permission */ }
    startSensor();
    enableBtn.hidden = true;
    draw();
  }
  function stop() {
    if (!listening) return;
    removeEventListener('deviceorientationabsolute', onOrient);
    removeEventListener('deviceorientation', onOrient);
    if (nativeHandle) { nativeHandle.remove(); nativeHandle = null; }
    if (nativeOn && NATIVE) NATIVE.stop().catch(() => {});
    nativeOn = false;
    listening = false;
    heading = null;
    calibrate = false;
    smooth.reset();
    recent.length = 0;
  }
  // The app's compass pauses with the app; start it again on return if someone still needs it.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else if (watchers.size || (box && !box.hidden)) { if (quietSensor()) startSensor(); }
  });

  function open() {
    if (!box) build();
    box.hidden = false;
    if (listening) enableBtn.hidden = true;
    draw();
    box.querySelector('.btn').focus();
    // Android asks for nothing, so the compass starts by itself there.
    if (!listening && quietSensor()) enable();
  }
  function close() {
    if (!box) return;
    box.hidden = true;
    if (!watchers.size) stop();
    enableBtn.hidden = !('DeviceOrientationEvent' in window) || !matchMedia('(pointer: coarse)').matches;
    const b = $('qiblaBtn');
    if (b) b.focus();
  }
  document.addEventListener('click', (ev) => { if (ev.target.closest('[data-qibla]')) open(); });
  window.noonQibla = { open, watch, heading: () => heading, calibrate: () => calibrate, bearing: () => { const p = place(); return p ? qibla(p.lat, p.lon) : null; } };
})();
