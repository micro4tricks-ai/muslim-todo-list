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
await send('Page.reload'); await sleep(8000);

const report = {};
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
report.errors = errors;
writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
ws.close();
