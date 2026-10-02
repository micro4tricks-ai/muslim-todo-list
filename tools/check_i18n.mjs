// Finds Arabic phrases entered twice in js/i18n.js (the later one silently wins).
// Usage: node tools/check_i18n.mjs
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../js/i18n.js', import.meta.url), 'utf8');
const keys = [...src.matchAll(/^ {4}'((?:[^'\\]|\\.)+)':/gm)].map((m) => m[1]);
const seen = new Set(), twice = [];
for (const k of keys) { if (seen.has(k)) twice.push(k); seen.add(k); }
console.log(`${keys.length} phrases, ${twice.length} entered twice${twice.length ? ':\n  ' + twice.join('\n  ') : ''}`);
process.exit(twice.length ? 1 : 0);
