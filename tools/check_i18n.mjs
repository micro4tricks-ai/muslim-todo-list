// Finds Arabic phrases entered twice in js/i18n.js (the later one silently wins), and phrases the
// code passes to T('…') that have no English yet.
// Usage: node tools/check_i18n.mjs
import { readFileSync, readdirSync } from 'node:fs';

const src = readFileSync(new URL('../js/i18n.js', import.meta.url), 'utf8');
const keys = [...src.matchAll(/^ {4}(?:'((?:[^'\\]|\\.)+)'|"((?:[^"\\]|\\.)+)"):/gm)].map((m) => m[1] || m[2]);
const seen = new Set(), twice = [];
for (const k of keys) { if (seen.has(k)) twice.push(k); seen.add(k); }
console.log(`${keys.length} phrases, ${twice.length} entered twice${twice.length ? ':\n  ' + twice.join('\n  ') : ''}`);

const dir = new URL('../js/', import.meta.url);
const missing = new Map();
for (const f of readdirSync(dir).filter((n) => n.endsWith('.js') && n !== 'i18n.js')) {
  const code = readFileSync(new URL(f, dir), 'utf8');
  for (const m of code.matchAll(/\bT\('((?:[^'\\]|\\.)*[؀-ۿ](?:[^'\\]|\\.)*)'\)/g)) {
    if (!seen.has(m[1]) && !missing.has(m[1])) missing.set(m[1], f);
  }
}
console.log(`${missing.size} phrases without English${missing.size ? ':\n  ' + [...missing].map(([k, f]) => `${k}   (${f})`).join('\n  ') : ''}`);
process.exit(twice.length || missing.size ? 1 : 0);
