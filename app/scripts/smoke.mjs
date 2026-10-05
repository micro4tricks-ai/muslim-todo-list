// Emulator check for the debug build: connects to the app's WebView over adb
// and reports what a person would notice (scrolling, errors, booked alerts).
// Usage: node smoke.mjs <devtools port> <out dir>
import { writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const [,, port, out] = process.argv;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const adb = (cmd) => execSync(`adb ${cmd}`, { encoding: 'utf8' });

let targets = [];
for (let i = 0; i < 40 && !targets.length; i++) {
  try { targets = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).filter((t) => t.type === 'page'); } catch { /* not up yet */ }
  if (!targets.length) await sleep(500);
}
if (!targets.length) { console.log('No WebView page found'); process.exit(1); }
const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pend = new Map(); const errors = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('console: ' + m.params.args.map((a) => a.value || a.description).join(' '));
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
// Every call gives up after 20 s, so a page that went away fails the check instead of hanging it.
const timed = (p) => Promise.race([p, sleep(20000).then(() => null)]);
const js = async (e) => { const r = await timed(send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true })); return r && r.result && r.result.value; };
await send('Runtime.enable');
await send('Page.enable');
// Record every task that blocks the page for more than 50 ms.
await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__long = [];
  try { new PerformanceObserver((l) => l.getEntries().forEach((e) => __long.push([Math.round(e.startTime), Math.round(e.duration)]))).observe({ type: 'longtask', buffered: true }); } catch (e) {}` });
await send('Page.reload'); await sleep(8000);

const report = {};
report.timing = await js(`(() => { const n = performance.getEntriesByType('navigation')[0]; const f = performance.getEntriesByName('first-contentful-paint')[0];
  return { firstPaintMs: f && Math.round(f.startTime), readyMs: Math.round(n.domContentLoadedEventEnd), loadMs: Math.round(n.loadEventEnd) }; })()`);
await send('Performance.enable');
const metric = async () => (await send('Performance.getMetrics')).metrics.find((m) => m.name === 'TaskDuration').value;
const m0 = await metric(); await sleep(5000);
report.busyWhileIdlePercent = Math.round((await metric() - m0) / 5 * 100);
// The welcome steps open by themselves on the first launch; go through them like a new user.
report.welcome = await js(`(async () => {
  const st = document.getElementById('settingsScreen');
  if (!st || st.hidden || !st.classList.contains('is-wizard')) return 'not shown';
  const seen = [];
  for (let k = 0; k < 8 && !st.hidden; k++) { seen.push(st.dataset.page); document.querySelector('#settingsScreen .st-next').click(); await new Promise((r) => setTimeout(r, 700)); }
  return seen.join(' > ') + (st.hidden ? ' > done' : ' > STUCK');
})()`);
console.log('welcome:', report.welcome);
report.page = await js(`({
  ua: navigator.userAgent.replace(/^.*(Chrome\/[0-9.]+).*$/, '$1'),
  classes: document.documentElement.className, native: !!window.noonNative,
  innerHeight, scrollHeight: document.documentElement.scrollHeight,
  htmlOverflow: getComputedStyle(document.documentElement).overflowY, bodyOverflow: getComputedStyle(document.body).overflowY,
  bodyHeight: getComputedStyle(document.body).height, bodyDisplay: getComputedStyle(document.body).display,
  scrollingElement: document.scrollingElement && document.scrollingElement.tagName,
  insetTop: getComputedStyle(document.body).paddingTop
})`);
const size = adb('shell wm size').match(/(\d+)x(\d+)/g).pop().split('x').map(Number);
const [w, h] = size;
adb(`shell input swipe ${Math.round(w / 12)} ${Math.round(h * 0.8)} ${Math.round(w / 12)} ${Math.round(h * 0.2)} 600`);
await sleep(2000);
report.scrollAfterEdgeSwipe = await js('scrollY');
await js('scrollTo(0, 0); true'); await sleep(500);
adb(`shell input swipe ${Math.round(w / 2)} ${Math.round(h * 0.8)} ${Math.round(w / 2)} ${Math.round(h * 0.2)} 600`);
await sleep(2000);
report.scrollAfterMiddleSwipe = await js('scrollY');
report.scrollByScript = await js('scrollTo(0, 400), scrollY');
await js('scrollTo(0, 0); true');
report.alerts = await js(`(async () => {
  const LN = Capacitor.Plugins.LocalNotifications;
  const p = await LN.getPending();
  let exact = null; try { exact = (await LN.checkExactNotificationSetting()).exact_alarm; } catch (e) { exact = 'n/a'; }
  const n = p.notifications || [];
  return { pending: n.length, exactAlarms: exact, first: n.slice(0, 3).map((x) => x.title + ' @ ' + new Date(x.schedule.at).toISOString()) };
})()`);

// Your own reminder ("remind me" on a task, an hour from now): booked with the phone, so it rings with the app closed.
report.reminder = await js(`(async () => {
  const RM = window.noonReminders, LN = Capacitor.Plugins.LocalNotifications;
  if (!RM) return 'no reminders module';
  const t = window.noonTasks.add('Smoke test reminder');
  RM.ask({ kind: 'task', ref: String(t.id), title: t.title });
  await new Promise((r) => setTimeout(r, 400));
  const sheet = document.querySelector('.rm-sheet');
  const hour = [...sheet.querySelectorAll('.rm-chips .chip')].find((c) => /^(بعد ساعة|In an hour)$/.test(c.textContent));
  if (!hour) return 'no "in an hour" choice';
  hour.click();
  sheet.querySelector('.form-actions .btn-primary').click();
  await new Promise((r) => setTimeout(r, 4000));
  const booked = ((await LN.getPending()).notifications || []).filter((n) => n.id >= 5000 && n.id < 5500);
  const mine = booked.find((n) => n.title === 'Smoke test reminder');
  RM.dropFor('task', String(t.id));
  return mine ? { booked: true, inMinutes: Math.round((new Date(mine.schedule.at) - Date.now()) / 60000), rid: !!(mine.extra && mine.extra.rid) } : { booked: false, pending: booked.length };
})()`);
console.log('reminder:', JSON.stringify(report.reminder));

// ---- A few minutes of normal use, measuring memory, freezes and crashes ----
const pkg = 'io.github.micro4tricks.muslimtodo';
const memory = () => {
  const lines = adb('shell dumpsys meminfo').split('\n').filter((l) => /K: .*(muslimtodo|webview|sandboxed_process)/i.test(l));
  return lines.map((l) => l.trim().replace(/\s*\(pid.*$/, '').replace(/org\.chromium\S*/, '')).slice(0, 4);
};
const alive = () => { try { return adb(`shell pidof ${pkg}`).trim() !== ''; } catch { return false; } };
const lag = async () => { const t0 = Date.now(); await js('1'); return Date.now() - t0; };
const gesture = (e) => timed(send('Runtime.evaluate', { expression: e, userGesture: true, awaitPromise: true, returnByValue: true }));
let seen = await js('__long.length');
report.phases = [];
async function phase(name, run, waitMs) {
  let error = null;
  try { await run(); } catch (e) { error = String(e); }
  const lags = [];
  for (let t = 0; t < waitMs; t += 2000) { await sleep(2000); lags.push(await Promise.race([lag(), sleep(10000).then(() => 10000)])); }
  const all = (await Promise.race([js('__long'), sleep(10000).then(() => null)])) || [];
  const fresh = all.slice(seen); seen = all.length;
  report.phases.push({ name, error, appRunning: alive(), worstResponseMs: Math.max(0, ...lags),
    freezes: fresh.length, longestFreezeMs: Math.max(0, ...fresh.map((x) => x[1])), memory: memory() });
  console.log(JSON.stringify(report.phases.at(-1)));
}
await phase('idle', async () => {}, 8000);
await phase('switch every tab', async () => {
  for (const v of ['quran', 'listen', 'library', 'calendar', 'notes', 'cards', 'habits', 'adhkar', 'report', 'tasks']) { await gesture(`document.querySelector('.views [data-view="${v}"]').click()`); await sleep(1200); }
}, 4000);
await phase('open adhkar list', async () => {
  await gesture(`document.querySelector('.views [data-view="adhkar"]').click()`); await sleep(500);
  await gesture(`document.querySelector('.adhkar-cat').click()`); await sleep(500);
  await js('scrollTo(0, document.documentElement.scrollHeight); true');
}, 6000);
await phase('Mushaf: al-Baqarah, scroll through', async () => {
  await gesture('window.noonQuran.openSurah(2)'); await sleep(3000);
  for (let k = 0; k < 6; k++) { await js("document.querySelector('.qr-body').scrollBy(0, 2500); true"); await sleep(700); }
}, 8000);
await phase('Mushaf: close', async () => { await js("history.back(); true"); }, 4000);
await phase('Library: Sahih al-Bukhari, first book', async () => {
  await gesture("window.noonLibrary.open('home')"); await sleep(500);
  await gesture("document.querySelector('.lib-book').click()"); await sleep(500);
  await gesture("document.querySelector('.lib-sec').click()"); await sleep(4000);
  await js('scrollTo(0, document.documentElement.scrollHeight); true');
}, 6000);
// The Listen tab: the mp3quran.net lists load, a station plays, and the adhan can reach the page.
await phase('Listen: the Quran radios on the native player', async () => {
  await gesture("window.noonUI.go('listen')"); await sleep(1500);
  await gesture("[...document.querySelectorAll('#view-listen .ls-tabs .chip')][0].click()"); await sleep(6000);
  report.listen = await js(`({ stations: document.querySelectorAll('#view-listen .ls-row').length,
    live: [...document.querySelectorAll('#view-listen .ls-live-t')].map((n) => n.textContent),
    nativePlayer: !!Capacitor.Plugins.Player, nativeHttp: !!Capacitor.Plugins.CapacitorHttp })`);
  report.listen.radios = [];
  // The featured stations (Cairo, then Saudi Arabia: both on radiojar, which redirects to http),
  // then the first reciter's station.
  const picks = ["document.querySelectorAll('#view-listen .ls-live')[0]", "document.querySelectorAll('#view-listen .ls-live')[1]", "document.querySelector('#view-listen .ls-pick')"];
  for (const p of picks) {
    await gesture(`${p} && ${p}.click()`); await sleep(14000);
    const st = await js("document.querySelector('.lp').dataset.state + ' | ' + document.querySelector('.lp-title').textContent");
    const ms = adb('shell dumpsys media_session').split('\n').filter((l) => /state=PlaybackState|muslimtodo/.test(l)).slice(0, 2).map((x) => x.trim());
    report.listen.radios.push({ state: st, mediaSession: ms });
  }
  report.listen.playerLog = adb('logcat -d -s NoonPlayer:*').split('\n').filter(Boolean).slice(-6);
  // Downloads for listening offline: one short surah (al-Fatiha, al-Afasy; the server redirects) in and out.
  report.listen.download = await js(`(async () => {
    try {
      const P = Capacitor.Plugins.Player;
      const got = await P.download({ id: 'smoke_test', url: 'https://server8.mp3quran.net/afs/001.mp3' });
      const list = await P.downloads();
      const there = (list.items || []).some((x) => x.id === 'smoke_test');
      await P.remove({ id: 'smoke_test' });
      return { size: got.size, listed: there, local: /^file:/.test(got.path) };
    } catch (e) { return 'ERR ' + (e.code || '') + ' ' + e.message; }
  })()`);
  console.log('listen:', JSON.stringify(report.listen));
  await gesture('window.noonListen.stop()'); await sleep(1500);
  // Live TV: in the app the broadcaster's own stream (Aloula, HLS up to 1080p) plays first, in the
  // WebView; the next source, YouTube, must open inside the app, not in the browser.
  await gesture("[...document.querySelectorAll('#view-listen .ls-tabs .chip')][1].click()"); await sleep(3000);
  await js("window.__tv = []; addEventListener('message', (e) => { if (e.data && e.data.noonTv) __tv.push(e.data.noonTv + (e.data.code !== undefined ? ':' + e.data.code : '')); }); true");
  const tvInfo = `(() => { const v = document.querySelector('#view-listen video');
    return { video: v && !v.hidden ? { time: Math.round(v.currentTime), width: v.videoWidth, height: v.videoHeight, paused: v.paused, error: v.error && v.error.code } : 'hidden',
      youtube: !!document.querySelector('#view-listen .tv-yt'), note: document.querySelector('#view-listen .tv-frame + .hint').textContent,
      swap: document.querySelector('#view-listen button.tv-swap').textContent }; })()`;
  await gesture("document.querySelector('#view-listen .tv-chan').click()"); await sleep(25000);
  report.liveTv = await js(tvInfo);
  console.log('live TV (official stream):', JSON.stringify(report.liveTv));
  await gesture("document.querySelector('#view-listen button.tv-swap').click()"); await sleep(15000);
  const top = adb('shell dumpsys activity activities').split('\n').find((l) => /ResumedActivity/.test(l)) || '';
  report.liveTvNext = Object.assign(await js(tvInfo), { appInFront: top.includes(pkg), said: await js('window.__tv') });
  console.log('live TV (next source):', JSON.stringify(report.liveTvNext));
  if (!top.includes(pkg)) { adb(`shell am start -n ${pkg}/.MainActivity`); await sleep(3000); }
  await gesture("window.noonUI.go('tasks')");
}, 4000);
// Settings: every page opens, a font applies, and the phone's back key steps back out of it.
await phase('Settings: every page, a font, the back key', async () => {
  await gesture("document.getElementById('quickSettings').click()"); await sleep(1500);
  report.settings = { pages: {} };
  const ids = await js("[...document.querySelectorAll('#settingsScreen .st-row[data-page]')].map((r) => r.dataset.page)");
  for (const id of ids || []) {
    await gesture(`document.querySelector('#settingsScreen .st-row[data-page="${id}"]').click()`); await sleep(1200);
    report.settings.pages[id] = await js("document.querySelector('#settingsScreen .st-title').textContent + ' | ' + Math.round(document.querySelector('#settingsScreen .st-body').scrollHeight) + 'px'");
    adb('shell input keyevent BACK'); await sleep(1200);
  }
  await gesture("document.querySelector('#settingsScreen .st-row[data-page=\"fonts\"]').click()"); await sleep(1200);
  await gesture("[...document.querySelectorAll('#settingsScreen .st-choice')][1].click()"); await sleep(2500);
  report.settings.font = await js("getComputedStyle(document.body).fontFamily + ' | loaded: ' + [...document.fonts].some((f) => f.family === 'Cairo' && f.status === 'loaded')");
  await gesture("[...document.querySelectorAll('#settingsScreen .st-choice')][0].click()"); await sleep(800);
  adb('shell input keyevent BACK'); await sleep(1000);
  adb('shell input keyevent BACK'); await sleep(1500);
  report.settings.closedByBack = await js("document.getElementById('settingsScreen').hidden");
  report.settings.appStillOpen = alive() && (adb('shell dumpsys activity activities').split('\n').find((l) => /ResumedActivity/.test(l)) || '').includes(pkg);
  // Reliability: what the phone allows, as the adhan page shows it.
  report.settings.device = await js("(async () => { try { return await Capacitor.Plugins.Device.status(); } catch (e) { return 'ERR ' + e.message; } })()");
  report.settings.reliabilityCard = await js("(document.querySelector('.rel .rel-head b') || {}).textContent || 'none'");
  // A minute added to Fajr moves Fajr by exactly one minute, then back.
  report.settings.offset = await js(`(async () => {
    const t = Date.now(), before = window.noonAstro.snapshot(t).today.fajr;
    window.noonSettings.open('place'); await new Promise((r) => setTimeout(r, 800));
    const plus = [...document.querySelectorAll('#ppOffsets .pp-off')][0].querySelectorAll('button')[1];
    plus.click(); await new Promise((r) => setTimeout(r, 300));
    const after = window.noonAstro.snapshot(t).today.fajr;
    [...document.querySelectorAll('#ppOffsets .pp-off')][0].querySelectorAll('button')[0].click();
    history.back(); await new Promise((r) => setTimeout(r, 300)); history.back();
    return Math.round((after - before) * 60);
  })()`);
  // The new books open.
  await gesture("window.noonUI.go('library')"); await sleep(1200);
  report.settings.books = await js("document.querySelectorAll('#view-library .lib-book').length");
  console.log('settings:', JSON.stringify(report.settings));
}, 3000);
// The native adhan player: it must start (a foreground service), play, and stop cleanly.
await phase('Adhan player: play, then stop', async () => {
  // Call the plugin directly, so any error is reported instead of swallowed.
  report.adhanCall = await js(`(async () => {
    try {
      const C = window.Capacitor;
      const A = C.Plugins.Adhan, W = C.Plugins.WidgetBridge;
      if (!A || !W) return 'ERR plugins missing: Adhan ' + !!A + ', WidgetBridge ' + !!W;
      await A.test({ sound: 'adhan_azeez', title: 'test', body: 'test', stop: 'Stop' });
      return 'ok';
    } catch (e) { return 'ERR ' + (e && (e.code || '') + ' ' + e.message); }
  })()`);
  console.log('adhan call:', report.adhanCall);
  // The widget's data and the booked adhan times, as the app saved them (debug builds allow run-as).
  const prefs = (f) => { try { return adb(`shell run-as ${pkg} cat shared_prefs/${f}.xml`); } catch (e) { return ''; } };
  const w = prefs('noon_widget'), a = prefs('noon_adhan');
  report.widgetHasTimes = /&quot;at&quot;/.test(w);
  report.verseWidget = /name="verse"/.test(w);
  report.autoCatalog = /folders/.test(prefs('noon_auto'));
  report.adhanBooked = Number((a.match(/name="count" value="(\d+)"/) || [])[1] || 0);
  console.log('widget has prayer times:', report.widgetHasTimes, '| adhan alarms booked:', report.adhanBooked);
  await sleep(3000);
  const services = adb(`shell dumpsys activity services ${pkg}`);
  report.adhanServiceRunning = /AdhanService/.test(services);
  // What the player said (AdhanService logs as NoonAdhan); the emulator here usually has no sound card.
  report.adhanLog = adb('logcat -d -s NoonAdhan:* AndroidRuntime:E').split('\n').filter((l) => /NoonAdhan|AndroidRuntime/.test(l)).slice(-8);
  console.log('adhan service running:', report.adhanServiceRunning, JSON.stringify(report.adhanLog));
  await gesture('window.noonNative && window.noonNative.adhanStop()'); await sleep(1500);
}, 4000);
await phase('Tools and my prayers', async () => {
  await gesture("window.noonLibrary.open('tool', 'zakat')"); await sleep(800);
  await gesture("window.noonUI.go('habits')"); await sleep(800);
}, 4000);
await phase('play mix: rain + fire', async () => { await js('scrollTo(0, 0); true'); await gesture(`document.getElementById('dockToggle').click(); document.querySelector('.preset').click()`); }, 30000);
// The app doesn't carry the focus sounds: the ones just played came from the website and are kept.
report.soundsKept = await js("(async () => { try { const b = await caches.open('sounds-v1'); return (await b.keys()).length; } catch (e) { return 'ERR ' + e.message; } })()");
console.log('focus sounds kept on the phone:', report.soundsKept);
await phase('play mix: 3 sounds', async () => { await gesture(`document.querySelectorAll('.preset')[2].click()`); }, 30000);
await phase('focus mode with sound', async () => { await gesture(`window.noonFocusMode.open()`); }, 15000);
await phase('close focus mode, stop sound', async () => { await gesture(`window.noonFocusMode.close(); document.getElementById('sndPlay').click()`); }, 8000);
await phase('app in background 20s, then back', async () => {
  adb('shell input keyevent HOME'); await sleep(20000);
  adb(`shell am start -n ${pkg}/.MainActivity`); await sleep(3000);
}, 6000);
report.errors = errors;

// ---- If Android stops the page's renderer, the app must reopen its screen, not close ----
send('Page.crash').catch(() => {});
await sleep(12000);
let pagesAfter = [];
try { pagesAfter = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).filter((t) => t.type === 'page'); } catch { /* none */ }
let reopened = null;
if (pagesAfter.length) {
  const w2 = new WebSocket(pagesAfter[0].webSocketDebuggerUrl);
  await new Promise((r) => w2.addEventListener('open', r));
  reopened = await new Promise((r) => {
    w2.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id === 1) r(m.result && m.result.result && m.result.result.value); });
    w2.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: `document.title + ' | tabs: ' + document.querySelectorAll('.views button').length`, returnByValue: true } }));
    setTimeout(() => r('no answer'), 5000);
  });
  w2.close();
}
report.afterRendererCrash = { appRunning: alive(), page: reopened };
// What a person would call broken; the workflow fails when this list isn't empty.
const problems = [];
report.phases.forEach((p) => { if (!p.appRunning) problems.push(`app not running after "${p.name}"`); if (p.error) problems.push(`${p.name}: ${p.error}`); });
((report.listen && report.listen.radios) || []).forEach((r) => { if (!/^playing/.test(r.state)) problems.push(`radio not playing: ${r.state}`); });
if (!report.listen || !report.listen.radios) problems.push('the radio check did not run');
if (!report.listen || !report.listen.download || !report.listen.download.listed || !(report.listen.download.size > 10000)) problems.push(`download: ${JSON.stringify(report.listen && report.listen.download)}`);
if (!report.liveTv || !report.liveTv.video || report.liveTv.video.paused !== false) problems.push('live TV did not play');
if (!report.settings || report.settings.closedByBack !== true) problems.push('the back key did not close Settings');
if (!report.settings || report.settings.appStillOpen !== true) problems.push('the back key closed the app');
if (!/> done$/.test(report.welcome || '')) problems.push(`welcome steps: ${report.welcome}`);
if (report.adhanCall !== 'ok') problems.push(`adhan: ${report.adhanCall}`);
if (!report.settings || !report.settings.device || typeof report.settings.device !== 'object') problems.push(`device status: ${report.settings && report.settings.device}`);
if (!report.settings || report.settings.offset !== 1) problems.push(`a minute added to Fajr moved it by ${report.settings && report.settings.offset}`);
if (!report.widgetHasTimes) problems.push('the widget has no prayer times');
if (!(report.soundsKept > 0)) problems.push(`focus sounds were not downloaded and kept: ${report.soundsKept}`);
if (!report.verseWidget) problems.push('the verse widget got no verse');
if (!report.autoCatalog) problems.push('Android Auto got no station list');
if (!report.reminder || report.reminder.booked !== true || !(report.reminder.inMinutes >= 55 && report.reminder.inMinutes <= 61)) problems.push(`a reminder was not booked with the phone: ${JSON.stringify(report.reminder)}`);
if (!report.afterRendererCrash.appRunning) problems.push('the app closed after the renderer crash');
report.problems = problems;
writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
ws.close();
