// ---------- Reminders: when each one rings (pure functions, no page or phone) ----------
// A reminder: { id, at (ms), repeat: 'none' | 'daily' | 'weekly', title, kind, ref, done?, snooze? }
// "at" is the first ring; daily and weekly ones ring again at the same clock time. A snooze adds
// one extra ring; a one-time reminder is done once it has rung. Tested by tools/test_reminders.mjs.
(function (root) {
  'use strict';
  const MIN = 60000;
  const LATE = 30 * MIN; // a ring missed by more than this is not announced late
  const KEEP_DONE = 7 * 864e5;

  // The same clock time, n days later (calendar days, so a clock change keeps the hour).
  function plusDays(t, n) { const d = new Date(t); d.setDate(d.getDate() + n); return d.getTime(); }
  function atClock(t, h, m) { const d = new Date(t); d.setHours(h, m, 0, 0); return d.getTime(); }

  // The quick choices in the "remind me" sheet.
  function quickTimes(now, nextPrayerAt) {
    const out = [{ id: 'm30', at: now + 30 * MIN }, { id: 'h1', at: now + 60 * MIN }];
    const nine = atClock(now, 21, 0);
    if (nine - now > 15 * MIN) out.push({ id: 'tonight', at: nine });
    out.push({ id: 'morning', at: atClock(plusDays(now, 1), 8, 0) });
    if (Number.isFinite(nextPrayerAt) && nextPrayerAt > now) out.push({ id: 'prayer', at: nextPrayerAt + 15 * MIN });
    return out.sort((a, b) => a.at - b.at);
  }

  // Every ring in (from, to], in order.
  function occurrences(r, from, to) {
    const out = [];
    if (r.snooze > from && r.snooze <= to) out.push(r.snooze);
    if (r.repeat === 'daily' || r.repeat === 'weekly') {
      const step = r.repeat === 'daily' ? 1 : 7;
      // Jump close to "from" instead of walking from the first ring.
      let k = Math.max(0, Math.floor((from - r.at) / (step * 864e5)) - 1);
      for (let t = plusDays(r.at, k * step); t <= to; t = plusDays(r.at, ++k * step)) {
        if (t > from) out.push(t);
      }
    } else if (!r.done && r.at > from && r.at <= to) {
      out.push(r.at);
    }
    return [...new Set(out)].sort((a, b) => a - b);
  }

  // What rings now and this device has not announced yet ("fired" maps key → when announced).
  function dueNow(items, now, fired) {
    const out = [];
    for (const r of items) {
      for (const t of occurrences(r, now - LATE, now)) {
        const key = `${r.id}@${t}`;
        if (!fired[key]) out.push({ r, t, key });
      }
    }
    return out.sort((a, b) => a.t - b.t);
  }

  // After a ring: a one-time reminder is done; a snoozed ring is used up.
  function afterRing(r, t) {
    const x = Object.assign({}, r);
    if (x.snooze === t) delete x.snooze;
    else if (x.repeat !== 'daily' && x.repeat !== 'weekly') x.done = true;
    return x;
  }

  // A one-time reminder moves to the new time; a repeating one gets one extra ring.
  function snooze(r, now, minutes = 10) {
    const t = now + minutes * MIN;
    if (r.repeat === 'daily' || r.repeat === 'weekly') return Object.assign({}, r, { snooze: t });
    const x = Object.assign({}, r, { at: t, done: false });
    delete x.snooze;
    return x;
  }

  // The next ring after now, or null.
  function nextAt(r, now) {
    const span = r.repeat === 'weekly' ? 8 * 864e5 : 2 * 864e5;
    const list = occurrences(r, now, Math.max(now, r.at) + span);
    return list.length ? list[0] : null;
  }

  // One-time reminders whose time is a week gone (rung, or missed while the app was closed) go.
  function prune(items, now) {
    return items.filter((r) => r.repeat === 'daily' || r.repeat === 'weekly' || now - r.at <= KEEP_DONE);
  }

  root.noonRemindCore = { quickTimes, occurrences, dueNow, afterRing, snooze, nextAt, prune };
})(typeof window !== 'undefined' ? window : globalThis);
