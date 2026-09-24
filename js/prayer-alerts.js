// ---------- Prayer alerts: a heads-up before each prayer and a notice when it's due ----------
// Optionally pauses a running focus session so the prayer isn't delayed.
(() => {
  'use strict';
  const { T, I, load, store, dayKey, toast, onRemote } = window.noonUI;
  const KEY = 'noon-sweep-prayer-alerts';
  const PRAYERS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
  const NAMES = { fajr: 'الفجر', dhuhr: 'الظهر', asr: 'العصر', maghrib: 'المغرب', isha: 'العشاء' };
  const $ = (id) => document.getElementById(id);
  const native = () => window.noonNative;
  // Inside the Android app the phone itself shows the alerts, so they are on by default.
  let S = Object.assign({ enabled: true, notify: !!native(), autoPause: true, before: 10 }, load(KEY, {}));
  const save = () => { S.updatedAt = Date.now(); store(KEY, S); if (native()) native().schedulePrayers(true); };
  // Remember what we've already announced today, per device.
  let fired = {};
  try { fired = JSON.parse(sessionStorage.getItem('noon-prayer-fired') || '{}'); } catch (_) {}
  const mark = (id) => { fired[id] = 1; try { sessionStorage.setItem('noon-prayer-fired', JSON.stringify(fired)); } catch (_) {} };

  // ---- settings (in the location & prayer times panel) ----
  const en = $('paEnabled'), no = $('paNotify'), ap = $('paPause'), bf = $('paBefore');
  function syncForm() {
    en.checked = S.enabled; no.checked = S.notify; ap.checked = S.autoPause; bf.value = String(S.before);
    [no, ap, bf].forEach((x) => { x.disabled = !S.enabled; });
  }
  en.addEventListener('change', () => { S.enabled = en.checked; save(); syncForm(); });
  ap.addEventListener('change', () => { S.autoPause = ap.checked; save(); });
  bf.addEventListener('change', () => { S.before = Number(bf.value) || 0; save(); });
  no.addEventListener('change', async () => {
    if (no.checked && native()) {
      if (!(await native().permit(true))) {
        no.checked = false;
        $('paMsg').textContent = T('لم يُسمح للتطبيق بالإشعارات. يمكنك السماح بها من إعدادات التطبيق في الهاتف.');
      }
    } else if (no.checked && 'Notification' in window && Notification.permission !== 'granted') {
      let p = 'denied';
      try { p = await Notification.requestPermission(); } catch (_) {}
      if (p !== 'granted') {
        no.checked = false;
        $('paMsg').textContent = T('المتصفح لم يسمح بالإشعارات. يمكنك السماح بها من إعدادات الموقع في المتصفح.');
      }
    }
    S.notify = no.checked; save();
  });
  if (!('Notification' in window) && !native()) { no.disabled = true; no.closest('label').hidden = true; }

  function notify(title, body) {
    // The app books its alerts ahead of time (js/native.js).
    if (native() || !S.notify || !('Notification' in window) || Notification.permission !== 'granted') return;
    try { new Notification(title, { body, tag: 'noon-prayer', silent: false }); } catch (_) {}
  }
  let audioCtx = null;
  function chime() {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      [523, 659, 784].forEach((hz, i) => {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain(), t0 = audioCtx.currentTime + i * 0.25;
        o.frequency.value = hz;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.18, t0 + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.9);
        o.connect(g).connect(audioCtx.destination);
        o.start(t0); o.stop(t0 + 1);
      });
    } catch (_) {}
  }

  // ---- the watcher ----
  function check() {
    if (!S.enabled || !window.noonAstro) return;
    const snap = window.noonAstro.snapshot(Date.now());
    const day = dayKey(), now = snap.nowH;
    for (const k of PRAYERS) {
      const at = snap.today[k];
      if (!Number.isFinite(at)) continue;
      const name = T(NAMES[k]);
      // A few minutes before.
      if (S.before > 0) {
        const id = `${day}-${k}-before`;
        const from = at - S.before / 60;
        if (!fired[id] && now >= from && now < at) {
          mark(id);
          const mins = Math.max(1, Math.round((at - now) * 60));
          const msg = `${T('باقي')} ${I.num(mins)} ${T('دقيقة على صلاة')} ${name}. ${T('اختم ما بين يديك.')}`.trim();
          toast(msg);
          notify(`${T('اقتربت صلاة')} ${name}`, msg);
        }
      }
      // When it's due (within the first 20 minutes, so a late-opened page still says so).
      const id = `${day}-${k}`;
      if (!fired[id] && now >= at && now < at + 20 / 60) {
        mark(id);
        const ctl = window.noonFocusControl;
        const running = ctl && ctl.state().running && ctl.state().mode === 'focus';
        if (running && S.autoPause) ctl.pause();
        chime();
        const msg = `${T('حان الآن وقت صلاة')} ${name} (${snap.fmtHM(at)}).`;
        toast(running && S.autoPause ? `${msg} ${T('أوقفنا جلسة التركيز مؤقتاً، أكملها بعد الصلاة.')}` : msg,
          running && !S.autoPause && ctl ? { label: T('إيقاف مؤقت للصلاة'), run: () => ctl.pause(), sticky: true } : null);
        notify(`${T('حان وقت صلاة')} ${name}`, T('حيّ على الصلاة'));
        window.dispatchEvent(new CustomEvent('noon-prayer', { detail: { prayer: k, name } }));
      }
    }
  }
  setInterval(check, 15000);
  setTimeout(check, 3000);
  onRemote(KEY, () => { S = Object.assign(S, load(KEY, {})); syncForm(); if (native()) native().schedulePrayers(true); });
  syncForm();
})();
