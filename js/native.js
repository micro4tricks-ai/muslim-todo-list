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
  const PRAYER_IDS = [1000, 2000], FOCUS_ID = 2000, SUNNAH_IDS = [3000, 4000];
  const SUNNAH_DAYS = 21;
  const quiet = (p) => Promise.resolve(p).catch(() => {});

  // Channels carry their own sound (a chime bundled in res/raw), because Android keeps a
  // channel's sound from the day it was made. The first channels had none, so they were
  // silent on many phones: v2 channels replace them.
  const CHIME = 'noon_chime.wav';
  const channels = (async () => {
    let cleaned = false;
    try { cleaned = localStorage.getItem('noon-channels') === 'v2'; } catch (_) {}
    if (!cleaned) {
      for (const id of ['prayer', 'focus', 'sunnah', 'adhan-madinah', 'adhan-fakhri', 'adhan-beautiful', 'adhan-azeez']) await quiet(LN.deleteChannel({ id }));
      try { localStorage.setItem('noon-channels', 'v2'); } catch (_) {}
    }
    await Promise.all([
      quiet(LN.createChannel({ id: 'alerts-v2', name: T('تنبيهات الصلاة'), importance: 5, visibility: 1, vibration: true, sound: CHIME })),
      quiet(LN.createChannel({ id: 'focus-v2', name: T('مؤقت التركيز'), importance: 4, visibility: 1, vibration: true, sound: CHIME })),
      quiet(LN.createChannel({ id: 'sunnah-v2', name: T('الصيام والمواسم والأذكار'), importance: 4, visibility: 1, vibration: true, sound: CHIME }))
    ]);
  })();
  // The adhan itself is played by the app's own player (AdhanService.java) through the
  // alarm volume, so a quiet notification sound can't swallow it.
  // Plugins added by the app itself (MainActivity.registerPlugin) show up in Capacitor.Plugins,
  // like the npm ones; Capacitor.registerPlugin only exists when @capacitor/core is bundled.
  const plugin = (name) => (C.Plugins && C.Plugins[name]) || (C.registerPlugin ? C.registerPlugin(name) : null);
  const Adhan = plugin('Adhan');
  // Tapping a reminder opens its card (or its section).
  quiet(LN.addListener('localNotificationActionPerformed', (a) => {
    const x = (a && a.notification && a.notification.extra) || {};
    setTimeout(() => {
      if (x.key) window.dispatchEvent(new CustomEvent('noon-reminder-tap', { detail: x }));
      else if (x.view && window.noonUI.go) window.noonUI.go(x.view);
    }, 400);
  }));

  async function permit(ask) {
    try {
      let p = await LN.checkPermissions();
      if (p.display !== 'granted' && ask) p = await LN.requestPermissions();
      return p.display === 'granted';
    } catch (_) { return false; }
  }

  // ---- prayers: the next few days, rebooked whenever the times or settings change ----
  const settings = () => Object.assign({ enabled: true, notify: true, before: 10, sound: 'madinah', fajrSound: '', iqamah: 0, silentOk: false }, load(PA_KEY, {}));
  // Notifications for the chime and the reminders (out), and the adhan times for the player (adhan).
  function plan() {
    const S = settings(), A = window.noonAstro;
    const out = [], adhan = [];
    if (!S.enabled || !S.notify || !A) return { out, adhan };
    const now = Date.now();
    for (let d = 0; d < DAYS; d++) {
      const epoch = now + d * 864e5;
      const snap = A.snapshot(epoch);
      const midnight = epoch - snap.nowH * 3600e3;
      PRAYERS.forEach((k, i) => {
        const h = snap.today[k];
        if (!Number.isFinite(h)) return;
        const at = Math.round((midnight + h * 3600e3) / 60000) * 60000;
        const name = T(NAMES[k]);
        const id = PRAYER_IDS[0] + d * 20 + i * 3; // due, before, iqamah
        const sound = k === 'fajr' && S.fajrSound ? S.fajrSound : S.sound;
        if (at > now + 5000 && sound !== 'chime') {
          adhan.push({ at, sound: `adhan_${sound}`, title: `${T('حان وقت صلاة')} ${name}`, body: T('حيّ على الصلاة'), stop: T('إيقاف الأذان'), silentOk: !!S.silentOk });
        } else if (at > now + 5000) {
          out.push({ id, channelId: 'alerts-v2', title: `${T('حان وقت صلاة')} ${name}`, body: T('حيّ على الصلاة'),
            schedule: { at: new Date(at), allowWhileIdle: true } });
        }
        const early = at - S.before * 60000;
        if (S.before > 0 && early > now + 5000) {
          out.push({ id: id + 1, channelId: 'alerts-v2', title: `${T('اقتربت صلاة')} ${name}`,
            body: `${T('باقي')} ${I.num(S.before)} ${T('دقيقة على صلاة')} ${name}. ${T('اختم ما بين يديك.')}`.trim(),
            schedule: { at: new Date(early), allowWhileIdle: true } });
        }
        const iq = at + (S.iqamah || 0) * 60000;
        if (S.iqamah > 0 && iq > now + 5000) {
          out.push({ id: id + 2, channelId: 'alerts-v2', title: `${T('الإقامة')}: ${name}`, body: T('قد قامت الصلاة، استووا واعتدلوا.'),
            schedule: { at: new Date(iq), allowWhileIdle: true } });
        }
      });
    }
    return { out, adhan };
  }
  let lastSig = null, busy = false, lastAdhan = '';
  async function schedulePrayers(force) {
    if (busy) return;
    busy = true;
    try {
      await channels;
      const { out: list, adhan } = plan();
      updateWidget();
      const adhanJson = JSON.stringify(adhan);
      if (Adhan && adhanJson !== lastAdhan) { await quiet(Adhan.schedule({ items: adhanJson })); lastAdhan = adhanJson; }
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

  // ---- the home-screen widget (PrayerWidget.java): the next seven days of prayer times ----
  const Widget = plugin('WidgetBridge');
  let widgetSig = '';
  function updateWidget() {
    const A = window.noonAstro;
    if (!Widget || !A) return;
    const now = Date.now(), days = [];
    let place = '';
    for (let d = 0; d < 7; d++) {
      const epoch = now + d * 864e5;
      const snap = A.snapshot(epoch);
      const midnight = epoch - snap.nowH * 3600e3;
      place = place || snap.place.name;
      days.push(PRAYERS.filter((k) => Number.isFinite(snap.today[k])).map((k) => ({
        name: T(NAMES[k]), at: Math.round((midnight + snap.today[k] * 3600e3) / 60000) * 60000, time: snap.fmtHM(snap.today[k])
      })));
    }
    const data = JSON.stringify({ title: `${place} · ${T('مواقيت الصلاة')}`, next: T('القادمة:'), empty: T('افتح التطبيق لتحديث المواقيت.'), days });
    if (data === widgetSig) return;
    widgetSig = data;
    quiet(Widget.update({ data }));
  }

  // The verse-of-the-day widget (VerseWidget.java), refreshed when the day changes.
  let verseSig = '';
  function updateVerse() {
    const N = window.noonSunnah;
    if (!Widget || !Widget.verse || !N || !N.verseOfDay) return;
    const v = N.verseOfDay();
    if (!v) return;
    const data = JSON.stringify({ title: T('آية اليوم'), text: I.isEn ? v.en : v.ar, ref: I.isEn ? v.refEn : v.refAr });
    if (data === verseSig) return;
    verseSig = data;
    quiet(Widget.verse({ data }));
  }
  // A widget or an icon shortcut opened the app on a section (MainActivity keeps it until asked).
  function openSection(view) {
    if (view === 'qibla') { const q = document.getElementById('qiblaBtn'); if (q) q.click(); return; }
    if (['quran', 'listen', 'adhkar', 'library', 'calendar'].includes(view)) window.noonUI.go(view);
  }
  window.noonTakeAction = async () => {
    if (!Widget || !Widget.takeAction) return;
    try { const r = await Widget.takeAction(); if (r && r.view) openSection(r.view); } catch (_) {}
  };
  addEventListener('load', () => setTimeout(() => { window.noonTakeAction(); updateVerse(); }, 600));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { window.noonTakeAction(); updateVerse(); } });
  setInterval(updateVerse, 30 * 60000);

  // ---- fasts, seasons, Friday, adhkar and wird (js/sunnah.js decides what and when) ----
  let sunnahSig = null, sunnahBusy = false;
  async function scheduleSunnah(force) {
    if (sunnahBusy || !window.noonSunnah) return;
    sunnahBusy = true;
    try {
      const now = Date.now();
      const list = window.noonSunnah.plan(now, SUNNAH_DAYS).filter((r) => r.at > now + 5000)
        .slice(0, SUNNAH_IDS[1] - SUNNAH_IDS[0])
        .map((r, k) => ({ id: SUNNAH_IDS[0] + k, channelId: 'sunnah-v2', title: r.title, body: r.body,
          largeBody: r.body, extra: { view: r.view || 'calendar', key: r.key }, schedule: { at: new Date(r.at), allowWhileIdle: true } }));
      const sig = list.map((n) => n.schedule.at.getTime() + n.title).join('|');
      if (sig === sunnahSig && !force) return;
      if (list.length && !(await permit(false))) return;
      await channels;
      const pending = await LN.getPending();
      const old = (pending.notifications || []).filter((n) => n.id >= SUNNAH_IDS[0] && n.id < SUNNAH_IDS[1]).map((n) => ({ id: n.id }));
      if (old.length) await LN.cancel({ notifications: old });
      if (list.length) await LN.schedule({ notifications: list });
      sunnahSig = sig;
    } catch (_) {
      sunnahSig = null;
    } finally { sunnahBusy = false; }
  }
  window.addEventListener('noon-sunnah', () => scheduleSunnah(true));
  window.addEventListener('noon-place', () => { schedulePrayers(true); scheduleSunnah(true); });

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
        id: FOCUS_ID, channelId: 'focus-v2',
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
    // js/sunnah.js loads after this file.
    setTimeout(() => scheduleSunnah(true), 1500);
  })();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { schedulePrayers(); scheduleSunnah(); } });
  setInterval(() => schedulePrayers(), 60000);
  setInterval(() => scheduleSunnah(), 15 * 60000);

  // Hear the adhan now through the app's player (from the prayer settings), or silence it.
  const adhanTest = (sound) => (Adhan ? quiet(Adhan.test({ sound: `adhan_${sound}`, title: T('الأذان'), body: T('تجربة صوت الأذان'), stop: T('إيقاف الأذان') })) : null);
  const adhanStop = () => (Adhan ? quiet(Adhan.stop()) : null);
  // A test notification in five seconds, asking for permission first if needed.
  async function testNotify() {
    if (!(await permit(true))) return false;
    await channels;
    await quiet(LN.schedule({ notifications: [{ id: 2999, channelId: 'alerts-v2', title: T('تجربة التنبيهات'), body: T('إذا ظهر هذا الإشعار بصوت، فالتنبيهات تعمل.'),
      schedule: { at: new Date(Date.now() + 5000), allowWhileIdle: true } }] }));
    schedulePrayers(true);
    scheduleSunnah(true);
    return true;
  }
  window.noonNative = { permit, schedulePrayers, scheduleSunnah, adhanTest, adhanStop, testNotify };
})();
