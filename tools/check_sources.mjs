// Checks every outside service the site and the app read from, and prints one line per source.
// Exits with 1 when something people use is down, so the daily workflow turns red and GitHub
// sends an email. Usage: node tools/check_sources.mjs [--json out.json]
import { readFileSync, writeFileSync } from 'node:fs';

const live = JSON.parse(readFileSync(new URL('../live.json', import.meta.url), 'utf8'));
const UA = { 'User-Agent': 'Mozilla/5.0 (muslim-todo-list source check)' };
const results = [];

async function get(url, opts = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), opts.timeout || 20000);
  try {
    const r = await fetch(url, { headers: { ...UA, ...(opts.range ? { Range: 'bytes=0-4095' } : {}) }, signal: ctl.signal, redirect: 'follow' });
    // Live streams never end: only their answer counts, so the rest is dropped.
    const body = opts.text ? await r.text() : opts.json ? await r.json() : (r.body && await r.body.cancel().catch(() => {}), null);
    return { ok: r.ok, status: r.status, body };
  } catch (e) {
    return { ok: false, status: e.name === 'AbortError' ? 'timeout' : 'network' };
  } finally { clearTimeout(t); }
}
// name, what it feeds in the app, the app's fallback, the check itself; minor ones never fail the run.
async function check(name, feeds, fallback, run, minor = false) {
  let r;
  try { r = await run(); } catch (e) { r = { ok: false, note: String(e.message || e) }; }
  results.push({ name, feeds, fallback, ok: !!r.ok, minor, note: r.note || '' });
  console.log(`${r.ok ? 'OK  ' : minor ? 'WARN' : 'DOWN'} ${name} — ${r.note || ''}`);
}
const playlist = async (url) => { const r = await get(url, { text: true }); return r.ok && String(r.body).trimStart().startsWith('#EXTM3U'); };
const audio = async (url) => (await get(url, { range: true })).ok;
const firstOk = async (urls, test) => { for (const u of urls) if (await test(u)) return u; return null; };

// ---- live TV and extra stations (live.json) ----
for (const ch of live.tv) {
  await check(`TV: ${ch.en}`, 'Listen › Live TV', 'the next link in live.json, then mp3quran.net', async () => {
    const u = await firstOk(ch.urls, playlist);
    return { ok: !!u, note: u ? `plays from ${new URL(u).host}` : 'no link answers' };
  });
}
for (const r of live.radios || []) {
  await check(`Radio: ${r.en}`, 'Listen › Radio', 'the next link in live.json', async () => {
    const u = await firstOk(r.urls, audio);
    return { ok: !!u, note: u ? `plays from ${new URL(u).host}` : 'no link answers' };
  });
}

// ---- mp3quran.net ----
const MQ = 'https://www.mp3quran.net/api/v3/';
let radios = [];
await check('mp3quran.net API: stations', 'Listen › Radio', 'the last list kept on the device', async () => {
  const r = await get(`${MQ}radios?language=ar`, { json: true });
  radios = (r.body && r.body.radios) || [];
  return { ok: radios.length > 100, note: `${radios.length} stations` };
});
if (radios.length) {
  await check('mp3quran.net: station streams', 'Listen › Radio', 'qurango.net first, backup.qurango.net second', async () => {
    const down = [];
    let i = 0;
    const work = async () => {
      while (i < radios.length) {
        const x = radios[i++];
        const urls = [...new Set([x.url.replace('//backup.qurango.net/', '//qurango.net/'), x.url])];
        if (!(await firstOk(urls, audio))) down.push(x.url.split('/').pop());
      }
    };
    await Promise.all(Array.from({ length: 12 }, work));
    const share = down.length / radios.length;
    return { ok: share < 0.1, note: `${radios.length - down.length}/${radios.length} play${down.length ? `; down: ${down.slice(0, 12).join(', ')}` : ''}` };
  });
}
let reciters = [];
await check('mp3quran.net API: reciters', 'Listen › Recitations', 'the last list kept on the device', async () => {
  const r = await get(`${MQ}reciters?language=ar`, { json: true });
  reciters = (r.body && r.body.reciters) || [];
  return { ok: reciters.length > 100, note: `${reciters.length} reciters` };
});
if (reciters.length) {
  await check('mp3quran.net: recitation files', 'Listen › Recitations', 'none (the surah reports it can’t play)', async () => {
    const sample = reciters.filter((_, k) => k % 20 === 0).map((r) => r.moshaf[0]).filter(Boolean);
    let good = 0;
    const first = (m) => String(String(m.surah_list).split(',')[0]).padStart(3, '0');
    const bad = [];
    for (const m of sample) { if (await audio(`${m.server}${first(m)}.mp3`)) good++; else bad.push(m.server); }
    if (bad.length) console.log('  not playing:', bad.join(' '));
    return { ok: good >= sample.length * 0.8, note: `${good}/${sample.length} sampled reciters play` };
  });
}
await check('mp3quran.net: audio tafsir', 'Listen › Audio tafsir', 'the last list kept on the device', async () => {
  const r = await get(`${MQ}tafsir?tafsir=1&language=ar`, { json: true });
  const soar = (r.body && r.body.tafasir && r.body.tafasir.soar) || [];
  return { ok: soar.length > 100 && await audio(soar[0].url), note: `${soar.length} parts` };
});

// ---- the Mushaf ----
await check('Recitation audio (cdn.islamic.network)', 'Mushaf › play', 'none', async () => ({ ok: await audio('https://cdn.islamic.network/quran/audio/128/ar.alafasy/1.mp3') }));
await check('Teaching recitation (everyayah.com)', 'Mushaf › learning mode', 'none', async () => ({ ok: await audio('https://everyayah.com/data/Husary_Muallim_128kbps/001001.mp3') }));
await check('Tafsir (api.alquran.cloud)', 'Mushaf › tafsir, translations', 'kept on the device once read', async () => ({ ok: (await get('https://api.alquran.cloud/v1/surah/1/ar.muyassar')).ok }));
await check('Tafsir (spa5k/tafsir_api on jsDelivr)', 'Mushaf › tafsir', 'kept on the device once read', async () => ({ ok: (await get('https://cdn.jsdelivr.net/gh/spa5k/tafsir_api@main/tafsir/ar-tafsir-ibn-kathir/1.json')).ok }));
await check('Word by word (api.quran.com)', 'Mushaf › word by word', 'none', async () => ({ ok: (await get('https://api.quran.com/api/v4/verses/by_key/1:1?words=true&word_fields=text_uthmani&language=en')).ok }));
await check('Word audio (audio.qurancdn.com)', 'Mushaf › word by word', 'none', async () => ({ ok: await audio('https://audio.qurancdn.com/wbw/001_001_001.mp3') }));

// ---- the library, adhkar, sounds, tools ----
await check('Hadith books (fawazahmed0/hadith-api)', 'Library', 'kept on the device once read', async () => ({ ok: (await get('https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions/ara-bukhari/sections/1.min.json')).ok }));
await check('Hadith books (AhmedBaset/hadith-json)', 'Library › other books', 'kept on the device once read', async () => ({ ok: (await get('https://cdn.jsdelivr.net/gh/AhmedBaset/hadith-json@main/db/by_book/forties/nawawi40.json')).ok }));
await check('Adhkar audio (hisnmuslim.com)', 'Adhkar › listen', 'none', async () => ({ ok: await audio('https://www.hisnmuslim.com/audio/ar/75.mp3') }));
await check('Focus sounds (moodist on jsDelivr)', 'Sound library (fallback copy)', 'the copy on this site comes first', async () => ({ ok: await audio('https://cdn.jsdelivr.net/gh/remvze/moodist@285ecdbfc67fb082833eee8cef9cd34bbdb1d755/public/sounds/rain/light-rain.mp3') }));
await check('Mosques near me (Overpass)', 'Tools › mosques', 'three servers, then a Google Maps link', async () => {
  // The same request the app sends (js/tools.js), to all the servers at once.
  const q = '[out:json][timeout:25];node["amenity"="place_of_worship"](21.42,39.82,21.43,39.83);out 3;';
  const ask = async (u) => {
    const r = await fetch(u, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { ...UA, 'Content-Type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(45000) });
    if (!r.ok) throw new Error(r.status);
    await r.json();
    return new URL(u).host;
  };
  try {
    const host = await Promise.any(['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter',
      'https://overpass.private.coffee/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'].map(ask));
    return { ok: true, note: `first answer from ${host}` };
  } catch (_) { return { ok: false, note: 'no server answers' }; }
}, true);
await check('Clock correction (worldtimeapi.org / timeapi.io)', 'Clock accuracy', 'the website’s own clock, then the device clock', async () => {
  const a = (await get('https://worldtimeapi.org/api/timezone/Etc/UTC')).ok;
  const b = (await get('https://timeapi.io/api/time/current/zone?timeZone=UTC')).ok;
  return { ok: a || b, note: `worldtimeapi ${a ? 'up' : 'down'}, timeapi.io ${b ? 'up' : 'down'}` };
}, true);

const jsonAt = process.argv.indexOf('--json');
if (jsonAt > 0) writeFileSync(process.argv[jsonAt + 1], JSON.stringify({ checked: new Date().toISOString(), results }, null, 2));
const down = results.filter((r) => !r.ok);
console.log(`\n${results.length - down.length}/${results.length} sources up`);
// A table for the workflow's summary page.
if (process.env.GITHUB_STEP_SUMMARY) {
  const rows = results.map((r) => `| ${r.ok ? '✅' : r.minor ? '⚠️' : '❌'} | ${r.name} | ${r.feeds} | ${r.fallback} | ${r.note} |`);
  writeFileSync(process.env.GITHUB_STEP_SUMMARY, ['| | Source | Used by | Fallback | Note |', '|---|---|---|---|---|', ...rows].join('\n') + '\n', { flag: 'a' });
}
process.exit(down.some((r) => !r.minor) ? 1 : 0);
