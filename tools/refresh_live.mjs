// Finds the current live video of each official YouTube channel in live.json (tv[].youtube.handle)
// and writes its id into tv[].youtube.video. A 24-hour channel keeps one video for months, but a
// new one starts whenever the broadcast restarts; the daily workflow runs this and publishes the
// change. Prints what changed; leaves the file alone when nothing did or YouTube can't be read.
import { readFileSync, writeFileSync } from 'node:fs';

const file = new URL('../live.json', import.meta.url);
const live = JSON.parse(readFileSync(file, 'utf8'));
let changed = false;
for (const ch of live.tv) {
  const yt = ch.youtube;
  if (!yt || !yt.handle) continue;
  try {
    const r = await fetch(`https://www.youtube.com/@${yt.handle}/live`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36', 'Accept-Language': 'en' },
      signal: AbortSignal.timeout(20000)
    });
    const html = await r.text();
    const id = (html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([\w-]{11})"/) || [])[1];
    const isLive = /"isLiveNow":true|"isLiveContent":true/.test(html);
    if (!id || !isLive) { console.log(`${ch.id}: no live video found on @${yt.handle}; kept ${yt.video}`); continue; }
    if (id !== yt.video) { console.log(`${ch.id}: ${yt.video} -> ${id}`); yt.video = id; changed = true; }
    else console.log(`${ch.id}: still ${id}`);
  } catch (e) {
    console.log(`${ch.id}: could not read @${yt.handle} (${e.message}); kept ${yt.video}`);
  }
}
if (changed) writeFileSync(file, JSON.stringify(live, null, 2) + '\n');
