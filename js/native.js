// ---------- Android app (Capacitor): notifications that fire even when the app is closed ----------
// On the website this file does nothing. Inside the app it books the prayer alerts
// for the coming days with the phone itself, and a notice for the end of a focus session.
(() => {
  'use strict';
  const C = window.Capacitor;
  const LN = C && C.isNativePlatform && C.isNativePlatform() && C.Plugins && C.Plugins.LocalNotifications;
  window.noonNative = null;
  if (!LN) return;
  document.documentElement.classList.add('is-native', 'is-app');
  const { T, I, load } = window.noonUI;
  const PA_KEY = 'noon-sweep-prayer-alerts';
  const PRAYERS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
  const NAMES = { fajr: 'الفجر', dhuhr: 'الظهر', asr: 'العصر', maghrib: 'المغرب', isha: 'العشاء' };
  const DAYS = 7;
  const PRAYER_IDS = [1000, 2000], FOCUS_ID = 2000;
  const quiet = (p) => Promise.resolve(p).catch(() => {});

  const channels = Promise.all([
    quiet(LN.createChannel({ id: 'prayer', name: T('تنبيهات الصلاة'), importance: 5, visibility: 1, vibration: true })),
    quiet(LN.createChannel({ id: 'focus', name: T('مؤقت التركيز'), importance: 4, visibility: 1, vibration: true }))
  ]);

  async function permit(ask) {
    try {
      let p = await LN.checkPermissions();
      if (p.display !== 'granted' && ask) p = await LN.requestPermissions();
      return p.display === 'granted';
    } catch (_) { return false; }
  }

  // ---- prayers: the next few days, rebooked whenever the times or settings change ----
  const settings = () => Object.assign({ enabled: true, notify: true, before: 10 }, load(PA_KEY, {}));
  function plan() {
    const S = settings(), A = window.noonAstro;
    if (!S.enabled || !S.notify || !A) return [];
    const now = Date.now(), out = [];
    for (let d = 0; d < DAYS; d++) {
      const epoch = now + d * 864e5;
      const snap = A.snapshot(epoch);
      const midnight = epoch - snap.nowH * 3600e3;
      PRAYERS.forEach((k, i) => {
        const h = snap.today[k];
        if (!Number.isFinite(h)) return;
        const at = Math.round((midnight + h * 3600e3) / 60000) * 60000;
        const name = T(NAMES[k]);
        const id = PRAYER_IDS[0] + d * 10 + i * 2;
        if (at > now + 5000) {
          out.push({ id, channelId: 'prayer', title: `${T('حان وقت صلاة')} ${name}`, body: T('حيّ على الصلاة'),
            schedule: { at: new Date(at), allowWhileIdle: true } });
        }
        const early = at - S.before * 60000;
        if (S.before > 0 && early > now + 5000) {
          out.push({ id: id + 1, channelId: 'prayer', title: `${T('اقتربت صلاة')} ${name}`,
            body: `${T('باقي')} ${I.num(S.before)} ${T('دقيقة على صلاة')} ${name}. ${T('اختم ما بين يديك.')}`.trim(),
            schedule: { at: new Date(early), allowWhileIdle: true } });
        }
      });
    }
    return out;
  }
  let lastSig = null, busy = false;
  async function schedulePrayers(force) {
    if (busy) return;
    busy = true;
    try {
      const list = plan();
      const sig = list.map((n) => n.id + '@' + n.schedule.at.getTime() + n.title).join('|');
      if (sig === lastSig && !force) return;
      if (list.length && !(await permit(false))) return;
      await channels;
      const pending = await LN.getPending();
      const old = (pending.notifications || []).filter((n) => n.id >= PRAYER_IDS[0] && n.id < PRAYER_IDS[1]).map((n) => ({ id: n.id }));
      if (old.length) await LN.cancel({ notifications: old });
      if (list.length) await LN.schedule({ notifications: list });
      lastSig = sig;
    } catch (_) {
      lastSig = null; // try again on the next round
    } finally { busy = false; }
  }

  // ---- focus: a notice when the running session ends ----
  let focusSig = '';
  window.addEventListener('noon-focus', () => {
    const ctl = window.noonFocusControl;
    if (!ctl) return;
    const s = ctl.state();
    const end = Date.now() + s.remaining;
    const sig = s.running ? s.mode + '@' + Math.round(end / 5000) : 'off';
    if (sig === focusSig) return;
    focusSig = sig;
    (async () => {
      await quiet(LN.cancel({ notifications: [{ id: FOCUS_ID }] }));
      if (!s.running || s.remaining < 2000 || !(await permit(false))) return;
      await channels;
      const focus = s.mode === 'focus';
      await quiet(LN.schedule({ notifications: [{
        id: FOCUS_ID, channelId: 'focus',
        title: T(focus ? 'انتهت جلسة التركيز' : 'انتهت الاستراحة'),
        body: T(focus ? 'خذ استراحة قصيرة، ثم ابدأ الجلسة التالية.' : 'جاهز لجلسة تركيز جديدة؟'),
        schedule: { at: new Date(end), allowWhileIdle: true }
      }] }));
    })();
  });

  // Ask for notifications once, on the first launch, since prayer alerts are the point.
  (async () => {
    let asked = false;
    try { asked = localStorage.getItem('noon-native-asked') === '1'; } catch (_) {}
    if (!asked) {
      try { localStorage.setItem('noon-native-asked', '1'); } catch (_) {}
      await permit(true);
    }
    schedulePrayers(true);
  })();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) schedulePrayers(); });
  setInterval(() => schedulePrayers(), 60000);

  window.noonNative = { permit, schedulePrayers };
})();
