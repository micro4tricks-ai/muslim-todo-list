// Emulator check: the adhan stops on a volume key, the power key, or turning the phone face down.
// Starts the adhan through the app's own player (the Adhan plugin), presses or tilts, and reads
// the player's log. Usage: node adhan-silence.mjs <devtools port> <out dir>
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
const tries = {
  'volume up': () => adb('shell input keyevent KEYCODE_VOLUME_UP'),
  'volume down': () => adb('shell input keyevent KEYCODE_VOLUME_DOWN'),
  'volume up at the loudest': () => adb('shell input keyevent KEYCODE_VOLUME_UP'),
  'volume down at the quietest': () => adb('shell input keyevent KEYCODE_VOLUME_DOWN'),
  'power': () => adb('shell input keyevent KEYCODE_POWER'),
  'face down': () => faceDown(),
};

const report = { results: {}, problems: [] };
for (const [name, act] of Object.entries(tries)) {
  wake(); upright();
  alarmAt(/loudest/.test(name) ? 7 : /quietest/.test(name) ? 1 : 4);
  const alarmSet = alarmNow();
  await sleep(1500);
  adb('logcat -c');
  const started = await js(`(async () => { const A = window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.Adhan;
    if (!A) return 'no Adhan plugin';
    await A.test({ sound: 'adhan_madinah', title: 'test', body: 'test', stop: 'Stop' }); return 'ok'; })()`);
  await sleep(4000);
  const before = log();
  const playing = /playing,/.test(before);
  act();
  await sleep(3000);
  const after = log();
  const silenced = (after.match(/silenced by (.*)/) || [])[1] || null;
  const media = adb('shell dumpsys media_session').split('\n').filter((l) => /adhan|active=|volumeType|Sessions Stack/i.test(l)).slice(0, 12).join('\n');
  report.results[name] = { started, playing, silenced, log: after.split('\n').slice(-12).join('\n'), media };
  console.log(`${name}: playing=${playing} silenced=${silenced}`);
  if (!playing) report.problems.push(`${name}: the adhan did not start`);
  else if (!silenced) report.problems.push(`${name}: the adhan was not silenced`);
  await js(`Capacitor.Plugins.Adhan.stop()`);
  await sleep(1500);
  report.results[name].alarm = { set: alarmSet, after: alarmNow() };
  if (alarmSet && report.results[name].alarm.after !== alarmSet) report.problems.push(`${name}: the alarm volume was not put back (${alarmSet} -> ${report.results[name].alarm.after})`);
}
upright(); wake();
writeFileSync(`${out}/adhan-silence.json`, JSON.stringify(report, null, 2));
ws.close();
