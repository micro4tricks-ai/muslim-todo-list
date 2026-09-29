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
    const ok = Math.abs(off) < 4;
    box.classList.toggle('is-aligned', ok);
    if (ok && !aligned && navigator.vibrate) navigator.vibrate(60);
    aligned = ok;
    hint.textContent = ok ? T('أنت الآن تتجه إلى القبلة.') : `${T(off > 0 ? 'استدر يميناً' : 'استدر يساراً')} ${I.num(Math.abs(Math.round(off)))}°`;
  }

  function onOrient(e) {
    let h = null;
    if (typeof e.webkitCompassHeading === 'number') h = e.webkitCompassHeading;
    else if ((e.absolute || e.type === 'deviceorientationabsolute') && e.alpha !== null) h = 360 - e.alpha;
    if (h === null) return;
    const turn = (screen.orientation && screen.orientation.angle) || 0;
    heading = (h + turn + 360) % 360;
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; if (!box.hidden) draw(); });
  }
  let raf = 0;
  async function enable() {
    try {
      if (typeof DeviceOrientationEvent.requestPermission === 'function' && (await DeviceOrientationEvent.requestPermission()) !== 'granted') {
        toast(T('لم يُسمح باستخدام البوصلة.'));
        return;
      }
    } catch (_) { /* older browsers need no permission */ }
    if (!listening) {
      listening = true;
      // Android gives a north-based heading on the "absolute" event; iPhone adds one to the plain event.
      addEventListener('ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation', onOrient);
    }
    enableBtn.hidden = true;
    draw();
  }
  function stop() {
    if (!listening) return;
    removeEventListener('deviceorientationabsolute', onOrient);
    removeEventListener('deviceorientation', onOrient);
    listening = false;
    heading = null;
  }

  function open() {
    if (!box) build();
    box.hidden = false;
    draw();
    box.querySelector('.btn').focus();
    // Android asks for nothing, so the compass starts by itself there.
    if (!listening && typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission !== 'function' && matchMedia('(pointer: coarse)').matches) enable();
  }
  function close() {
    if (!box) return;
    box.hidden = true;
    stop();
    enableBtn.hidden = !('DeviceOrientationEvent' in window) || !matchMedia('(pointer: coarse)').matches;
    const b = $('qiblaBtn');
    if (b) b.focus();
  }
  document.addEventListener('click', (ev) => { if (ev.target.closest('[data-qibla]')) open(); });
  window.noonQibla = { open, bearing: () => { const p = place(); return p ? qibla(p.lat, p.lon) : null; } };
})();
