// ---------- "My day" cards: which are shown and in what order (pure functions, no page) ----------
// The person chooses the cards under the clock and their order (Settings › «كروت يومي», or a long
// press on a card). Saved as { order: [ids], on: { id: true|false } } in noon-sweep-today; with
// nothing saved, the cards shown before this choice existed stay as they were, and the new ones
// are offered switched off. Tested by tools/test_today.mjs.
(function (root) {
  'use strict';
  // Every card, in the default order. The first nine were the only ones before 2.5.
  const ALL = ['prayer', 'ramadan', 'qibla', 'fast', 'quran', 'adhkar', 'hifz', 'remind', 'invite', 'listen',
    'library', 'hadith', 'book', 'tasbih', 'khatma', 'challenge', 'radio'];
  const ON = new Set(['prayer', 'ramadan', 'qibla', 'fast', 'quran', 'adhkar', 'hifz', 'remind', 'invite', 'listen']);

  function arrange(cfg) {
    const seen = new Set(), order = [];
    for (const id of (cfg && cfg.order) || []) if (ALL.includes(id) && !seen.has(id)) { seen.add(id); order.push(id); }
    // Cards not in the saved order go after the card that comes before them by default.
    ALL.forEach((id, k) => {
      if (seen.has(id)) return;
      let at = 0;
      for (let j = k - 1; j >= 0; j--) { const p = order.indexOf(ALL[j]); if (p >= 0) { at = p + 1; break; } }
      order.splice(at, 0, id);
      seen.add(id);
    });
    const on = (cfg && cfg.on) || {};
    return order.map((id) => ({ id, on: id in on ? !!on[id] : ON.has(id) }));
  }
  const visible = (cfg) => arrange(cfg).filter((c) => c.on).map((c) => c.id);

  // One step earlier (−1) or later (+1); among the shown cards only, when shownOnly.
  function move(cfg, id, dir, shownOnly) {
    const list = arrange(cfg);
    const i = list.findIndex((c) => c.id === id);
    if (i < 0) return clone(cfg);
    let j = i + dir;
    if (shownOnly) while (j >= 0 && j < list.length && !list[j].on) j += dir;
    if (j < 0 || j >= list.length) return clone(cfg);
    const ids = list.map((c) => c.id);
    ids.splice(i, 1);
    ids.splice(j, 0, id);
    return Object.assign(clone(cfg), { order: ids });
  }
  function toggle(cfg, id, on) {
    const c = clone(cfg);
    c.on = Object.assign({}, c.on, { [id]: !!on });
    return c;
  }
  const clone = (cfg) => JSON.parse(JSON.stringify(cfg || {}));

  root.noonTodayCore = { ALL, arrange, visible, move, toggle };
})(typeof window !== 'undefined' ? window : globalThis);
