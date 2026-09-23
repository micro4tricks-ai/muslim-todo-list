// ---------- Tasks + focus timer ----------
// Task model ported from nagesh882/to-do-list-project (title unique, description,
// completed, created_at; add / update / delete). Time tracking, focus (Pomodoro)
// sessions, sub-tasks and estimates follow super-productivity/super-productivity.
// Everything is stored in this browser.
(() => {
  'use strict';
  const STORE_KEY = 'noon-sweep-v2';
  const SEEDED_KEY = 'noon-sweep-v2-seeded';
  const LEGACY_KEY = 'noon-sweep-todos';
  const LONG_EVERY = 4;

  const $ = (id) => document.getElementById(id);
  const list = $('list'), form = $('taskForm');
  const fTitle = $('fTitle'), fDesc = $('fDesc'), fDone = $('fDone'), fEst = $('fEst'), fSubs = $('fSubs');
  const eTitle = $('eTitle');

  // ---- formatting ----
  const I = window.noonI18n, T = I.t;
  const ar = I.num;
  const pad = (n) => String(n).padStart(2, '0');
  const fmtTimer = (ms) => {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return ar(`${pad(Math.floor(s / 60))}:${pad(s % 60)}`);
  };
  const fmtDur = (ms) => {
    const mins = Math.floor(ms / 60000);
    const h = Math.floor(mins / 60), m = mins % 60;
    return I.dur(h, m);
  };
  const dayKey = (t = Date.now()) => {
    const d = new Date(t);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const dateFmt = new Intl.DateTimeFormat(I.locale, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  const uid = () => Date.now() + Math.floor(Math.random() * 1000);

  // ---- state ----
  function defaults() {
    return {
      tasks: [],
      track: { taskId: null, since: null },
      focus: { mode: 'focus', running: false, startEpoch: 0, endEpoch: 0, remainingMs: 25 * 60000, durations: { focus: 25, short: 5, long: 15 }, day: dayKey(), count: 0 },
      filter: 'open'
    };
  }
  function normalizeTask(t) {
    return {
      id: t.id, title: t.title, description: t.description || '',
      estimateMin: t.estimateMin || 0, subtasks: t.subtasks || [],
      completed: !!t.completed, createdAt: t.createdAt || Date.now(),
      completedAt: t.completedAt || (t.completed ? t.createdAt : null),
      timeSpent: t.timeSpent || {}
    };
  }
  function load() {
    const s = defaults();
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        Object.assign(s, saved, { focus: Object.assign(s.focus, saved.focus || {}) });
        s.tasks = (saved.tasks || []).map(normalizeTask);
        if (saved.focus && saved.focus.lenMin && !saved.focus.durations) s.focus.durations.focus = saved.focus.lenMin;
        return s;
      }
      const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || '[]');
      s.tasks = legacy.filter((t) => !/^Example:/.test(t.title)).map(normalizeTask);
      if (!s.tasks.length && !localStorage.getItem(SEEDED_KEY)) {
        localStorage.setItem(SEEDED_KEY, '1');
        const now = Date.now();
        s.tasks = [
          normalizeTask({
            id: now - 2, title: T('مثال: ترتيب أولويات الأسبوع'), description: T('مهمة تجريبية، عدّلها أو احذفها.'),
            estimateMin: 30, createdAt: now - 3600e3, timeSpent: { [dayKey()]: 12 * 60000 },
            subtasks: [{ id: now - 5, title: T('مراجعة البريد'), done: true }, { id: now - 4, title: T('تحديد أهم ٣ مهام'), done: false }]
          }),
          normalizeTask({
            id: now - 1, title: T('مثال: قراءة ٢٠ صفحة'), description: T('مهمة تجريبية مكتملة.'),
            estimateMin: 25, completed: true, completedAt: now - 1800e3, createdAt: now - 7200e3,
            timeSpent: { [dayKey()]: 27 * 60000 }
          })
        ];
      }
    } catch (_) { /* storage unavailable: start fresh */ }
    return s;
  }
  const S = load();
  let lastSave = 0;
  function save() {
    lastSave = Date.now();
    try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (_) { /* keep in memory */ }
  }
  const taskById = (id) => S.tasks.find((t) => t.id === id);
  const spentToday = (t) => t.timeSpent[dayKey()] || 0;
  const spentTotal = (t) => Object.values(t.timeSpent).reduce((a, b) => a + b, 0);

  // ---- time tracking ----
  const isTracking = () => S.track.taskId !== null && S.track.since !== null;
  function commitTracking() {
    if (!isTracking()) return;
    const t = taskById(S.track.taskId);
    const now = Date.now();
    if (t) {
      const k = dayKey();
      t.timeSpent[k] = (t.timeSpent[k] || 0) + Math.max(0, now - S.track.since);
    }
    S.track.since = now;
  }
  function startTracking(id) {
    commitTracking();
    S.track = { taskId: id, since: Date.now() };
  }
  function stopTracking() {
    commitTracking();
    S.track.since = null;
  }
  function clearCurrent() {
    stopTracking();
    S.track.taskId = null;
  }

  // ---- focus timer ----
  const F = S.focus;
  const modeMs = (mode) => F.durations[mode] * 60000;
  const MODE_LABEL = { focus: T('جلسة تركيز'), short: T('استراحة قصيرة'), long: T('استراحة طويلة') };
  if (F.day !== dayKey()) { F.day = dayKey(); F.count = 0; }

  // Exposed to the clock script, which draws the session on the dial.
  window.noonFocus = () => ({ running: F.running, mode: F.mode === 'focus' ? 'focus' : 'break', startEpoch: F.startEpoch, endEpoch: F.endEpoch });

  let audio = null;
  function chime() {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      [660, 880].forEach((hz, i) => {
        const o = audio.createOscillator(), g = audio.createGain();
        const t0 = audio.currentTime + i * 0.22;
        o.frequency.value = hz;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.6);
        o.connect(g).connect(audio.destination);
        o.start(t0); o.stop(t0 + 0.65);
      });
    } catch (_) { /* sound unavailable */ }
  }

  function focusStart() {
    const now = Date.now();
    // Anchor the start so the dial ring shows elapsed time across pauses.
    F.startEpoch = now - (modeMs(F.mode) - F.remainingMs);
    F.endEpoch = now + F.remainingMs;
    F.running = true;
    if (F.mode === 'focus' && S.track.taskId !== null && !isTracking()) startTracking(S.track.taskId);
    try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); } catch (_) {}
  }
  function focusPause() {
    F.remainingMs = Math.max(0, F.endEpoch - Date.now());
    F.running = false;
    if (F.mode === 'focus') stopTracking();
  }
  function setMode(mode, autoStart) {
    F.mode = mode;
    F.remainingMs = modeMs(mode);
    F.running = false;
    if (autoStart) focusStart();
  }
  function focusFinish(counted) {
    if (F.mode === 'focus') {
      if (counted) F.count += 1;
      stopTracking();
      setMode(F.count > 0 && F.count % LONG_EVERY === 0 && counted ? 'long' : 'short', true);
    } else {
      setMode('focus', false);
    }
  }

  // ---- rendering ----
  const CHECK_SVG = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.2 5 8.6 9.6 3.6" fill="none" stroke="#FFFFFF" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const PLAY_SVG = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 1.8v8.4L10 6z" fill="currentColor"/></svg>';
  const PAUSE_SVG = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 1.8h2.4v8.4H2.5zM7.1 1.8h2.4v8.4H7.1z" fill="currentColor"/></svg>';

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function fillMeta(li, t) {
    const meta = li.querySelector('.task-meta');
    meta.replaceChildren();
    const tracking = isTracking() && S.track.taskId === t.id;
    const today = el('span', tracking ? 'live' : '', `${T('اليوم')} ${fmtDur(spentToday(t))}`);
    meta.append(today, el('span', '', `${T('الإجمالي')} ${fmtDur(spentTotal(t))}`), el('span', '', `${T('أُنشئت')} ${dateFmt.format(t.createdAt)}`));
    const est = li.querySelector('.est');
    if (est) {
      const total = spentTotal(t), estMs = t.estimateMin * 60000;
      const bar = est.querySelector('.est-bar');
      bar.classList.toggle('over', total > estMs);
      bar.firstChild.style.width = Math.min(100, (total / estMs) * 100) + '%';
      est.querySelector('.est-text').textContent = `${fmtDur(total)} ${T('من')} ${fmtDur(estMs)}`;
    }
  }

  function renderTask(t) {
    const li = el('li', 'task');
    li.dataset.id = t.id;
    li.classList.toggle('is-done', t.completed);
    li.classList.toggle('is-current', S.track.taskId === t.id);
    li.classList.toggle('is-tracking', isTracking() && S.track.taskId === t.id);

    const status = el('button', 'status');
    status.type = 'button';
    status.dataset.act = 'toggle';
    status.setAttribute('aria-pressed', String(t.completed));
    status.setAttribute('aria-label', t.completed ? `${T('إلغاء إكمال')} «${t.title}»` : (I.isEn ? `${T('تعليم كمكتملة:')} «${t.title}»` : `تعليم «${t.title}» كمكتملة`));
    status.innerHTML = CHECK_SVG;

    const body = el('div', 'task-body');
    body.append(el('p', 'task-title', t.title));
    if (t.description) body.append(el('p', 'task-desc', t.description));

    if (t.subtasks.length) {
      const ul = el('ul', 'subtasks');
      for (const s of t.subtasks) {
        const item = el('li', s.done ? 'sub-done' : '');
        const lab = el('label');
        const cb = el('input');
        cb.type = 'checkbox';
        cb.checked = s.done;
        cb.dataset.act = 'sub';
        cb.dataset.sub = s.id;
        cb.id = `sub-${s.id}`;
        lab.htmlFor = cb.id;
        lab.append(cb, el('span', '', s.title));
        item.append(lab);
        ul.append(item);
      }
      body.append(ul);
    }
    if (!t.completed) {
      const add = el('div', 'sub-add');
      const inp = el('input');
      inp.id = `subadd-${t.id}`;
      inp.placeholder = T('+ مهمة فرعية (اضغط Enter)');
      inp.setAttribute('aria-label', `${T('إضافة مهمة فرعية إلى')} «${t.title}»`);
      inp.dataset.act = 'subadd';
      add.append(inp);
      body.append(add);
    }
    if (t.estimateMin > 0) {
      const est = el('div', 'est');
      const bar = el('div', 'est-bar');
      bar.append(el('span'));
      est.append(bar, el('span', 'est-text'));
      body.append(est);
    }
    body.append(el('p', 'task-meta'));

    const actions = el('div', 'task-actions');
    if (!t.completed) {
      const tracking = isTracking() && S.track.taskId === t.id;
      const play = el('button', 'play');
      play.type = 'button';
      play.dataset.act = 'track';
      play.innerHTML = tracking ? PAUSE_SVG : PLAY_SVG;
      play.setAttribute('aria-label', T(tracking ? 'إيقاف تتبّع الوقت' : 'ابدأ تتبّع الوقت لهذه المهمة'));
      play.title = play.getAttribute('aria-label');
      actions.append(play);
    }
    const edit = el('button', 'link-btn', T('تعديل'));
    edit.type = 'button'; edit.dataset.act = 'edit';
    const del = el('button', 'link-btn danger', T('حذف'));
    del.type = 'button'; del.dataset.act = 'delete';
    actions.append(edit, del);

    li.append(status, body, actions);
    fillMeta(li, t);
    return li;
  }

  function render() {
    const visible = S.tasks
      .filter((t) => S.filter === 'all' || (S.filter === 'done' ? t.completed : !t.completed))
      .sort((a, b) => (S.filter === 'done' ? (b.completedAt || 0) - (a.completedAt || 0) : b.createdAt - a.createdAt));
    document.querySelectorAll('.filter button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filter === S.filter)));
    list.replaceChildren();
    if (!visible.length) {
      const msg = T(S.filter === 'done' ? 'لا توجد مهام مكتملة بعد.' : S.filter === 'open' && S.tasks.length ? 'أنجزت كل المهام. أحسنت!' : 'لا توجد مهام بعد. اضغط «إضافة مهمة» لإنشاء أول مهمة.');
      list.append(el('li', 'empty', msg));
    } else {
      for (const t of visible) list.append(renderTask(t));
    }
    renderLive();
    window.dispatchEvent(new CustomEvent('noon-focus', { detail: { mode: F.mode, running: F.running } }));
  }

  function renderSummary() {
    const open = S.tasks.filter((t) => !t.completed).length;
    const today = dayKey();
    const doneToday = S.tasks.filter((t) => t.completed && t.completedAt && dayKey(t.completedAt) === today).length;
    const worked = S.tasks.reduce((sum, t) => sum + spentToday(t), 0);
    const parts = [
      [ar(open), T('مهام حالية')],
      [ar(doneToday), T('أُنجزت اليوم')],
      [fmtDur(worked), T('وقت العمل اليوم')],
      [ar(F.count), T('جلسات تركيز')]
    ];
    const box = $('summary');
    box.replaceChildren(...parts.map(([v, label]) => {
      const s = el('span');
      s.append(el('b', 'num', v), ' ' + label);
      return s;
    }));
  }

  // ---- focus dial (a 60-minute "time timer": the arc is the time left) ----
  const DIAL_C = 120, DIAL_R = 92;
  const focusEl = $('focus'), dial = $('dial'), dialArc = $('dialArc'), knob = $('dialKnob');
  const polar = (deg, r) => {
    const a = (deg - 90) * Math.PI / 180;
    return [DIAL_C + r * Math.cos(a), DIAL_C + r * Math.sin(a)];
  };
  function arcPath(deg) {
    if (deg <= 0.05) return '';
    const [x0, y0] = polar(0, DIAL_R);
    if (deg >= 359.95) {
      const [xh, yh] = polar(180, DIAL_R);
      return `M${x0} ${y0}A${DIAL_R} ${DIAL_R} 0 1 1 ${xh} ${yh}A${DIAL_R} ${DIAL_R} 0 1 1 ${x0} ${y0}`;
    }
    const [x1, y1] = polar(deg, DIAL_R);
    return `M${x0} ${y0}A${DIAL_R} ${DIAL_R} 0 ${deg > 180 ? 1 : 0} 1 ${x1} ${y1}`;
  }
  (function buildTicks() {
    const g = $('dialTicks');
    const NS = 'http://www.w3.org/2000/svg';
    for (let i = 0; i < 60; i++) {
      const major = i % 5 === 0;
      const [xa, ya] = polar(i * 6, major ? 103 : 105);
      const [xb, yb] = polar(i * 6, 111);
      const ln = document.createElementNS(NS, 'line');
      ln.setAttribute('x1', xa); ln.setAttribute('y1', ya);
      ln.setAttribute('x2', xb); ln.setAttribute('y2', yb);
      ln.setAttribute('class', major ? 'tick tick-major' : 'tick');
      g.append(ln);
    }
  })();

  let noteTimer = null;
  function note(msg) {
    $('focusNote').textContent = msg;
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => { $('focusNote').textContent = ''; }, 2500);
  }

  function renderFocus() {
    const remaining = F.running ? Math.max(0, F.endEpoch - Date.now()) : F.remainingMs;
    const deg = Math.min(360, (remaining / 3600000) * 360);
    focusEl.dataset.mode = F.mode;
    focusEl.classList.toggle('is-running', F.running);
    dialArc.setAttribute('d', arcPath(deg));
    const [kx, ky] = polar(deg, DIAL_R);
    knob.setAttribute('cx', kx);
    knob.setAttribute('cy', ky);
    const mins = F.durations[F.mode];
    knob.setAttribute('aria-valuenow', String(mins));
    knob.setAttribute('aria-valuetext', `${ar(mins)} ${T('دقيقة')}`);
    knob.setAttribute('aria-disabled', String(F.running));
    $('focusTime').textContent = fmtTimer(remaining);
    const paused = !F.running && F.remainingMs < modeMs(F.mode);
    $('dialHint').textContent = T(F.running ? 'اضغط للإيقاف المؤقت' : paused ? 'اضغط للاستئناف' : 'اضغط للبدء');
    $('focusToggle').setAttribute('aria-label', T(F.running ? 'إيقاف مؤقت' : paused ? 'استئناف' : 'ابدأ الجلسة'));
    $('focusMode').textContent = MODE_LABEL[F.mode];
    document.querySelectorAll('.modes button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === F.mode)));
    const cyc = $('cycle');
    const filled = F.count % LONG_EVERY || (F.count ? LONG_EVERY : 0);
    cyc.replaceChildren(...Array.from({ length: LONG_EVERY }, (_, i) => el('i', i < filled ? 'on' : '')));
    const cur = taskById(S.track.taskId);
    $('focusTask').textContent = F.mode !== 'focus'
      ? T('خذ استراحة بعيداً عن الشاشة.')
      : cur ? `${T('تعمل على:')} ${cur.title}` : T('اختر مهمة بزر التشغيل ▶ لتتبّع وقتها أثناء التركيز.');
  }

  function renderLive() {
    renderSummary();
    renderFocus();
    if (S.track.taskId !== null) {
      const li = list.querySelector(`.task[data-id="${S.track.taskId}"]`);
      const t = taskById(S.track.taskId);
      if (li && t) fillMeta(li, t);
    }
  }

  // ---- form ----
  let editingId = null;
  function openForm(task) {
    editingId = task ? task.id : null;
    $('formTitle').textContent = T(task ? 'تعديل المهمة' : 'إضافة مهمة');
    $('submitBtn').textContent = T(task ? 'حفظ التعديلات' : 'إضافة المهمة');
    fTitle.value = task ? task.title : '';
    fDesc.value = task ? task.description : '';
    fEst.value = task && task.estimateMin ? task.estimateMin : '';
    fSubs.value = task ? task.subtasks.map((s) => s.title).join('\n') : '';
    fDone.checked = task ? task.completed : false;
    showError('');
    form.hidden = false;
    fTitle.focus();
  }
  function closeForm() { form.hidden = true; editingId = null; }
  function showError(msg) {
    eTitle.textContent = msg;
    eTitle.hidden = !msg;
    fTitle.setAttribute('aria-invalid', msg ? 'true' : 'false');
  }
  function setCompleted(t, done) {
    t.completed = done;
    t.completedAt = done ? Date.now() : null;
    if (done && S.track.taskId === t.id) clearCurrent();
  }

  $('addBtn').addEventListener('click', () => openForm(null));
  $('langBtn').addEventListener('click', () => I.setLang(I.isEn ? 'ar' : 'en'));
  $('cancelBtn').addEventListener('click', closeForm);

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const title = fTitle.value.trim();
    if (!title) return showError(T('اكتب عنواناً للمهمة.'));
    if (S.tasks.some((t) => t.id !== editingId && t.title.toLowerCase() === title.toLowerCase())) {
      return showError(T('توجد مهمة بنفس العنوان. اختر عنواناً مختلفاً.'));
    }
    const estimateMin = Math.max(0, Math.round(Number(fEst.value) || 0));
    const subTitles = fSubs.value.split('\n').map((s) => s.trim()).filter(Boolean);
    const existing = editingId !== null ? taskById(editingId) : null;
    const subtasks = subTitles.map((st, i) => {
      const prev = existing && existing.subtasks.find((s) => s.title === st);
      return prev || { id: uid() + i, title: st, done: false };
    });
    if (existing) {
      Object.assign(existing, { title, description: fDesc.value.trim(), estimateMin, subtasks });
      if (existing.completed !== fDone.checked) setCompleted(existing, fDone.checked);
    } else {
      const t = normalizeTask({ id: uid(), title, description: fDesc.value.trim(), estimateMin, subtasks, createdAt: Date.now() });
      if (fDone.checked) setCompleted(t, true);
      S.tasks.push(t);
    }
    save(); closeForm(); render();
  });

  // ---- list interactions ----
  let confirmTimer = null;
  list.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-act]');
    if (!btn) return;
    const id = Number(btn.closest('.task').dataset.id);
    const t = taskById(id);
    if (!t) return;
    const act = btn.dataset.act;
    if (act === 'toggle') {
      setCompleted(t, !t.completed);
    } else if (act === 'track') {
      if (isTracking() && S.track.taskId === id) stopTracking();
      else startTracking(id);
    } else if (act === 'edit') {
      openForm(t);
      form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    } else if (act === 'delete') {
      if (!btn.classList.contains('confirming')) {
        list.querySelectorAll('.confirming').forEach((b) => { b.classList.remove('confirming'); b.textContent = T('حذف'); });
        btn.classList.add('confirming');
        btn.textContent = T('تأكيد الحذف');
        clearTimeout(confirmTimer);
        confirmTimer = setTimeout(() => { btn.classList.remove('confirming'); btn.textContent = T('حذف'); }, 3000);
        return;
      }
      clearTimeout(confirmTimer);
      if (S.track.taskId === id) clearCurrent();
      S.tasks = S.tasks.filter((x) => x.id !== id);
      if (editingId === id) closeForm();
    }
    save(); render();
  });

  list.addEventListener('change', (ev) => {
    const cb = ev.target;
    if (cb.dataset.act !== 'sub') return;
    const t = taskById(Number(cb.closest('.task').dataset.id));
    const s = t && t.subtasks.find((x) => String(x.id) === cb.dataset.sub);
    if (!s) return;
    s.done = cb.checked;
    cb.closest('li').className = s.done ? 'sub-done' : '';
    save();
  });

  list.addEventListener('keydown', (ev) => {
    const inp = ev.target;
    if (inp.dataset.act !== 'subadd' || ev.key !== 'Enter') return;
    ev.preventDefault();
    const title = inp.value.trim();
    const t = taskById(Number(inp.closest('.task').dataset.id));
    if (!title || !t) return;
    t.subtasks.push({ id: uid(), title, done: false });
    save(); render();
    const again = $(`subadd-${t.id}`);
    if (again) again.focus();
  });

  document.querySelector('.filter').addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-filter]');
    if (!b) return;
    S.filter = b.dataset.filter;
    save(); render();
  });

  // ---- focus controls ----
  function toggleFocus() {
    if (F.running) focusPause(); else focusStart();
    save(); render();
  }
  function setDuration(m) {
    m = Math.min(60, Math.max(1, Math.round(m)));
    F.durations[F.mode] = m;
    F.remainingMs = m * 60000;
    save(); renderFocus();
  }
  const blockedWhileRunning = () => {
    if (!F.running) return false;
    note(T('أوقف المؤقت أولاً لتغيير المدة.'));
    return true;
  };

  $('focusToggle').addEventListener('click', toggleFocus);
  $('focusSkip').addEventListener('click', () => { focusFinish(false); save(); render(); });
  $('focusReset').addEventListener('click', () => {
    if (F.running && F.mode === 'focus') stopTracking();
    F.running = false;
    F.remainingMs = modeMs(F.mode);
    save(); render();
  });
  $('focusPlus').addEventListener('click', () => {
    if (F.running) {
      F.endEpoch += 5 * 60000;
      if (F.endEpoch - Date.now() > 3600000) F.endEpoch = Date.now() + 3600000;
      save(); renderFocus();
    } else {
      setDuration(Math.min(60, Math.round(F.remainingMs / 60000) + 5));
    }
  });
  document.querySelector('.modes').addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-mode]');
    if (!b || b.dataset.mode === F.mode) return;
    if (F.running) focusPause();
    setMode(b.dataset.mode, false);
    save(); render();
  });

  // Drag the knob (or anywhere on the ring) to set the minutes, like a kitchen timer.
  let dragging = false, lastMin = null;
  function minutesAt(ev) {
    const r = dial.getBoundingClientRect();
    const x = ((ev.clientX - r.left) / r.width) * 240 - DIAL_C;
    const y = ((ev.clientY - r.top) / r.height) * 240 - DIAL_C;
    let deg = Math.atan2(x, -y) * 180 / Math.PI;
    if (deg < 0) deg += 360;
    let m = Math.round(deg / 6);
    // Don't jump across 12 o'clock: stick at 60 or 1 when the drag wraps.
    if (lastMin !== null) {
      if (lastMin >= 45 && m <= 15) m = 60;
      else if (lastMin <= 15 && m >= 45) m = 1;
    }
    if (m === 0) m = lastMin !== null && lastMin >= 30 ? 60 : 1;
    return m;
  }
  dial.addEventListener('pointerdown', (ev) => {
    if (blockedWhileRunning()) return;
    dragging = true;
    lastMin = F.durations[F.mode];
    dial.setPointerCapture(ev.pointerId);
    dial.classList.add('dragging');
    const m = minutesAt(ev);
    lastMin = m;
    setDuration(m);
    ev.preventDefault();
  });
  dial.addEventListener('pointermove', (ev) => {
    if (!dragging) return;
    const m = minutesAt(ev);
    if (m !== lastMin) { lastMin = m; setDuration(m); }
  });
  const endDrag = () => { dragging = false; lastMin = null; dial.classList.remove('dragging'); };
  dial.addEventListener('pointerup', endDrag);
  dial.addEventListener('pointercancel', endDrag);

  $('dialWrap').addEventListener('wheel', (ev) => {
    ev.preventDefault();
    if (blockedWhileRunning()) return;
    setDuration(F.durations[F.mode] + (ev.deltaY < 0 ? 1 : -1));
  }, { passive: false });

  knob.addEventListener('keydown', (ev) => {
    const steps = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 5, PageDown: -5 };
    let m = null;
    if (ev.key in steps) m = F.durations[F.mode] + steps[ev.key];
    else if (ev.key === 'Home') m = 1;
    else if (ev.key === 'End') m = 60;
    if (m === null) return;
    ev.preventDefault();
    if (blockedWhileRunning()) return;
    setDuration(m);
  });

  // ---- keyboard shortcuts ----
  document.addEventListener('keydown', (ev) => {
    const tag = ev.target.tagName;
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    if (ev.key === 'Escape' && !form.hidden) { closeForm(); return; }
    if (typing || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (ev.code === 'KeyN') { ev.preventDefault(); openForm(null); }
    else if (ev.code === 'Space' && tag !== 'BUTTON') { ev.preventDefault(); toggleFocus(); }
  });

  // ---- tick ----
  function tick() {
    if (F.day !== dayKey()) { F.day = dayKey(); F.count = 0; }
    if (F.running && Date.now() >= F.endEpoch) {
      const wasFocus = F.mode === 'focus';
      focusFinish(true);
      chime();
      save(); render();
      if (wasFocus) return;
    }
    commitTracking();
    renderLive();
    if (Date.now() - lastSave > 5000) save();
  }
  setInterval(tick, 500);
  document.addEventListener('visibilitychange', () => { commitTracking(); save(); });
  window.addEventListener('pagehide', () => { commitTracking(); save(); });

  // Resuming after the page was closed: don't credit the closed period as work,
  // and drop a focus session that ended long ago.
  if (isTracking()) S.track.since = Date.now();
  if (F.running && Date.now() > F.endEpoch + 60000) setMode('focus', false);

  render();
})();
