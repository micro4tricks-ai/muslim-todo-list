// ---------- Sync across devices (Supabase) ----------
// Sign in with an email link; tasks and settings are stored in one row per
// account and merged with this device's copy (see sync-core.js). Open devices
// get changes live; the rest catch up when they next open the page.
(() => {
  'use strict';
  const I = window.noonI18n, T = I.t;
  const core = window.noonSyncCore;
  const $ = (id) => document.getElementById(id);
  const cfg = window.NOON_SUPABASE || {};

  const TASKS_KEY = 'noon-sweep-v2';
  // Per-device things (focus timer, photo background, music folder) stay local.
  // Settings read once at page load (applied by reloading) ...
  const RELOAD_KEYS = ['noon-sweep-place', 'noon-sweep-look', 'noon-sweep-sounds-v2', 'noon-sweep-lang'];
  // ... and views that refresh themselves live when another device changes them.
  const LIVE_KEYS = ['noon-sweep-notes', 'noon-sweep-cards', 'noon-sweep-habits', 'noon-sweep-adhkar',
    'noon-sweep-distractions', 'noon-sweep-focuslog', 'noon-sweep-prayer-alerts'];
  const SETTINGS_KEYS = RELOAD_KEYS.concat(LIVE_KEYS);
  const META_KEY = 'noon-sweep-sync-meta';
  const RELOAD_FLAG = 'noon-sweep-sync-reloaded';

  // ---- local storage helpers; writes made by sync itself are not re-synced ----
  let applying = 0;
  let store = null;
  try { store = window.localStorage; } catch (_) {}
  const get = (k) => { try { return store ? store.getItem(k) : null; } catch (_) { return null; } };
  const setQuiet = (k, v) => { applying++; try { store && store.setItem(k, v); } catch (_) {} finally { applying--; } };
  let meta = { ts: {}, base: {}, tombs: {} };
  try { Object.assign(meta, JSON.parse(get(META_KEY) || '{}')); } catch (_) {}
  const saveMeta = () => setQuiet(META_KEY, JSON.stringify(meta));

  const localTasks = () => (window.noonTasks ? window.noonTasks.get() : []);
  const localSettings = () => {
    const out = {};
    for (const k of SETTINGS_KEYS) {
      const v = get(k);
      if (v !== null) out[k] = { ts: meta.ts[k] || 0, value: v };
    }
    return out;
  };

  // ---- UI ----
  const btn = $('syncBtn'), panel = $('syncPanel');
  let state = 'off', lastSync = 0, user = null, client = null;
  const timeFmt = new Intl.DateTimeFormat(I.locale, { hour: 'numeric', minute: '2-digit' });
  function renderUI(msg) {
    btn.dataset.state = state;
    const label = !client ? T('مزامنة')
      : !user ? T('تسجيل الدخول للمزامنة')
      : state === 'syncing' ? T('جارٍ المزامنة…')
      : state === 'error' ? T('تعذّرت المزامنة')
      : T('متزامن');
    $('syncLabel').textContent = label;
    $('syncOff').hidden = !!client;
    $('syncSignedOut').hidden = !client || !!user;
    $('syncSignedIn').hidden = !client || !user;
    if (user) {
      $('syncUser').textContent = user.email || '';
      $('syncState').textContent = state === 'syncing' ? T('جارٍ المزامنة…')
        : state === 'error' ? T('تعذّرت المزامنة. سنحاول مرة أخرى تلقائياً.')
        : lastSync ? `${T('آخر مزامنة:')} ${timeFmt.format(lastSync)}` : '';
    }
    if (msg !== undefined) $('syncMsg').textContent = msg;
  }
  btn.addEventListener('click', () => { panel.hidden = !panel.hidden; if (!panel.hidden && !user && client) $('syncEmail').focus(); });
  $('syncClose').addEventListener('click', () => { panel.hidden = true; btn.focus(); });

  if (!cfg.url || !cfg.anonKey || !window.supabase) {
    $('syncOffText').textContent = !cfg.url || !cfg.anonKey
      ? T('المزامنة غير مفعّلة في هذه النسخة من الصفحة.')
      : T('تعذّر تحميل خدمة المزامنة. تأكد من اتصال الإنترنت ثم أعد فتح الصفحة.');
    renderUI();
    return;
  }

  client = window.supabase.createClient(cfg.url, cfg.anonKey, {
    // "implicit" lets the email link open on a different device from the one that asked for it.
    auth: { flowType: 'implicit', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'noon-sweep-auth' }
  });

  // ---- the sync cycle: stamp local edits, pull, merge, apply, push ----
  let busy = false, again = false;
  function applyLocal(doc, allowReload) {
    // Tasks: swap in the merged list if it differs from what's on screen.
    const mine = localTasks();
    if (core.canon({ tasks: mine }) !== core.canon({ tasks: doc.tasks }) && window.noonTasks) {
      applying++;
      try { window.noonTasks.set(JSON.parse(JSON.stringify(doc.tasks))); } finally { applying--; }
    }
    rememberSignatures();
    meta.base = {};
    for (const t of doc.tasks) meta.base[t.id] = core.taskKey(t);
    meta.tombs = doc.tombs;
    // Settings: take newer values from other devices.
    let settingsChanged = false;
    for (const [k, s] of Object.entries(doc.settings)) {
      if (s.ts > (meta.ts[k] || 0) && s.value !== get(k)) {
        setQuiet(k, s.value);
        if (LIVE_KEYS.includes(k)) window.dispatchEvent(new CustomEvent('noon-storage', { detail: { key: k } }));
        else settingsChanged = true;
      }
      meta.ts[k] = Math.max(meta.ts[k] || 0, s.ts);
    }
    saveMeta();
    if (settingsChanged) {
      // The page reads settings when it opens: reload once to show them.
      let reloaded = null;
      try { reloaded = sessionStorage.getItem(RELOAD_FLAG); } catch (_) {}
      if (allowReload && !reloaded) {
        try { sessionStorage.setItem(RELOAD_FLAG, '1'); } catch (_) {}
        location.reload();
        return true;
      }
      renderUI(T('وصلت إعدادات جديدة من جهاز آخر، وستظهر عند إعادة فتح الصفحة.'));
    }
    return false;
  }

  async function syncNow(allowReload = false) {
    if (!user) return;
    if (busy) { again = true; return; }
    busy = true; state = 'syncing'; renderUI();
    try {
      const now = Date.now();
      const stamped = core.stampLocal(localTasks(), meta.base, meta.tombs, now);
      const local = { tasks: stamped.tasks, tombs: stamped.tombs, settings: localSettings() };
      const { data: row, error } = await client.from('user_state').select('data').eq('user_id', user.id).maybeSingle();
      if (error) throw error;
      const remote = (row && row.data) || {};
      const merged = core.merge(local, remote, now);
      if (applyLocal(merged, allowReload)) return; // reloading
      if (core.canon(merged) !== core.canon(remote)) {
        const { error: e2 } = await client.from('user_state')
          .upsert({ user_id: user.id, data: merged, updated_at: new Date(now).toISOString() });
        if (e2) throw e2;
      }
      lastSync = Date.now();
      state = 'ok';
      renderUI();
    } catch (e) {
      state = 'error';
      renderUI('');
      retryLater();
    } finally {
      busy = false;
      if (again) { again = false; syncNow(); }
    }
  }
  let retryTimer = null;
  function retryLater() {
    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => syncNow(), 30000);
  }

  // Push soon after a real edit; time-tracking ticks are batched once a minute.
  let pushTimer = null, pushDue = 0, lastCore = null, lastFull = null;
  function schedule(delay) {
    const due = Date.now() + delay;
    if (pushTimer && pushDue <= due) return;
    clearTimeout(pushTimer);
    pushDue = due;
    pushTimer = setTimeout(() => { pushTimer = null; syncNow(); }, delay);
  }
  const signatures = () => {
    const tasks = localTasks();
    return {
      full: JSON.stringify(tasks.map(core.taskKey)),
      core: JSON.stringify(tasks.map((t) => { const c = Object.assign({}, t); delete c.updatedAt; delete c.timeSpent; return c; }))
    };
  };
  // What's on screen after a sync, so the next save is compared against it.
  function rememberSignatures() { const s = signatures(); lastCore = s.core; lastFull = s.full; }
  function onTasksSaved() {
    const s = signatures();
    if (s.core !== lastCore) { lastCore = s.core; lastFull = s.full; schedule(1500); }
    else if (s.full !== lastFull) { lastFull = s.full; schedule(60000); }
  }

  // Watch this page's own saves.
  try {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      const tracked = this === store && !applying && (k === TASKS_KEY || SETTINGS_KEYS.includes(k));
      const prev = tracked ? this.getItem(k) : null;
      original.call(this, k, v);
      if (!tracked || !user) return;
      if (k === TASKS_KEY) onTasksSaved();
      else if (prev !== v) { meta.ts[k] = Date.now(); saveMeta(); schedule(1500); }
    };
  } catch (_) { /* storage unavailable: nothing to watch */ }

  // Live updates from other devices.
  let channel = null, pullTimer = null;
  function subscribe() {
    if (channel) return;
    channel = client.channel('user-state-' + user.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_state', filter: 'user_id=eq.' + user.id }, () => {
        clearTimeout(pullTimer);
        pullTimer = setTimeout(() => syncNow(), 800);
      })
      .subscribe();
  }
  function unsubscribe() {
    if (channel) { client.removeChannel(channel); channel = null; }
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && user) syncNow(); });
  window.addEventListener('online', () => { if (user) syncNow(); });

  // ---- sign in / out ----
  client.auth.onAuthStateChange((event, session) => {
    const was = user && user.id;
    user = session ? session.user : null;
    if (!user) { unsubscribe(); state = 'off'; renderUI(); return; }
    if (was !== user.id) {
      lastCore = null;
      subscribe();
      syncNow(true);
    }
    renderUI();
  });

  $('syncSignedOut').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const email = $('syncEmail').value.trim();
    if (!email) return;
    $('syncSend').disabled = true;
    renderUI(T('جارٍ الإرسال…'));
    const { error } = await client.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: location.origin + location.pathname }
    });
    $('syncSend').disabled = false;
    renderUI(error
      ? `${T('تعذّر إرسال الرابط:')} ${error.message}`
      : T('أرسلنا رابط الدخول إلى بريدك. افتحه على أي جهاز، وستُسجَّل دخولك تلقائياً.'));
  });
  $('syncNow').addEventListener('click', () => syncNow());
  $('syncOut').addEventListener('click', async () => {
    await client.auth.signOut();
    meta = { ts: meta.ts, base: {}, tombs: {} };
    saveMeta();
    renderUI(T('سجّلت الخروج. مهامك باقية على هذا الجهاز.'));
  });

  renderUI();
})();
