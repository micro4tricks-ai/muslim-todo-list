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

  const channels = Promise.all([
    quiet(LN.createChannel({ id: 'prayer', name: T('تنبيهات الصلاة'), importance: 5, visibility: 1, vibration: true })),
    quiet(LN.createChannel({ id: 'focus', name: T('مؤقت التركيز'), importance: 4, visibility: 1, vibration: true })),
    quiet(LN.createChannel({ id: 'sunnah', name: T('الصيام والمواسم والأذكار'), importance: 4, visibility: 1, vibration: true }))
  ]);
  // Tapping a reminder opens its card (or its section).
  quiet(LN.addListener('localNotificationActionPerformed', (a) => {
    const x = (a && a.notification && a.notification.extra) || {};
    setTimeout(() => {
      if (x.key) window.dispatchEvent(new CustomEvent('noon-reminder-tap', { detail: x }));
      else if (x.view && window.noonUI.go) window.noonUI.go(x.view);
    }, 400);
  }));
  // One channel per adhan: Android fixes a channel's sound when it is created.
  const adhanChannels = {};
  function adhanChannel(sound) {
    if (!sound || sound === 'chime') return Promise.resolve('prayer');
    if (!adhanChannels[sound]) {
      adhanChannels[sound] = quiet(LN.createChannel({ id: `adhan-${sound}`, name: `${T('الأذان')}: ${T(ADHAN_NAMES[sound] || sound)}`,
        importance: 5, visibility: 1, vibration: true, sound: `adhan_${sound}.mp3` })).then(() => `adhan-${sound}`);
    }
    return adhanChannels[sound];
  }
  const ADHAN_NAMES = { madinah: 'أذان من المسجد النبوي', fakhri: 'أذان بصوت صباح فخري', beautiful: 'أذان هادئ', azeez: 'أذان بصوت عاقب عزيز' };

  async function permit(ask) {
    try {
      let p = await LN.checkPermissions();
      if (p.display !== 'granted' && ask) p = await LN.requestPermissions();
      return p.display === 'granted';
    } catch (_) { return false; }
  }

  // ---- prayers: the next few days, rebooked whenever the times or settings change ----
  const settings = () => Object.assign({ enabled: true, notify: true, before: 10, sound: 'madinah', fajrSound: '', iqamah: 0 }, load(PA_KEY, {}));
  // channels: { fajr, other } notification channels for the moment each prayer is due.
  function plan(channels) {
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
        const id = PRAYER_IDS[0] + d * 20 + i * 3; // due, before, iqamah
        if (at > now + 5000) {
          out.push({ id, channelId: (k === 'fajr' ? channels.fajr : channels.other) || 'prayer', title: `${T('حان وقت صلاة')} ${name}`, body: T('حيّ على الصلاة'),
            schedule: { at: new Date(at), allowWhileIdle: true } });
        }
        const early = at - S.before * 60000;
        if (S.before > 0 && early > now + 5000) {
          out.push({ id: id + 1, channelId: 'prayer', title: `${T('اقتربت صلاة')} ${name}`,
            body: `${T('باقي')} ${I.num(S.before)} ${T('دقيقة على صلاة')} ${name}. ${T('اختم ما بين يديك.')}`.trim(),
            schedule: { at: new Date(early), allowWhileIdle: true } });
        }
        const iq = at + (S.iqamah || 0) * 60000;
        if (S.iqamah > 0 && iq > now + 5000) {
          out.push({ id: id + 2, channelId: 'prayer', title: `${T('الإقامة')}: ${name}`, body: T('قد قامت الصلاة، استووا واعتدلوا.'),
            schedule: { at: new Date(iq), allowWhileIdle: true } });
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
      await channels;
      const S = settings();
      const due = { other: await adhanChannel(S.sound), fajr: await adhanChannel(S.fajrSound || S.sound) };
      const list = plan(due);
      updateWidget();
      const sig = due.fajr + due.other + '|' + list.map((n) => n.id + '@' + n.schedule.at.getTime() + n.title).join('|');
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
  const Widget = C.registerPlugin ? C.registerPlugin('WidgetBridge') : null;
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

  // ---- fasts, seasons, Friday, adhkar and wird (js/sunnah.js decides what and when) ----
  let sunnahSig = null, sunnahBusy = false;
  async function scheduleSunnah(force) {
    if (sunnahBusy || !window.noonSunnah) return;
    sunnahBusy = true;
    try {
      const now = Date.now();
      const list = window.noonSunnah.plan(now, SUNNAH_DAYS).filter((r) => r.at > now + 5000)
        .slice(0, SUNNAH_IDS[1] - SUNNAH_IDS[0])
        .map((r, k) => ({ id: SUNNAH_IDS[0] + k, channelId: 'sunnah', title: r.title, body: r.body,
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
    // js/sunnah.js loads after this file.
    setTimeout(() => scheduleSunnah(true), 1500);
  })();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { schedulePrayers(); scheduleSunnah(); } });
  setInterval(() => schedulePrayers(), 60000);
  setInterval(() => scheduleSunnah(), 15 * 60000);

  window.noonNative = { permit, schedulePrayers, scheduleSunnah };
})();
