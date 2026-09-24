// ---------- Sync: merge rules (pure functions, no page or network) ----------
// A synced document looks like:
//   { v: 1,
//     tasks:    [task, ...]           each task carries updatedAt (ms)
//     tombs:    { taskId: deletedAt } deletions, kept for 60 days
//     settings: { storageKey: { ts, value } } }
// Tasks merge one by one (newest edit wins, a deletion beats older edits);
// each setting is newest-wins as a whole.
(function (root) {
  'use strict';
  const TOMB_MS = 60 * 864e5;

  // Stable JSON: object keys sorted, so equal documents compare equal.
  function stable(v) {
    if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
    if (v && typeof v === 'object') {
      return '{' + Object.keys(v).sort().filter((k) => v[k] !== undefined)
        .map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
    }
    return JSON.stringify(v);
  }
  // A task's content without its sync stamp.
  function taskKey(t) {
    const copy = Object.assign({}, t);
    delete copy.updatedAt;
    return stable(copy);
  }
  // Canonical form of a document, for "did anything change?" checks.
  function canon(doc) {
    const d = doc || {};
    const tasks = (d.tasks || []).slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));
    return stable({ v: 1, tasks, tombs: d.tombs || {}, settings: d.settings || {} });
  }

  // Stamp tasks edited since the last sync and record local deletions.
  // base: { taskId: taskKey } from the last successful sync.
  function stampLocal(tasks, base, tombs, now) {
    const seen = new Set();
    for (const t of tasks) {
      seen.add(String(t.id));
      if (base[t.id] !== taskKey(t)) t.updatedAt = now;
      else if (!t.updatedAt) t.updatedAt = 0;
    }
    const outTombs = Object.assign({}, tombs);
    for (const id of Object.keys(base)) if (!seen.has(id)) outTombs[id] = Math.max(outTombs[id] || 0, now);
    return { tasks, tombs: outTombs };
  }

  function merge(local, remote, now) {
    const r = remote || {};
    const tombs = Object.assign({}, r.tombs || {});
    for (const [id, ts] of Object.entries(local.tombs || {})) tombs[id] = Math.max(ts, tombs[id] || 0);
    for (const id of Object.keys(tombs)) if (tombs[id] < now - TOMB_MS) delete tombs[id];

    const byId = new Map();
    for (const t of r.tasks || []) byId.set(String(t.id), t);
    for (const t of local.tasks || []) {
      const other = byId.get(String(t.id));
      if (!other || (t.updatedAt || 0) >= (other.updatedAt || 0)) byId.set(String(t.id), t);
    }
    const tasks = [...byId.values()].filter((t) => !(tombs[t.id] && tombs[t.id] >= (t.updatedAt || 0)));

    const settings = Object.assign({}, r.settings || {});
    for (const [k, s] of Object.entries(local.settings || {})) {
      if (!settings[k] || s.ts > settings[k].ts) settings[k] = s;
    }
    return { v: 1, tasks, tombs, settings };
  }

  root.noonSyncCore = { stable, taskKey, canon, stampLocal, merge };
})(typeof window !== 'undefined' ? window : globalThis);
