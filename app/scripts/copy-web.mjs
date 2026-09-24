// Copies the website files from the repository root into app/www for the Android build.
import { cpSync, rmSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const app = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const root = path.dirname(app);
const www = path.join(app, 'www');
rmSync(www, { recursive: true, force: true });
mkdirSync(www);
for (const item of ['index.html', 'install.html', 'manifest.webmanifest', 'icons', 'js', 'sounds', 'en']) {
  cpSync(path.join(root, item), path.join(www, item), { recursive: true });
}
console.log('Copied the site into', www);
