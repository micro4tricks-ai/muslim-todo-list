// For each language file in js/lang/: finds Arabic phrases entered twice (the later one silently
// wins), phrases the code passes to T('…') that have no translation yet, and (for the languages
// after English) phrases of the English file that are missing.
// Usage: node tools/check_i18n.mjs
import { readFileSync, readdirSync } from 'node:fs';

// The phrases, as the page gets them (the file is run), and the ones that start a line written
// twice (a phrase entered twice is lost to the run, so the text is searched for it).
const read = (file) => {
  const src = readFileSync(new URL(`../js/lang/${file}`, import.meta.url), 'utf8');
  let dict = {};
  new Function('window', src)({ noonI18n: { use: (d) => { dict = d; } } });
  const lines = [...src.matchAll(/^ {2}(?:'((?:[^'\\]|\\.)+)'|"((?:[^"\\]|\\.)+)"):/gm)].map((m) => m[1] || m[2]);
  return { keys: Object.keys(dict), lines };
};

const dir = new URL('../js/', import.meta.url);
const used = new Map();
for (const f of readdirSync(dir).filter((n) => n.endsWith('.js') && n !== 'i18n.js')) {
  const code = readFileSync(new URL(f, dir), 'utf8');
  for (const m of code.matchAll(/\bT\('((?:[^'\\]|\\.)*[؀-ۿ](?:[^'\\]|\\.)*)'\)/g)) {
    if (!used.has(m[1])) used.set(m[1], f);
  }
}

const files = readdirSync(new URL('../js/lang/', import.meta.url)).filter((n) => n.endsWith('.js') && n !== 'surah-names.js').sort((a, b) => (a === 'en.js' ? -1 : b === 'en.js' ? 1 : a.localeCompare(b)));
const en = new Set(read('en.js').keys);
let bad = 0;
for (const file of files) {
  const { keys, lines } = read(file);
  const seen = new Set(keys), once = new Set(), twice = [];
  for (const k of lines) { if (once.has(k)) twice.push(k); once.add(k); }
  const missing = [...used].filter(([k]) => !seen.has(k));
  const behind = file === 'en.js' ? [] : [...en].filter((k) => !seen.has(k));
  console.log(`${file}: ${keys.length} phrases, ${twice.length} entered twice, ${missing.length} used without a translation, ${behind.length} of the English ones missing`);
  for (const k of twice) console.log(`  twice: ${k}`);
  for (const [k, f] of missing) console.log(`  untranslated: ${k}   (${f})`);
  for (const k of behind.slice(0, 20)) console.log(`  missing: ${k}`);
  if (behind.length > 20) console.log(`  … and ${behind.length - 20} more`);
  bad += twice.length + missing.length + behind.length;
}
process.exit(bad ? 1 : 0);
