// Copies the website files from the repository root into app/www for the Android build.
import { cpSync, rmSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const app = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const root = path.dirname(app);
const www = path.join(app, 'www');
rmSync(www, { recursive: true, force: true });
mkdirSync(www);
for (const item of ['index.html', 'install.html', 'manifest.webmanifest', 'icons', 'fonts', 'js', 'sounds', 'en', 'quran']) {
  cpSync(path.join(root, item), path.join(www, item), { recursive: true });
}
// The adhan recordings are also notification sounds, which Android reads from res/raw.
const raw = path.join(app, 'android', 'app', 'src', 'main', 'res', 'raw');
mkdirSync(raw, { recursive: true });
for (const f of readdirSync(path.join(root, 'sounds', 'adhan')).filter((f) => /\.(mp3|wav)$/.test(f))) {
  cpSync(path.join(root, 'sounds', 'adhan', f), path.join(raw, f));
}
console.log('Copied the site into', www, 'and the adhan sounds into', raw);
