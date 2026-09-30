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
  let S = Object.assign({ enabled: true, notify: !!native(), autoPause: true, before: 10, sound: 'madinah', fajrSound: '', iqamah: 0 }, load(KEY, {}));
  // The sound when a prayer is due: a short chime or a full adhan (sounds/adhan, see CREDITS.md there).
  const SOUNDS = [
    ['madinah', 'أذان من المسجد النبوي'], ['fakhri', 'أذان بصوت صباح فخري'], ['beautiful', 'أذان هادئ'],
    ['azeez', 'أذان بصوت عاقب عزيز'], ['chime', 'نغمة قصيرة فقط']
  ];
  const save = () => { S.updatedAt = Date.now(); store(KEY, S); if (native()) native().schedulePrayers(true); };
  // Remember what we've already announced today, per device.
  let fired = {};
  try { fired = JSON.parse(sessionStorage.getItem('noon-prayer-fired') || '{}'); } catch (_) {}
  const mark = (id) => { fired[id] = 1; try { sessionStorage.setItem('noon-prayer-fired', JSON.stringify(fired)); } catch (_) {} };

  // ---- settings (in the location & prayer times panel) ----
  const en = $('paEnabled'), no = $('paNotify'), ap = $('paPause'), bf = $('paBefore'), snd = $('paSound'), pre = $('paPreview');
  SOUNDS.forEach(([v, label]) => snd.append(new Option(T(label), v)));
  const fsnd = $('paFajrSound'), iq = $('paIqamah'), sil = $('paSilent');
  // Only the phone app can play the adhan while the phone is on silent.
  if (!native()) sil.closest('label').hidden = true;
  sil.addEventListener('change', () => { S.silentOk = sil.checked; save(); });
  // In the phone app: send a test notification, and ask for permission if it is missing.
  if (native()) {
    $('paTestRow').hidden = false;
    $('paTest').addEventListener('click', async () => {
      const ok = await native().testNotify();
      $('paTestMsg').textContent = ok ? T('سيصلك إشعار تجريبي بعد ٥ ثوانٍ.') : T('لم يُسمح للتطبيق بالإشعارات. يمكنك السماح بها من إعدادات التطبيق في الهاتف.');
    });
  }
  fsnd.append(new Option(T('مثل باقي الصلوات'), ''));
  SOUNDS.forEach(([v, label]) => fsnd.append(new Option(T(label), v)));
  fsnd.addEventListener('change', () => { S.fajrSound = fsnd.value; save(); });
  iq.addEventListener('change', () => { S.iqamah = Number(iq.value) || 0; save(); });
  function syncForm() {
    en.checked = S.enabled; no.checked = S.notify; ap.checked = S.autoPause; bf.value = String(S.before);
    snd.value = SOUNDS.some((x) => x[0] === S.sound) ? S.sound : 'madinah';
    fsnd.value = SOUNDS.some((x) => x[0] === S.fajrSound) ? S.fajrSound : '';
    iq.value = String(S.iqamah || 0);
    sil.checked = !!S.silentOk;
    [no, ap, bf, snd, fsnd, iq].forEach((x) => { x.disabled = !S.enabled; });
  }
  snd.addEventListener('change', () => { S.sound = snd.value; save(); if (!adhan.paused) preview(); });
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
  // ---- the adhan ----
  const adhan = new Audio();
  adhan.preload = 'none';
  function playAdhan(name) {
    if (name === 'chime') { chime(); return false; }
    adhan.src = `sounds/adhan/adhan_${name}.mp3`;
    adhan.currentTime = 0;
    adhan.play().catch(() => chime());
    window.dispatchEvent(new CustomEvent('noon-recitation')); // the focus sounds fall quiet
    return true;
  }
  function stopAdhan() {
    adhan.pause();
    if (native()) native().adhanStop();
    previewing = false;
    pre.textContent = T('استماع'); pre.setAttribute('aria-pressed', 'false');
  }
  let previewing = false;
  adhan.addEventListener('ended', stopAdhan);
  function preview() {
    if (!adhan.paused || previewing) { stopAdhan(); return; }
    // In the phone app, try the real player (alarm volume), exactly as it will sound at prayer time.
    if (native() && snd.value !== 'chime') {
      native().adhanTest(snd.value);
      previewing = true;
      pre.textContent = T('إيقاف'); pre.setAttribute('aria-pressed', 'true');
      return;
    }
    if (playAdhan(snd.value)) { pre.textContent = T('إيقاف'); pre.setAttribute('aria-pressed', 'true'); }
  }
  pre.addEventListener('click', preview);

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
        // In the phone app the adhan player (AdhanService) is already playing, so the page stays quiet.
        const sound = k === 'fajr' && S.fajrSound ? S.fajrSound : S.sound;
        const withAdhan = native() ? sound !== 'chime' : playAdhan(sound);
        const msg = `${T('حان الآن وقت صلاة')} ${name} (${snap.fmtHM(at)}).`;
        const note = running && S.autoPause ? T('أوقفنا جلسة التركيز مؤقتاً، أكملها بعد الصلاة.') : '';
        if (window.noonCard) {
          const acts = [];
          if (withAdhan) acts.push({ label: T('إيقاف الأذان'), primary: true, run: stopAdhan });
          if (running && !S.autoPause && ctl) acts.push({ label: T('إيقاف مؤقت للصلاة'), run: () => ctl.pause() });
          if (window.noonPrayers) acts.push({ label: T('صلّيتها'), run: () => { window.noonPrayers.mark(k, 'ontime'); toast(T('سُجّلت في «صلواتي». تقبّل الله.')); } });
          window.noonCard.show({ kicker: T('حيّ على الصلاة'), title: `${T('حان وقت صلاة')} ${name}`, body: [msg, note].filter(Boolean).join(' '), actions: acts, onClose: stopAdhan });
        } else {
          toast(note ? `${msg} ${note}` : msg,
            running && !S.autoPause && ctl ? { label: T('إيقاف مؤقت للصلاة'), run: () => ctl.pause(), sticky: true } : null);
        }
        notify(`${T('حان وقت صلاة')} ${name}`, T('حيّ على الصلاة'));
        window.dispatchEvent(new CustomEvent('noon-prayer', { detail: { prayer: k, name } }));
      }
      // The iqamah, some minutes after the adhan (the phone app books it as a notification).
      const iqId = `${day}-${k}-iq`, iqAt = at + (S.iqamah || 0) / 60;
      if (S.iqamah > 0 && !native() && !fired[iqId] && now >= iqAt && now < iqAt + 10 / 60) {
        mark(iqId);
        chime();
        toast(`${T('الإقامة')}: ${name}. ${T('قد قامت الصلاة، استووا واعتدلوا.')}`);
        notify(`${T('الإقامة')}: ${name}`, T('قد قامت الصلاة، استووا واعتدلوا.'));
      }
    }
  }
  setInterval(check, 15000);
  setTimeout(check, 3000);
  onRemote(KEY, () => { S = Object.assign(S, load(KEY, {})); syncForm(); if (native()) native().schedulePrayers(true); });
  syncForm();
})();
