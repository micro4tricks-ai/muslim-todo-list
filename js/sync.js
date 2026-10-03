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
    'noon-sweep-distractions', 'noon-sweep-focuslog', 'noon-sweep-prayer-alerts', 'noon-sweep-quran', 'noon-sweep-sunnah',
    'noon-sweep-library', 'noon-sweep-card-look', 'noon-sweep-prayers', 'noon-sweep-zakat', 'noon-sweep-hifz'];
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
  const SITE_URL = 'https://micro4tricks-ai.github.io/muslim-todo-list/';
  const btn = $('syncBtn'), panel = $('syncPanel');
  let state = 'off', lastSync = 0, user = null, client = null;
  // A sign-in that arrives in the address (an email link) is synced only once the person agrees,
  // unless this browser asked for that very link: otherwise anyone could send a link carrying their
  // own account and collect the data of whoever opens it (login CSRF).
  const PENDING = 'noon-sweep-auth-pending';
  const UNSURE = 'noon-sweep-auth-unconfirmed'; // the account still waiting for an answer, across reloads
  let confirmed = true;
  const fromUrl = /(^|[#&])(access_token|error|error_description)=/.test(location.hash);
  function expect(email) { try { localStorage.setItem(PENDING, JSON.stringify({ email: String(email).toLowerCase(), at: Date.now() })); } catch (_) {} }
  function expected(email) {
    try {
      const p = JSON.parse(localStorage.getItem(PENDING) || 'null');
      return !!(p && p.email === String(email || '').toLowerCase() && Date.now() - p.at < 2 * 864e5);
    } catch (_) { return false; }
  }
  const timeFmt = new Intl.DateTimeFormat(I.locale, { hour: 'numeric', minute: '2-digit' });
  function renderUI(msg) {
    btn.dataset.state = state;
    const label = !client ? T('مزامنة')
      : !user ? T('تسجيل الدخول للمزامنة')
      : !confirmed ? T('بانتظار تأكيدك')
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
    if (!user || !confirmed) return;
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
      if (!tracked || !user || !confirmed) return;
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
    // Opened from a "set a new password" email: ask for it right away.
    if (event === 'PASSWORD_RECOVERY') {
      setTimeout(() => {
        panel.hidden = false;
        $('syncPassBox').open = true;
        $('syncNewPass').focus();
        renderUI(T('اكتب كلمة المرور الجديدة ثم اضغط «حفظ».'));
      }, 0);
    }
    if (!user) { unsubscribe(); confirmed = true; try { localStorage.removeItem(UNSURE); } catch (_) {} hideConfirm(); state = 'off'; renderUI(); return; }
    if (was !== user.id) {
      lastCore = null;
      let unsure = null;
      try { unsure = localStorage.getItem(UNSURE); } catch (_) {}
      if ((fromUrl && !expected(user.email)) || unsure === user.id) {
        confirmed = false;
        try { localStorage.setItem(UNSURE, user.id); } catch (_) {}
        askFirst(); renderUI(); return;
      }
      start();
    }
    renderUI();
  });
  function start() {
    confirmed = true;
    try { localStorage.removeItem(PENDING); localStorage.removeItem(UNSURE); } catch (_) {}
    hideConfirm();
    subscribe();
    syncNow(true);
  }
  // "You opened a sign-in link for … Sync this device with that account?"
  let confirmBox = null;
  function hideConfirm() { if (confirmBox) { confirmBox.remove(); confirmBox = null; } }
  function askFirst() {
    hideConfirm();
    confirmBox = document.createElement('div');
    confirmBox.className = 'sync-confirm';
    const p = document.createElement('p');
    p.textContent = `${T('فتحت رابط دخول لحساب')} ${user.email || ''}. ${T('هل تريد مزامنة بيانات هذا الجهاز (المهام والإعدادات) مع هذا الحساب؟')}`;
    const yes = document.createElement('button'); yes.type = 'button'; yes.className = 'btn btn-primary'; yes.textContent = T('نعم، هذا حسابي');
    const no = document.createElement('button'); no.type = 'button'; no.className = 'btn btn-quiet'; no.textContent = T('ليس حسابي');
    yes.addEventListener('click', () => { start(); renderUI(); });
    no.addEventListener('click', async () => { hideConfirm(); await client.auth.signOut(); renderUI(T('خرجنا من ذلك الحساب. بياناتك بقيت على هذا الجهاز ولم تُرسَل.')); });
    const row = document.createElement('div'); row.className = 'form-actions'; row.append(yes, no);
    confirmBox.append(p, row);
    $('syncSignedIn').prepend(confirmBox);
    setTimeout(() => { if (window.noonSettings) window.noonSettings.open('account'); else panel.hidden = false; }, 300);
  }

  // Email + password works everywhere, including the Android app and the iPhone
  // home-screen app, where a link from the email opens the browser instead.
  // The free email service can't carry sign-in codes, so the emails left are
  // "confirm your address" (once) and "set a new password".
  const field = (id) => $(id).value.trim();
  function authError(error) {
    const m = String(error.message || '').toLowerCase();
    if (m.includes('invalid login')) return T('البريد أو كلمة المرور غير صحيحة. إذا لم تضع كلمة مرور من قبل فاضغط «نسيت كلمة المرور».');
    if (m.includes('not confirmed')) return T('أكّد بريدك أولاً من الرسالة التي وصلتك، ثم اضغط «دخول».');
    if (m.includes('rate limit') || error.status === 429) return T('أُرسلت رسائل كثيرة. خدمة البريد المجانية ترسل رسالتين فقط في الساعة، فانتظر قليلاً ثم حاول.');
    if (m.includes('should be different') || m.includes('same password')) return T('هذه هي كلمة المرور الحالية نفسها.');
    if (m.includes('password')) return T('كلمة المرور قصيرة: ٦ أحرف على الأقل.');
    if (m.includes('email')) return T('اكتب بريداً إلكترونياً صحيحاً.');
    return `${T('حدث خطأ:')} ${error.message}`;
  }
  async function busyWith(btn, waitMsg, work) {
    btn.disabled = true;
    renderUI(T(waitMsg));
    try { await work(); } finally { btn.disabled = false; }
  }
  function needs(email, pass) {
    if (!email) { renderUI(T('اكتب بريدك الإلكتروني.')); $('syncEmail').focus(); return false; }
    if (pass !== undefined && pass.length < 6) { renderUI(T('كلمة المرور قصيرة: ٦ أحرف على الأقل.')); $('syncPass').focus(); return false; }
    return true;
  }
  $('syncSignedOut').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const email = field('syncEmail'), password = $('syncPass').value;
    if (!needs(email, password)) return;
    busyWith($('syncLogin'), 'جارٍ الدخول…', async () => {
      const { error } = await client.auth.signInWithPassword({ email, password });
      renderUI(error ? authError(error) : '');
      if (!error) $('syncPass').value = '';
    });
  });
  $('syncSignup').addEventListener('click', () => {
    const email = field('syncEmail'), password = $('syncPass').value;
    if (!needs(email, password)) return;
    busyWith($('syncSignup'), 'جارٍ إنشاء الحساب…', async () => {
      expect(email);
      const { data, error } = await client.auth.signUp({ email, password, options: { emailRedirectTo: SITE_URL } });
      if (error) { renderUI(authError(error)); return; }
      // An address that already has an account comes back with no identities.
      if (data.user && Array.isArray(data.user.identities) && !data.user.identities.length) {
        renderUI(T('لديك حساب بهذا البريد. اضغط «دخول»، أو «نسيت كلمة المرور» إذا لم تضع واحدة بعد.'));
      } else if (!data.session) {
        renderUI(T('أرسلنا رسالة تأكيد إلى بريدك. افتحها مرة واحدة على أي جهاز، ثم ارجع هنا واضغط «دخول».'));
      } else renderUI('');
    });
  });
  $('syncForgot').addEventListener('click', () => {
    const email = field('syncEmail');
    if (!needs(email)) return;
    busyWith($('syncForgot'), 'جارٍ الإرسال…', async () => {
      expect(email);
      const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: SITE_URL });
      renderUI(error ? authError(error)
        : T('أرسلنا رابطاً إلى بريدك. افتحه وستفتح صفحة الموقع لتكتب كلمة مرور جديدة، ثم استخدمها للدخول هنا.'));
    });
  });
  // The link opens the website; used on computers and browsers.
  $('syncSend').addEventListener('click', () => {
    const email = field('syncEmail');
    if (!needs(email)) return;
    busyWith($('syncSend'), 'جارٍ الإرسال…', async () => {
      expect(email);
      const { error } = await client.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.noonNative ? SITE_URL : location.origin + location.pathname }
      });
      renderUI(error ? authError(error)
        : T(window.noonNative
          ? 'أرسلنا رابط الدخول إلى بريدك. سيفتح الموقع في المتصفح؛ لتطبيق الموبايل ضع كلمة مرور من الموقع ثم ادخل بها هنا.'
          : 'أرسلنا رابط الدخول إلى بريدك. افتحه على أي جهاز، وستُسجَّل دخولك تلقائياً.'));
    });
  });
  // Signed in: set or change the password used on the phone app.
  $('syncSetPass').addEventListener('click', () => {
    const password = $('syncNewPass').value;
    if (password.length < 6) { renderUI(T('كلمة المرور قصيرة: ٦ أحرف على الأقل.')); $('syncNewPass').focus(); return; }
    busyWith($('syncSetPass'), 'جارٍ الحفظ…', async () => {
      const { error } = await client.auth.updateUser({ password });
      if (error) { renderUI(authError(error)); return; }
      $('syncNewPass').value = '';
      $('syncPassBox').open = false;
      renderUI(T('حُفظت كلمة المرور. استخدمها مع بريدك للدخول من تطبيق الموبايل.'));
    });
  });
  $('syncNewPass').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); $('syncSetPass').click(); } });
  // Delete the account and everything stored with it on the server (supabase/account.sql).
  // Two presses: the first asks, the second (within 6 seconds) deletes. This device keeps its data.
  let delArmed = 0;
  $('syncDelete').addEventListener('click', () => {
    const btn = $('syncDelete');
    if (Date.now() - delArmed > 6000) {
      delArmed = Date.now();
      btn.textContent = T('اضغط مرة أخرى للتأكيد');
      setTimeout(() => { if (Date.now() - delArmed >= 6000) btn.textContent = T('احذف حسابي نهائياً'); }, 6100);
      return;
    }
    delArmed = 0;
    busyWith(btn, 'جارٍ حذف الحساب…', async () => {
      const { error } = await client.rpc('delete_my_account');
      if (error) { renderUI(T('تعذّر حذف الحساب. تأكد من الاتصال وحاول مرة أخرى.')); return; }
      await client.auth.signOut({ scope: 'local' });
      meta = { ts: meta.ts, base: {}, tombs: {} };
      saveMeta();
      btn.textContent = T('احذف حسابي نهائياً');
      $('syncDelBox').open = false;
      renderUI(T('حُذف حسابك وكل ما حُفظ معه على الخادم. بياناتك على هذا الجهاز باقية.'));
    });
  });
  $('syncNow').addEventListener('click', () => syncNow());
  $('syncOut').addEventListener('click', async () => {
    await client.auth.signOut();
    meta = { ts: meta.ts, base: {}, tombs: {} };
    saveMeta();
    renderUI(T('سجّلت الخروج. مهامك باقية على هذا الجهاز.'));
  });

  // For the group khatma (js/khatma.js): the same client and the signed-in account.
  window.noonSync = { client: () => client, user: () => (confirmed ? user : null) };
  renderUI();
})();
