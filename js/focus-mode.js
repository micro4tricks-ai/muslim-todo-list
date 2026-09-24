// ---------- Full-screen focus mode ----------
// A large animated ring timer with the current task and its subtasks, breathing
// guide and a dhikr during breaks, a distraction box, the next prayer, and the
// sound dock. Keeps the screen awake while a session runs.
(() => {
  'use strict';
  const { T, I, el, button, toast } = window.noonUI;
  const $ = (id) => document.getElementById(id);
  const ctl = () => window.noonFocusControl;
  const NS = 'http://www.w3.org/2000/svg';
  const R = 150, C = 2 * Math.PI * R;
  const pad = (n) => String(n).padStart(2, '0');
  const fmtTime = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return I.num(`${pad(Math.floor(s / 60))}:${pad(s % 60)}`); };
  const clockFmt = new Intl.DateTimeFormat(I.locale, { hour: 'numeric', minute: '2-digit' });

  const root = el('div', 'fm');
  root.id = 'focusOverlay';
  root.hidden = true;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', T('وضع التركيز'));
  root.dir = I.dir;
  root.lang = I.lang;
  document.body.append(root);

  // ---- build once ----
  const top = el('div', 'fm-top');
  const info = el('div', 'fm-info');
  const now = el('span', 'fm-now'), prayer = el('span', 'fm-prayer');
  info.append(now, prayer);
  const tools = el('div', 'fm-tools');
  const fsBtn = button('fm-icon', '', () => toggleFullscreen(), T('ملء الشاشة'));
  fsBtn.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
  const soundBtn = button('fm-icon', '', () => { const t = $('dockToggle'); if (t) t.click(); }, T('الأصوات'));
  soundBtn.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 6h3l4-3v10l-4-3H2zM11.5 5.5a3.5 3.5 0 0 1 0 5M13 3.5a6 6 0 0 1 0 9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const exitBtn = button('fm-icon', '', () => close(), T('خروج من وضع التركيز'));
  exitBtn.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
  tools.append(soundBtn, fsBtn, exitBtn);
  top.append(info, tools);

  const modes = el('div', 'fm-modes');
  modes.setAttribute('role', 'tablist');
  const modeBtns = [['focus', 'تركيز'], ['short', 'استراحة قصيرة'], ['long', 'استراحة طويلة']].map(([m, label]) => {
    const b = button('fm-mode', T(label), () => ctl().setMode(m));
    b.dataset.mode = m;
    b.setAttribute('role', 'tab');
    modes.append(b);
    return b;
  });

  // Ring: track, gradient progress, 60 ticks, glowing head.
  const stage = el('div', 'fm-stage');
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 360 360');
  svg.setAttribute('class', 'fm-ring');
  svg.innerHTML = `
    <defs>
      <linearGradient id="fmGradFocus" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF9A6B"/><stop offset="1" stop-color="#E0473A"/></linearGradient>
      <linearGradient id="fmGradBreak" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8FE3B4"/><stop offset="1" stop-color="#2F9E6A"/></linearGradient>
      <filter id="fmGlow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>
    <g class="fm-ticks"></g>
    <circle class="fm-track" cx="180" cy="180" r="${R}"/>
    <circle class="fm-arc" cx="180" cy="180" r="${R}" stroke-dasharray="${C}" stroke-dashoffset="0" transform="rotate(-90 180 180)" filter="url(#fmGlow)"/>
    <circle class="fm-head" cx="180" cy="${180 - R}" r="7"/>`;
  const ticks = svg.querySelector('.fm-ticks');
  for (let i = 0; i < 60; i++) {
    const a = (i * 6 - 90) * Math.PI / 180, r1 = i % 5 ? 168 : 164, r2 = 174;
    const ln = document.createElementNS(NS, 'line');
    ln.setAttribute('x1', 180 + r1 * Math.cos(a)); ln.setAttribute('y1', 180 + r1 * Math.sin(a));
    ln.setAttribute('x2', 180 + r2 * Math.cos(a)); ln.setAttribute('y2', 180 + r2 * Math.sin(a));
    ln.setAttribute('class', i % 5 ? 'fm-tick' : 'fm-tick is-major');
    ticks.append(ln);
  }
  const arc = svg.querySelector('.fm-arc'), head = svg.querySelector('.fm-head');
  const center = el('div', 'fm-center');
  const breath = el('div', 'fm-breath');
  const time = el('div', 'fm-time', '25:00');
  const label = el('div', 'fm-label');
  const dots = el('div', 'fm-dots');
  const breathText = el('div', 'fm-breath-text');
  center.append(breath, time, label, dots, breathText);
  stage.append(svg, center);

  const controls = el('div', 'fm-controls');
  const resetBtn = button('fm-ctl', '', () => ctl().reset(), T('إعادة'));
  resetBtn.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8a5 5 0 1 0 1.5-3.6M3 2.5v3h3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const playBtn = button('fm-play', '', () => ctl().toggle(), T('ابدأ'));
  const plusBtn = button('fm-ctl fm-plus', T('+٥ دقائق'), () => ctl().plus5());
  const skipBtn = button('fm-ctl', '', () => ctl().skip(), T('تخطَّ'));
  skipBtn.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3l7 5-7 5zM12.5 3v10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  controls.append(resetBtn, playBtn, plusBtn, skipBtn);

  const task = el('section', 'fm-task');
  const tip = el('section', 'fm-tip');
  const distract = el('form', 'fm-distract');
  const dInput = el('input');
  dInput.id = 'fmDistract';
  dInput.placeholder = T('فكرة مشتتة؟ اكتبها واضغط Enter ثم أكمل');
  dInput.setAttribute('aria-label', T('فكرة مشتتة'));
  dInput.autocomplete = 'off';
  distract.append(dInput);
  distract.addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (window.noonFocusPlus && window.noonFocusPlus.addDistraction(dInput.value)) {
      dInput.value = '';
      dInput.placeholder = T('حُفظت ✓ أكمل تركيزك');
      setTimeout(() => { dInput.placeholder = T('فكرة مشتتة؟ اكتبها واضغط Enter ثم أكمل'); }, 2500);
    }
  });

  const main = el('div', 'fm-main');
  main.append(modes, stage, controls);
  const side = el('div', 'fm-side');
  side.append(task, tip, distract);
  root.append(top, main, side);

  // ---- rendering ----
  let lastSig = '', raf = 0, lastMode = null, wasRunning = false;
  function renderStatic(st) {
    const sig = JSON.stringify([st.mode, st.running, st.count, st.task, I.lang]);
    if (sig === lastSig) return;
    lastSig = sig;
    root.dataset.mode = st.mode;
    root.classList.toggle('is-running', st.running);
    modeBtns.forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === st.mode)));
    label.textContent = st.label;
    dots.replaceChildren(...Array.from({ length: st.every }, (_, i) => el('i', i < (st.count % st.every || (st.count ? st.every : 0)) ? 'on' : '')));
    playBtn.setAttribute('aria-label', st.running ? T('إيقاف مؤقت') : T('ابدأ'));
    playBtn.innerHTML = st.running
      ? '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 3h2.5v10H4.5zM9 3h2.5v10H9z" fill="currentColor"/></svg>'
      : '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3l8 5-8 5z" fill="currentColor"/></svg>';
    arc.setAttribute('stroke', st.mode === 'focus' ? 'url(#fmGradFocus)' : 'url(#fmGradBreak)');

    // Current task and its subtasks (tick them off right here).
    task.replaceChildren();
    if (st.mode !== 'focus') {
      task.hidden = true;
    } else {
      task.hidden = false;
      if (st.task) {
        task.append(el('p', 'fm-kicker', T('تعمل على')), el('h2', 'fm-task-title', st.task.title));
        if (st.task.subtasks.length) {
          const ul = el('ul', 'fm-subs');
          for (const s of st.task.subtasks) {
            const li = el('li');
            const b = button(`fm-sub${s.done ? ' is-done' : ''}`, s.title, () => ctl().toggleSubtask(st.task.id, s.id));
            b.setAttribute('aria-pressed', String(s.done));
            li.append(b);
            ul.append(li);
          }
          task.append(ul);
        }
      } else {
        task.append(el('p', 'fm-kicker', T('بدون مهمة محددة')), el('p', 'fm-hint', T('من قائمة المهام اضغط ▶ بجانب أي مهمة لتتبّع وقتها هنا.')));
      }
    }

    // Break: breathing guide + a suggestion from the useful-breaks list.
    tip.replaceChildren();
    tip.hidden = st.mode === 'focus';
    if (st.mode !== 'focus' && window.noonFocusPlus) {
      const { tip: t } = window.noonFocusPlus.tip();
      tip.append(el('p', 'fm-kicker', T('استراحة مفيدة')));
      const p = el('p', 'fm-tip-text', T(t.text));
      if (t.kind === 'dhikr' && !I.isEn) p.lang = 'ar';
      tip.append(p, el('p', 'fm-hint', T(t.note)));
      if (t.count) {
        let n = 0;
        const tap = button('fm-tap', `${I.num(0)} / ${I.num(t.count)}`, () => {
          n = Math.min(t.count, n + 1);
          tap.textContent = `${I.num(n)} / ${I.num(t.count)}`;
          if (navigator.vibrate) navigator.vibrate(10);
          tap.classList.toggle('is-done', n === t.count);
        }, T('عدّ'));
        tip.append(tap);
      }
    }
  }

  function frame() {
    if (root.hidden) return;
    const st = ctl().state();
    renderStatic(st);
    const p = st.total ? Math.min(1, st.remaining / st.total) : 0;
    arc.setAttribute('stroke-dashoffset', String(C * (1 - p)));
    const a = (-90 + 360 * p) * Math.PI / 180;
    head.setAttribute('cx', 180 + R * Math.cos(a));
    head.setAttribute('cy', 180 + R * Math.sin(a));
    time.textContent = fmtTime(st.remaining);
    // Breathing guide during breaks: 4 s in, 6 s out.
    if (st.mode !== 'focus') {
      const t = (Date.now() / 1000) % 10;
      breathText.textContent = t < 4 ? T('شهيق…') : T('زفير…');
    } else breathText.textContent = '';
    // Session finished while watching: a short celebratory pulse.
    if (lastMode && lastMode !== st.mode) { root.classList.remove('is-switch'); void root.offsetWidth; root.classList.add('is-switch'); }
    lastMode = st.mode;
    if (st.running !== wasRunning) { wasRunning = st.running; st.running ? lockScreen() : unlockScreen(); }
    raf = requestAnimationFrame(frame);
  }
  function renderInfo() {
    now.textContent = clockFmt.format(new Date());
    const snap = window.noonAstro && window.noonAstro.snapshot(Date.now());
    prayer.textContent = snap && snap.next ? `${snap.next.name} ${snap.next.time} · ${snap.next.inText}` : '';
  }

  // ---- screen wake lock ----
  let lock = null;
  async function lockScreen() { try { if ('wakeLock' in navigator && !lock) { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => { lock = null; }); } } catch (_) {} }
  function unlockScreen() { try { if (lock) lock.release(); } catch (_) {} lock = null; }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !root.hidden && wasRunning) lockScreen(); });

  // ---- open / close ----
  let infoTimer = 0, lastFocus = null;
  function open() {
    lastFocus = document.activeElement;
    root.hidden = false;
    document.body.classList.add('fm-open');
    lastSig = ''; lastMode = null;
    renderInfo();
    infoTimer = setInterval(renderInfo, 15000);
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
    playBtn.focus();
  }
  function close() {
    root.hidden = true;
    document.body.classList.remove('fm-open');
    clearInterval(infoTimer);
    cancelAnimationFrame(raf);
    unlockScreen(); wasRunning = false;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else if (root.requestFullscreen) root.requestFullscreen().catch(() => toast(T('المتصفح لم يسمح بملء الشاشة هنا.')));
  }
  $('focusModeBtn').addEventListener('click', open);

  // Keys inside focus mode: Space start/pause, Esc exit, F full screen, D distraction box.
  document.addEventListener('keydown', (ev) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName);
    if (root.hidden) {
      if (!typing && !ev.ctrlKey && !ev.metaKey && !ev.altKey && ev.code === 'KeyF') { ev.preventDefault(); open(); }
      return;
    }
    if (ev.key === 'Escape' && !document.fullscreenElement) { ev.preventDefault(); ev.stopPropagation(); close(); return; }
    if (typing) return;
    if (ev.code === 'Space') { ev.preventDefault(); ev.stopPropagation(); ctl().toggle(); }
    else if (ev.code === 'KeyF') { ev.preventDefault(); toggleFullscreen(); }
    else if (ev.code === 'KeyD') { ev.preventDefault(); dInput.focus(); }
  }, true);
  // Keep keyboard focus inside the dialog.
  root.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Tab') return;
    const f = [...root.querySelectorAll('button, input')].filter((x) => !x.disabled && x.offsetParent !== null);
    if (!f.length) return;
    if (ev.shiftKey && document.activeElement === f[0]) { ev.preventDefault(); f[f.length - 1].focus(); }
    else if (!ev.shiftKey && document.activeElement === f[f.length - 1]) { ev.preventDefault(); f[0].focus(); }
  });
  window.addEventListener('noon-prayer', (ev) => { if (!root.hidden) renderInfo(); });
  window.noonFocusMode = { open, close };
})();
