// ---------- Tajweed: the rules marked in the coloured Mushaf text (pure functions, no page) ----------
// quran/tajweed.json marks each rule as [code[letters] or [code:id[letters], and a mark can hold
// another (e.g. a madd over a silent alif). parse() reads the marks with a stack, so the text left
// over is exactly the verse; rules() lists them by rule with the word(s) they fall on.
// Tested by tools/test_tajweed.mjs.
(function (root) {
  'use strict';
  const OPEN = /\[([a-z])(?::\d+)?\[/y;

  // { plain, marks: [{ code, start, end }] }: offsets in plain, in the order the marks open.
  function parse(t) {
    t = String(t);
    let plain = '';
    const marks = [], stack = [];
    for (let k = 0; k < t.length;) {
      OPEN.lastIndex = k;
      const m = OPEN.exec(t);
      if (m) { stack.push(marks.length); marks.push({ code: m[1], start: plain.length, end: -1 }); k = OPEN.lastIndex; continue; }
      // One verse in the source has a bracket pair with no rule code ([ٮٰ]): a mark that names nothing.
      if (t[k] === '[' && t.indexOf(']', k) > k) { stack.push(marks.length); marks.push({ code: null, start: plain.length, end: -1 }); k++; continue; }
      if (t[k] === ']' && stack.length) { marks[stack.pop()].end = plain.length; k++; continue; }
      plain += t[k++];
    }
    while (stack.length) marks[stack.pop()].end = plain.length; // an unclosed mark runs to the end
    return { plain, marks: marks.filter((x) => x.code && x.end > x.start) };
  }

  // The text in runs that share the same marks: { text, code (innermost, or null), m: [mark indexes] }.
  function segments(t) {
    const { plain, marks } = parse(t);
    const out = [];
    let key = null;
    for (let i = 0; i < plain.length; i++) {
      const on = [];
      marks.forEach((x, k) => { if (x.start <= i && i < x.end) on.push(k); });
      const kk = on.join(',');
      if (kk !== key) { out.push({ text: '', code: on.length ? marks[on[on.length - 1]].code : null, m: on }); key = kk; }
      out[out.length - 1].text += plain[i];
    }
    return out;
  }

  // The whole word(s) a mark falls on, from the space before it to the space after it.
  function wordAt(plain, start, end) {
    let a = start, b = end;
    while (a > 0 && !/\s/.test(plain[a - 1])) a--;
    while (b < plain.length && !/\s/.test(plain[b])) b++;
    return plain.slice(a, b).trim();
  }

  // [{ code, items: [{ word, ks: [mark indexes] }] }], rules in the order they first appear.
  function rules(t) {
    const { plain, marks } = parse(t);
    const groups = [];
    marks.forEach((x, k) => {
      let g = groups.find((y) => y.code === x.code);
      if (!g) groups.push(g = { code: x.code, items: [] });
      const word = wordAt(plain, x.start, x.end);
      const it = g.items.find((y) => y.word === word);
      if (it) it.ks.push(k); else g.items.push({ word, ks: [k] });
    });
    return groups;
  }

  root.noonTajweedCore = { parse, segments, rules, wordAt };
})(typeof window !== 'undefined' ? window : globalThis);
