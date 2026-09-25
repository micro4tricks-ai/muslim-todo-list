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
const js = async (e) => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); return r.result && r.result.value; };
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

// ---- A few minutes of normal use, measuring memory, freezes and crashes ----
const pkg = 'io.github.micro4tricks.muslimtodo';
const memory = () => {
  const lines = adb('shell dumpsys meminfo').split('\n').filter((l) => /K: .*(muslimtodo|webview|sandboxed_process)/i.test(l));
  return lines.map((l) => l.trim().replace(/\s*\(pid.*$/, '').replace(/org\.chromium\S*/, '')).slice(0, 4);
};
const alive = () => { try { return adb(`shell pidof ${pkg}`).trim() !== ''; } catch { return false; } };
const lag = async () => { const t0 = Date.now(); await js('1'); return Date.now() - t0; };
const gesture = (e) => send('Runtime.evaluate', { expression: e, userGesture: true, awaitPromise: true, returnByValue: true });
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
  for (const v of ['notes', 'cards', 'habits', 'adhkar', 'report', 'tasks']) { await gesture(`document.querySelector('.views [data-view="${v}"]').click()`); await sleep(1200); }
}, 4000);
await phase('open adhkar list', async () => {
  await gesture(`document.querySelector('.views [data-view="adhkar"]').click()`); await sleep(500);
  await gesture(`document.querySelector('.adhkar-cat').click()`); await sleep(500);
  await js('scrollTo(0, document.documentElement.scrollHeight); true');
}, 6000);
await phase('play mix: rain + fire', async () => { await js('scrollTo(0, 0); true'); await gesture(`document.getElementById('dockToggle').click(); document.querySelector('.preset').click()`); }, 30000);
await phase('play mix: 3 sounds', async () => { await gesture(`document.querySelectorAll('.preset')[2].click()`); }, 30000);
await phase('focus mode with sound', async () => { await gesture(`window.noonFocusMode.open()`); }, 15000);
await phase('close focus mode, stop sound', async () => { await gesture(`window.noonFocusMode.close(); document.getElementById('sndPlay').click()`); }, 8000);
await phase('app in background 20s, then back', async () => {
  adb('shell input keyevent HOME'); await sleep(20000);
  adb(`shell am start -n ${pkg}/.MainActivity`); await sleep(3000);
}, 6000);
report.errors = errors;
writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
ws.close();
