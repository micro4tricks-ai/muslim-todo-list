// ---------- Reminders: "remind me" on a task, a review card or a stray thought, or on its own ----------
// The "remind me" sheet (quick times, a day and time, once / daily / weekly), the "My reminders"
// page, and the ring itself. On the website the ring is a notification from the browser while the
// site is open (even in a background tab) plus the reminder card in the page; in the Android app
// js/native.js books each ring with the phone, so it arrives with the app closed, with "Done" and
// "In 10 minutes" buttons. When each one rings: js/reminders-core.js. Synced (noon-sweep-reminders).
(() => {
  'use strict';
  const { T, I, el, button, load, store, uid, toast, onRemote } = window.noonUI;
  const R = window.noonRemindCore;
  const KEY = 'noon-sweep-reminders';
  const FIRED = 'noon-remind-fired'; // per device: which rings were announced here
  const KINDS = { task: 'مهمة', card: 'كارت مراجعة', thought: 'فكرة مشتتة', note: 'تذكير' };
  const REPEATS = [['none', 'مرة واحدة'], ['daily', 'كل يوم'], ['weekly', 'كل أسبوع']];
  let S = Object.assign({ items: [] }, load(KEY, {}));
  if (!Array.isArray(S.items)) S.items = [];
  const changed = () => window.dispatchEvent(new CustomEvent('noon-reminders'));
  function save() {
    S.items = R.prune(S.items, Date.now());
    S.updatedAt = Date.now();
    store(KEY, S);
    changed();
    if (open) render();
  }
  onRemote(KEY, () => { S = Object.assign({ items: [] }, load(KEY, {})); changed(); if (open) render(); });

  const native = () => window.noonNative;
  const active = () => S.items.filter((r) => R.nextAt(r, Date.now()) !== null);
  const forRef = (kind, ref) => active().find((r) => r.kind === kind && r.ref === ref) || null;

  // ---- how a time reads: "today 9:00 pm", "tomorrow 8:00 am", "Fri 6 Oct 10:00 am" ----
  const timeFmt = new Intl.DateTimeFormat(I.locale, { hour: 'numeric', minute: '2-digit' });
  const dayFmt = new Intl.DateTimeFormat(I.locale, { weekday: 'short', day: 'numeric', month: 'short' });
  const dayOf = (t) => new Date(t).toDateString();
  function when(t) {
    const now = Date.now();
    const day = dayOf(t) === dayOf(now) ? T('اليوم') : dayOf(t) === dayOf(now + 864e5) ? T('غداً') : dayFmt.format(t);
    return `${day} ${timeFmt.format(t)}`;
  }
  const repeatText = (r) => (r.repeat === 'daily' ? T('كل يوم') : r.repeat === 'weekly' ? T('كل أسبوع') : '');
  // The small "⏰ today 9:00 pm" badge next to an item.
  function badge(kind, ref) {
    const r = forRef(kind, ref);
    if (!r) return null;
    const b = el('span', 'rm-badge', `⏰ ${when(R.nextAt(r, Date.now()))}${r.repeat !== 'none' ? ` · ${repeatText(r)}` : ''}`);
    b.title = T('تذكير');
    return b;
  }

  // ---- the next prayer, for "after the prayer" ----
  function nextPrayer() {
    const A = window.noonAstro;
    if (!A) return null;
    try {
      const n = A.snapshot(Date.now()).next;
      if (!n || !Number.isFinite(n.inH)) return null;
      return { at: Math.round((Date.now() + n.inH * 3600e3) / 60000) * 60000, name: n.name };
    } catch (_) { return null; }
  }

  // ---- asking the browser or the phone for permission to notify ----
  async function permit() {
    if (native()) return native().permit(true);
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'default') { try { await Notification.requestPermission(); } catch (_) {} }
    return Notification.permission === 'granted';
  }

  // ================= the "remind me" sheet =================
  const veil = el('div', 'rm-veil'); veil.hidden = true;
  const sheet = el('div', 'rm-sheet'); sheet.hidden = true;
  sheet.dir = I.isEn ? 'ltr' : 'rtl';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', T('ذكّرني'));
  document.body.append(veil, sheet);
  veil.addEventListener('click', () => closeSheet());
  sheet.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); closeSheet(); } });
  let sheetOpen = false;
  function closeSheet(fromHistory) {
    if (!sheetOpen) return;
    sheetOpen = false;
    sheet.hidden = veil.hidden = true;
    if (!fromHistory && history.state && history.state.rm) history.back();
  }
  addEventListener('popstate', () => { if (sheetOpen) closeSheet(true); });

  const pad = (n) => String(n).padStart(2, '0');
  const toLocal = (t) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };

  // item: { kind, ref, title } — or nothing for a reminder of its own; an existing reminder is edited.
  function ask(item) {
    item = item || { kind: 'note' };
    const old = item.id ? S.items.find((r) => r.id === item.id) : (item.ref ? forRef(item.kind, item.ref) : null);
    const kind = old ? old.kind : item.kind;
    sheet.replaceChildren();
    sheet.append(el('span', 'more-grab rm-grab'), el('h2', 'rm-title', T(old ? 'تعديل التذكير' : 'ذكّرني')));

    let title = null;
    if (kind === 'note') {
      title = el('input', 'ls-search rm-input');
      title.placeholder = T('بماذا أذكّرك؟');
      title.setAttribute('aria-label', T('بماذا أذكّرك؟'));
      title.maxLength = 140;
      title.value = old ? old.title : '';
      sheet.append(title);
    } else {
      const what = el('p', 'rm-what');
      what.append(el('small', '', T(KINDS[kind])), el('b', '', (old ? old.title : item.title) || ''));
      sheet.append(what);
    }

    // Quick times.
    const chips = el('div', 'rm-chips');
    const dt = el('input', 'ls-search rm-input');
    dt.type = 'datetime-local';
    dt.setAttribute('aria-label', T('اليوم والوقت'));
    const pick = (t, b) => {
      dt.value = toLocal(t);
      chips.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c === b)));
    };
    const p = nextPrayer();
    const LABELS = { m30: 'بعد نصف ساعة', h1: 'بعد ساعة', tonight: 'الليلة ٩:٠٠', morning: 'غداً ٨:٠٠ صباحاً' };
    R.quickTimes(Date.now(), p ? p.at : NaN).forEach((c) => {
      const b = button('chip', c.id === 'prayer' ? `${T('بعد دخول وقت')} ${p.name}` : T(LABELS[c.id]), () => pick(c.at, b));
      b.setAttribute('aria-pressed', 'false');
      chips.append(b);
    });
    dt.value = toLocal(old ? (R.nextAt(old, Date.now()) || old.at) : Date.now() + 60 * 60000);
    dt.addEventListener('input', () => chips.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', 'false')));

    const rep = el('div', 'rm-repeat');
    rep.setAttribute('role', 'radiogroup');
    rep.setAttribute('aria-label', T('التكرار'));
    let repeat = old ? old.repeat : 'none';
    REPEATS.forEach(([v, label]) => {
      const b = button('chip', T(label), () => { repeat = v; rep.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c === b))); });
      b.setAttribute('aria-pressed', String(v === repeat));
      rep.append(b);
    });

    const msg = el('p', 'hint rm-msg');
    const acts = el('div', 'form-actions');
    const saveBtn = button('btn btn-primary', T('حفظ التذكير'), async () => {
      const at = new Date(dt.value).getTime();
      const text = title ? title.value.trim() : (old ? old.title : item.title);
      if (title && !text) { msg.textContent = T('اكتب نص التذكير.'); title.focus(); return; }
      if (!Number.isFinite(at) || (repeat === 'none' && at <= Date.now())) { msg.textContent = T('اختر وقتاً قادماً.'); dt.focus(); return; }
      const r = { id: old ? old.id : uid(), kind, ref: old ? old.ref : (item.ref || ''), title: String(text || '').slice(0, 140), at, repeat, createdAt: old ? old.createdAt : Date.now() };
      if (old) S.items = S.items.map((x) => (x.id === old.id ? r : x));
      else S.items.push(r);
      save();
      closeSheet();
      const ok = await permit();
      // Permission may have just been given: book with the phone now.
      if (ok && native() && native().scheduleReminders) native().scheduleReminders(true);
      toast(ok ? `${T('سأذكّرك')} ${when(R.nextAt(r, Date.now()) || at)}` : T('حُفظ التذكير، لكن الإشعارات غير مسموحة؛ سيظهر داخل التطبيق فقط. اسمح بها من إعدادات المتصفح أو الهاتف.'));
    });
    acts.append(saveBtn, button('btn btn-quiet', T('إلغاء'), () => closeSheet()));
    if (old) acts.append(button('link-btn danger', T('حذف التذكير'), () => { remove(old.id); closeSheet(); toast(T('حُذف التذكير.')); }));

    sheet.append(el('p', 'rm-label', T('متى؟')), chips, dt, el('p', 'rm-label', T('التكرار')), rep, msg, acts);
    if (!sheetOpen) { sheetOpen = true; history.pushState({ rm: 1 }, ''); }
    sheet.hidden = veil.hidden = false;
    setTimeout(() => (title || chips.querySelector('.chip') || dt).focus(), 60);
  }

  function remove(id) { S.items = S.items.filter((r) => r.id !== id); save(); }
  // The item is finished or deleted: its reminders go with it.
  function dropFor(kind, ref) {
    const n = S.items.length;
    S.items = S.items.filter((r) => !(r.kind === kind && r.ref === ref));
    if (S.items.length !== n) save();
  }

  // ================= "My reminders" =================
  const root = el('div', 'st rm-page');
  root.hidden = true;
  root.dir = I.isEn ? 'ltr' : 'rtl';
  root.setAttribute('role', 'dialog');
  const bar = el('header', 'st-bar');
  bar.append(button('st-back', I.isEn ? '←' : '→', () => history.back(), T('رجوع')), el('h2', 'st-title', T('تذكيراتي')));
  const body = el('div', 'st-body');
  root.append(bar, body);
  document.body.append(root);
  let open = false;
  function show() {
    if (open) return;
    open = true;
    root.hidden = false;
    document.body.classList.add('st-open');
    history.pushState({ rmp: 1 }, '');
    render();
  }
  addEventListener('popstate', () => {
    // Back from the sheet opened on this page lands on the page's own history entry: stay.
    if (!open || sheetOpen || (history.state && history.state.rmp)) return;
    open = false;
    root.hidden = true;
    document.body.classList.remove('st-open');
  });

  function render() {
    body.replaceChildren();
    const add = button('btn btn-primary rm-add', `+ ${T('تذكير جديد')}`, () => ask());
    body.append(add);
    const now = Date.now();
    const list = active().map((r) => ({ r, t: R.nextAt(r, now) })).sort((a, b) => a.t - b.t);
    const g = el('section', 'st-group');
    g.append(el('h3', 'st-group-name', T('القادمة')));
    if (!list.length) g.append(el('p', 'st-note', T('لا تذكيرات قادمة. أضف تذكيراً من هنا، أو من زر ⏰ بجانب أي مهمة أو كارت أو فكرة.')));
    else {
      const ul = el('div', 'st-list');
      list.forEach(({ r, t }) => {
        const row = el('div', 'hz-row');
        const txt = el('div', 'hz-text');
        txt.append(el('b', '', r.title || T(KINDS[r.kind])), el('small', '', [T(KINDS[r.kind]), when(t), repeatText(r)].filter(Boolean).join(' · ')));
        const acts = el('div', 'rm-row-acts');
        if (r.kind !== 'note') acts.append(button('link-btn', T('افتح'), () => { history.back(); setTimeout(() => openItem(r), 150); }));
        acts.append(button('link-btn', T('تعديل'), () => ask({ id: r.id })), button('link-btn danger', T('حذف'), () => remove(r.id)));
        row.append(txt, acts);
        ul.append(row);
      });
      g.append(ul);
    }
    body.append(g);
    if (!native()) {
      body.append(el('p', 'st-note', T('على الموقع يصل التذكير ما دام الموقع مفتوحاً، ولو في تبويب مصغّر. ولتصلك والتطبيق مغلق، استخدم تطبيق أندرويد.')));
    }
  }

  // ---- opening what a reminder is about ----
  function openItem(r) {
    const go = window.noonUI.go;
    if (r.kind === 'task') {
      go('tasks');
      setTimeout(() => flash(document.querySelector(`#list li[data-id="${CSS.escape(r.ref)}"]`)), 250);
    } else if (r.kind === 'card') {
      if (window.noonCards && window.noonCards.open) window.noonCards.open(r.ref); else go('cards');
    } else if (r.kind === 'thought') {
      go('report');
      setTimeout(() => flash(document.querySelector(`.distract-list li[data-id="${CSS.escape(r.ref)}"]`)), 250);
    } else {
      showRing(r, null);
    }
  }
  function flash(node) {
    if (!node) return;
    node.scrollIntoView({ block: 'center', behavior: 'smooth' });
    node.classList.add('rm-flash');
    setTimeout(() => node.classList.remove('rm-flash'), 2400);
  }

  // ================= the ring =================
  let fired = {};
  try { fired = JSON.parse(localStorage.getItem(FIRED) || '{}'); } catch (_) {}
  const keepFired = () => {
    const now = Date.now();
    for (const k of Object.keys(fired)) if (now - fired[k] > 2 * 864e5) delete fired[k];
    try { localStorage.setItem(FIRED, JSON.stringify(fired)); } catch (_) {}
  };
  function update(id, fn) {
    const r = S.items.find((x) => x.id === id);
    if (!r) return null;
    const x = fn(r);
    S.items = S.items.map((y) => (y.id === id ? x : y));
    save();
    return x;
  }
  const snoozeIt = (id) => { const x = update(id, (r) => R.snooze(r, Date.now(), 10)); if (x) toast(T('سأذكّرك بعد ١٠ دقائق.')); };
  const doneIt = (id) => update(id, (r) => (r.repeat === 'none' ? Object.assign({}, r, { done: true }) : r));

  // The card in the page, with Open / In 10 minutes / Done.
  function showRing(r, t) {
    const actions = [];
    if (r.kind !== 'note') actions.push({ label: T('افتح'), primary: true, run: () => openItem(r) });
    if (t !== null) actions.push({ label: T('بعد ١٠ دقائق'), run: () => snoozeIt(r.id) }, { label: T('تم'), primary: r.kind === 'note', run: () => doneIt(r.id) });
    const kicker = `⏰ ${T(KINDS[r.kind])}${r.repeat !== 'none' ? ` · ${repeatText(r)}` : ''}`;
    if (window.noonCard) window.noonCard.show({ kicker, title: r.title || T('تذكير'), body: '', actions });
    else toast(`⏰ ${r.title}`, r.kind !== 'note' ? { label: T('افتح'), run: () => openItem(r) } : null);
  }

  function check() {
    const now = Date.now();
    const due = R.dueNow(S.items, now, fired);
    if (!due.length) return;
    for (const { r, t, key } of due) {
      fired[key] = now;
      showRing(r, t);
      // In the app the phone has already shown the notification.
      if (!native() && 'Notification' in window && Notification.permission === 'granted') {
        try {
          const n = new Notification(r.title || T('تذكير'), { body: `⏰ ${T(KINDS[r.kind])}`, tag: key, icon: 'icons/icon-192.png', requireInteraction: true });
          n.onclick = () => { window.focus(); n.close(); openItem(r); };
        } catch (_) {}
      }
      S.items = S.items.map((x) => (x.id === r.id ? R.afterRing(x, t) : x));
    }
    keepFired();
    save();
  }
  setInterval(check, 20000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  setTimeout(check, 3000);

  // The phone's notification: tapped, "Done" or "In 10 minutes" (js/native.js).
  window.addEventListener('noon-my-reminder', (ev) => {
    const d = ev.detail || {};
    const r = S.items.find((x) => x.id === d.rid);
    if (!r) return;
    const key = `${r.id}@${d.t}`;
    if (!fired[key]) { fired[key] = Date.now(); keepFired(); update(r.id, (x) => R.afterRing(x, d.t)); }
    if (d.action === 'snooze') snoozeIt(r.id);
    else if (d.action === 'done') doneIt(r.id);
    else openItem(r);
  });

  // Every ring in the next days, for the phone to book (js/native.js).
  function plan(from, to) {
    const out = [];
    for (const r of S.items) {
      for (const t of R.occurrences(r, from, to)) out.push({ rid: r.id, t, kind: r.kind, title: r.title || T('تذكير'), body: `⏰ ${T(KINDS[r.kind])}${r.repeat !== 'none' ? ` · ${repeatText(r)}` : ''}` });
    }
    return out.sort((a, b) => a.t - b.t);
  }

  // A "⏰" button for the other sections.
  function remindButton(kind, ref, title) {
    const has = !!forRef(kind, ref);
    const b = button(`link-btn rm-btn${has ? ' is-set' : ''}`, has ? '⏰' : `⏰ ${T('ذكّرني')}`, () => ask({ kind, ref, title }), T(has ? 'تعديل التذكير' : 'ذكّرني'));
    return b;
  }

  const headBtn = document.getElementById('remindersBtn');
  if (headBtn) headBtn.addEventListener('click', () => show());

  window.noonReminders = { ask, open: show, plan, badge, when, button: remindButton, forRef, dropFor, upcoming: () => active().map((r) => ({ r, t: R.nextAt(r, Date.now()) })).sort((a, b) => a.t - b.t) };
  changed(); // sections drawn before this file add their ⏰ buttons now
})();
