// Emulator check: the adhan stops on a volume key, the power key, or turning the phone face down,
// and keeps playing when the user did nothing (another stream's volume changes, the screen times
// out). Starts the adhan through the app's own player (the Adhan plugin), presses or tilts, and
// reads the player's log. Usage: node adhan-silence.mjs <devtools port> <out dir>
import { writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const [,, port, out] = process.argv;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const adb = (cmd) => { try { return execSync(`adb ${cmd}`, { encoding: 'utf8' }); } catch (e) { return String(e.stdout || '') + String(e.message); } };

let targets = [];
for (let i = 0; i < 40 && !targets.length; i++) {
  try { targets = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).filter((t) => t.type === 'page'); } catch { /* not up yet */ }
  if (!targets.length) await sleep(500);
}
if (!targets.length) { console.log('No WebView page found'); process.exit(1); }
const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pend = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const js = async (e) => { const r = await Promise.race([send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }), sleep(20000)]); return r && r.result && r.result.value; };

const upright = () => adb('emu sensor set acceleration 0:9.81:0');
const faceDown = () => adb('emu sensor set acceleration 0:0:-9.81');
const wake = () => { adb('shell input keyevent KEYCODE_WAKEUP'); adb('shell wm dismiss-keyguard'); };
const log = () => adb('logcat -d -s NoonAdhan:*');

const alarmAt = (n) => adb(`shell cmd media_session volume --stream 4 --set ${n}`);
const alarmNow = () => (adb('shell cmd media_session volume --stream 4 --get').match(/volume is (\d+)/) || [])[1];
const sleepScreen = () => adb('shell input keyevent KEYCODE_SLEEP');
const timeoutWas = (adb('shell settings get system screen_off_timeout').match(/\d+/) || ['600000'])[0];
// act: what is done once the adhan plays; stop: whether it must silence it; off: the screen is
// off when the adhan starts; wait: how long to watch after the act.
const tries = {
  'volume up': { act: () => adb('shell input keyevent KEYCODE_VOLUME_UP'), stop: true },
  'volume down': { act: () => adb('shell input keyevent KEYCODE_VOLUME_DOWN'), stop: true },
  'volume up at the loudest': { act: () => adb('shell input keyevent KEYCODE_VOLUME_UP'), stop: true },
  'volume down at the quietest': { act: () => adb('shell input keyevent KEYCODE_VOLUME_DOWN'), stop: true },
  'power, screen off': { act: () => adb('shell input keyevent KEYCODE_POWER'), stop: true, off: true },
  'face down': { act: () => faceDown(), stop: true },
  'media volume changed': { act: () => adb('shell cmd media_session volume --stream 3 --set 2'), stop: false },
  'screen timeout': { act: () => {}, stop: false, timeout: 15000, wait: 22000 },
};

const report = { results: {}, problems: [] };
for (const [name, t] of Object.entries(tries)) {
  wake(); upright();
  if (t.timeout) adb(`shell settings put system screen_off_timeout ${t.timeout}`);
  alarmAt(/loudest/.test(name) ? 7 : /quietest/.test(name) ? 1 : 4);
  const alarmSet = alarmNow();
  await sleep(1500);
  if (t.off) { sleepScreen(); await sleep(1500); }
  adb('logcat -c');
  const started = await js(`(async () => { const A = window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.Adhan;
    if (!A) return 'no Adhan plugin';
    await A.test({ sound: 'adhan_madinah', title: 'test', body: 'test', stop: 'Stop' }); return 'ok'; })()`);
  await sleep(4000);
  const before = log();
  const playing = /playing,/.test(before);
  t.act();
  await sleep(t.wait || 3000);
  const after = log();
  const silenced = (after.match(/silenced by (.*)/) || [])[1] || null;
  const media = adb('shell dumpsys media_session').split('\n').filter((l) => /adhan|active=|volumeType|Sessions Stack/i.test(l)).slice(0, 12).join('\n');
  report.results[name] = { started, playing, silenced, log: after.split('\n').slice(-12).join('\n'), media };
  console.log(`${name}: playing=${playing} silenced=${silenced}`);
  if (!playing) report.problems.push(`${name}: the adhan did not start`);
  else if (t.stop && !silenced) report.problems.push(`${name}: the adhan was not silenced`);
  else if (!t.stop && silenced) report.problems.push(`${name}: the adhan stopped though the user did nothing (${silenced})`);
  if (t.timeout) adb(`shell settings put system screen_off_timeout ${timeoutWas}`);
  await js(`Capacitor.Plugins.Adhan.stop()`);
  await sleep(1500);
  report.results[name].alarm = { set: alarmSet, after: alarmNow() };
  if (alarmSet && report.results[name].alarm.after !== alarmSet) report.problems.push(`${name}: the alarm volume was not put back (${alarmSet} -> ${report.results[name].alarm.after})`);
}
upright(); wake();
writeFileSync(`${out}/adhan-silence.json`, JSON.stringify(report, null, 2));
ws.close();
