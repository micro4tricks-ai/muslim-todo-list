# Muslim Activity 2.3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the app to «مهام المسلم» / «Muslim Activity», ask for location and notifications on first launch, and give the clock three faces with interactive slots, a clear sunrise/sunset counter, a labelled multi-lap focus ring, a new moon and a qibla card.

**Architecture:** Pure geometry and time rules go in a new `js/clock-core.js` (tested with `node --test`); `js/clock.js` keeps drawing on canvas with its cached layers (static, complications, glass) and gains a face switch and slot drawing; settings live in `js/look.js` (`noon-sweep-look`). Small exports are added to existing modules (`noonAdhkar`, `noonQibla`, `noonPlace`, `noonFocusToggle`, `snapshot().fmtIn`) instead of new wiring.

**Tech Stack:** Static HTML/CSS/vanilla JS (no build), Canvas 2D, Capacitor 8 Android shell, Node 22 `node:test`, Playwright (MCP) for screenshots.

**Spec:** `docs/superpowers/specs/2026-10-06-muslim-activity-clock-design.md`

## Global Constraints

- Names: Arabic «مهام المسلم», English «Muslim Activity».
- Never change: `io.github.micro4tricks.muslimtodo`, the repository name/URLs, `muslim-todo-list.apk`, `noon-sweep-*` keys, notification channel ids, anything in Supabase (including comments in `supabase/*.sql`).
- LITE path untouched: 8 fps (`FRAME_MS = 125`), `DPR ≤ 2`, no drawing off screen; static parts in cached layers (`staticLayer`, `compLayer`/`compKey`, `glassLayer`).
- Light and dark page themes; RTL `index.html` and LTR `?lang=en`.
- Every new UI string: Modern Standard Arabic in code, English entry in `js/i18n.js`; `node tools/check_i18n.mjs` must report 0 duplicates.
- Version 2.3.0: `js/app.js` `VERSION`, every `?v=` in `index.html`, `sw.js` `VERSION` → `v26`.
- No commit before the user approves screenshots; no `v*` tag without asking.

## Review Focus

1. A focus session longer than 4 hours (or a broken `endEpoch`) — the ring must not draw into the centre: laps are capped at 4.
2. Location refused or unavailable (desktop without GPS, browser blocks) — the welcome continues to the manual city step, no error toast loop, `noon-perm-asked` set so it never asks again.
3. A slot whose data is missing (no radio played yet, no reminders, no wird goal, no place) — shows a quiet fallback text, never `undefined`/`NaN`.
4. Tap exactly on a slot edge and on the slot gap of the modern face — `hitSlot` boundary behaviour is defined (inclusive) and tested; taps between slots open the place panel.
5. Polar day/night (sunrise or sunset `NaN`) — `sunCountdown` returns `null` and the dial shows the day arc without a countdown.

---

### Task 1: `clock-core.js` — pure rules with tests

**Files:**
- Create: `js/clock-core.js`
- Create: `tools/test_clock.mjs`
- Modify: `.github/workflows/android.yml` (run the test with the reminder rules)

**Interfaces:**
- Produces (on `window.noonClockCore`):
  - `focusLaps(startMs, endMs, nowMs) → Array<{ lap: number, len: number, done: number }>` — minutes within each 60-minute lap; at most 4 laps; `[]` if `endMs <= startMs`.
  - `sunCountdown(nowH, sunriseH, sunsetH) → { kind: 'sunrise'|'sunset', inH: number } | null`
  - `slotRects(face, CX, CY, R) → Array<{ id: 'A'|'B'|'C', shape: 'rect'|'circle', x, y, w, h, cx, cy, r }>`
  - `hitSlot(rects, x, y) → 'A'|'B'|'C'|null` (edges inclusive)
  - `compassPoint(deg) → 0..7` (0 = north, clockwise, 45° sectors centred on each point)

- [ ] **Step 1: Write the failing tests** — `tools/test_clock.mjs`:

```js
// Tests for the clock's pure rules (js/clock-core.js). Run: node --test tools/test_clock.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

await import('../js/clock-core.js');
const C = globalThis.noonClockCore;
const MIN = 60000;

test('a 20-minute session is one lap, part done', () => {
  assert.deepEqual(C.focusLaps(0, 20 * MIN, 5 * MIN), [{ lap: 0, len: 20, done: 5 }]);
});

test('a 90-minute session fills the outer lap and continues on a second one', () => {
  assert.deepEqual(C.focusLaps(0, 90 * MIN, 70 * MIN), [{ lap: 0, len: 60, done: 60 }, { lap: 1, len: 30, done: 10 }]);
});

test('laps are capped at four and a broken session draws nothing', () => {
  assert.equal(C.focusLaps(0, 600 * MIN, 0).length, 4);
  assert.deepEqual(C.focusLaps(10, 10, 10), []);
  assert.deepEqual(C.focusLaps(10, 5, 10), []);
});

test('sun countdown: sunrise before dawn, sunset by day, tomorrow\'s sunrise at night', () => {
  assert.deepEqual(C.sunCountdown(4, 6, 18), { kind: 'sunrise', inH: 2 });
  assert.deepEqual(C.sunCountdown(15.5, 6, 18), { kind: 'sunset', inH: 2.5 });
  assert.deepEqual(C.sunCountdown(22, 6, 18), { kind: 'sunrise', inH: 8 });
  assert.equal(C.sunCountdown(12, NaN, 18), null);
});

test('slots: one on the classic and minimal faces, three on the modern face', () => {
  assert.deepEqual(C.slotRects('classic', 100, 100, 100).map((s) => s.id), ['A']);
  assert.deepEqual(C.slotRects('minimal', 100, 100, 100).map((s) => s.id), ['A']);
  assert.deepEqual(C.slotRects('modern', 100, 100, 100).map((s) => s.id), ['A', 'B', 'C']);
});

test('a tap inside a slot finds it, edges included; between slots finds none', () => {
  const classic = C.slotRects('classic', 100, 100, 100);
  const a = classic[0];
  assert.equal(C.hitSlot(classic, a.x, a.y), 'A');
  assert.equal(C.hitSlot(classic, a.x + a.w, a.y + a.h), 'A');
  assert.equal(C.hitSlot(classic, 100, 100), null);
  const modern = C.slotRects('modern', 100, 100, 100);
  const [m0, m1] = modern;
  assert.equal(C.hitSlot(modern, m1.cx, m1.cy), 'B');
  assert.equal(C.hitSlot(modern, m0.cx + m0.r, m0.cy), 'A');
  assert.equal(C.hitSlot(modern, (m0.cx + m0.r + m1.cx - m1.r) / 2, m0.cy), null);
});

test('compass point: eight sectors, north at both ends', () => {
  assert.deepEqual([0, 22, 23, 90, 135, 180, 270, 338, 359].map(C.compassPoint), [0, 0, 1, 2, 3, 4, 6, 0, 0]);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tools/test_clock.mjs`
Expected: FAIL (cannot find module `js/clock-core.js`).

- [ ] **Step 3: Write `js/clock-core.js`**

```js
// ---------- Clock: geometry and time rules (pure functions, no page) ----------
// Where the interactive slots sit on each face, how a long focus session splits into laps
// around the minute track, and how long until sunrise or sunset. Tested by tools/test_clock.mjs.
(function (root) {
  'use strict';
  const MAX_LAPS = 4;

  // Minutes in each 60-minute lap of a focus session (the minute track holds one hour).
  function focusLaps(start, end, now) {
    const total = (end - start) / 60000;
    if (!(total > 0)) return [];
    const done = Math.min(total, Math.max(0, (now - start) / 60000));
    const laps = [];
    for (let k = 0; k * 60 < total && k < MAX_LAPS; k++) {
      const len = Math.min(60, total - k * 60);
      laps.push({ lap: k, len, done: Math.min(len, Math.max(0, done - k * 60)) });
    }
    return laps;
  }

  // The next sunrise or sunset, in hours from now (today's sunrise stands in for tomorrow's).
  function sunCountdown(nowH, sunrise, sunset) {
    if (!Number.isFinite(nowH) || !Number.isFinite(sunrise) || !Number.isFinite(sunset)) return null;
    if (nowH < sunrise) return { kind: 'sunrise', inH: sunrise - nowH };
    if (nowH < sunset) return { kind: 'sunset', inH: sunset - nowH };
    return { kind: 'sunrise', inH: 24 - nowH + sunrise };
  }

  // Slot areas in CSS pixels. Classic and minimal: one band above the centre (where the next
  // prayer was). Modern: three round slots in a row below the time.
  function slotRects(face, CX, CY, R) {
    if (face === 'modern') {
      const r = R * 0.19, cy = CY + R * 0.4;
      return [-0.44, 0, 0.44].map((dx, i) => {
        const cx = CX + dx * R;
        return { id: 'ABC'[i], shape: 'circle', cx, cy, r, x: cx - r, y: cy - r, w: 2 * r, h: 2 * r };
      });
    }
    const w = R * 0.74, h = R * 0.36, x = CX - w / 2, y = CY - R * 0.56;
    return [{ id: 'A', shape: 'rect', x, y, w, h, cx: CX, cy: y + h / 2, r: h / 2 }];
  }

  function hitSlot(rects, x, y) {
    for (const s of rects) {
      if (s.shape === 'circle' ? Math.hypot(x - s.cx, y - s.cy) <= s.r : x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h) return s.id;
    }
    return null;
  }

  // 0 = north … 7 = north-west.
  const compassPoint = (deg) => Math.round((((deg % 360) + 360) % 360) / 45) % 8;

  root.noonClockCore = { focusLaps, sunCountdown, slotRects, hitSlot, compassPoint };
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tools/test_clock.mjs`
Expected: `ℹ pass 7`, `ℹ fail 0`.

- [ ] **Step 5: Run the clock rules in CI** — in `.github/workflows/android.yml` replace
`run: node --test tools/test_reminders.mjs` with `run: node --test tools/test_reminders.mjs tools/test_clock.mjs` and the step name with `Reminder and clock rules`.

No commit yet (global constraint).

---

### Task 2: The name

**Files (exact lines from `grep -rn "Muslim To-Do\|مسلم تو دو\|قائمة مهام المسلم"`):**
- Modify: `index.html:6` `<title>مهام المسلم</title>`; `index.html:14` `content="مهام المسلم"`
- Modify: `en/index.html:5,10` → `Muslim Activity`
- Modify: `manifest.webmanifest:3-4` → `"name": "مهام المسلم · Muslim Activity"`, `"short_name": "مهام المسلم"`
- Modify: `app/android/app/src/main/res/values/strings.xml:3-4` → `Muslim Activity`
- Modify: `app/android/app/src/main/res/values-ar/strings.xml` — add `<string name="app_name">مهام المسلم</string>` and `<string name="title_activity_main">مهام المسلم</string>`
- Modify: `app/capacitor.config.json:3` `"appName": "Muslim Activity"`; `app/package.json:5` description
- Modify: `PlayerService.java:162` `folder("root", "Muslim Activity")`
- Modify: `fastlane/metadata/android/ar/title.txt` → `مهام المسلم`; `en-US/title.txt` → `Muslim Activity`
- Modify: `docs/GOOGLE_PLAY.md:12` → `مهام المسلم - Muslim Activity`; `docs/logo.svg` aria-label
- Modify: `install.html:6,7,60,91,144`, `privacy.html:6,7,48,128,182`, `README.md:3,5,25,245`, `serve.ps1:39`, `تشغيل.bat:2`, `js/app.js:34` (comment), `js/remind-card.js:140`, `js/sunnah.js:347` → «Muslim Activity» (Latin text drawn on shared images) / «مهام المسلم» (Arabic text)
- Modify: `js/settings.js:110,226` `T('مهام المسلم')`; `:285` `T('أهلاً بك في مهام المسلم')`
- Modify: `js/i18n.js:948,1005` keys → `'أهلاً بك في مهام المسلم': 'Welcome to Muslim Activity'`, `'مهام المسلم': 'Muslim Activity'`
- Modify: `.github/workflows/android.yml:178` `--title "Muslim Activity $GITHUB_REF_NAME"`
- Not touched: `supabase/schema.sql:1` (Supabase), `app/android/app/src/main/assets/**`, `app/www/**` (generated).

- [ ] **Step 1: Apply the replacements** with a Python script in the scratchpad that asserts each old string is present once per listed line and replaces it (so a missed or doubled spot fails loudly).
- [ ] **Step 2: Verify** — `grep -rn "Muslim To-Do\|مسلم تو دو" --exclude-dir=node_modules --exclude-dir=www --exclude-dir=public --exclude-dir=assets --exclude-dir=.git . | grep -v "docs/superpowers\|supabase/"` prints nothing; `grep -c "muslimtodo" app/android/app/build.gradle` unchanged (2); `node --check js/settings.js js/i18n.js js/remind-card.js js/sunnah.js`; `node tools/check_i18n.mjs` → 0 duplicates.
- [ ] **Step 3: The English page title** — `js/i18n.js` sets `document.title` for English: `grep -n "document.title" js/i18n.js`; if it maps the Arabic title through the dictionary, the `'مهام المسلم': 'Muslim Activity'` entry covers it; if it hard-codes "Muslim To-Do List", change it to `'Muslim Activity'`.

---

### Task 3: First-launch permissions

**Files:**
- Modify: `js/astro.js:419-440` (locate), `:444-448` (exports)
- Modify: `js/settings.js:241-300` (permission card before the welcome)
- Modify: `index.html` (CSS for `.st-perm`), `js/i18n.js`

**Interfaces:**
- Produces: `window.noonPlace.locate() → Promise<'ok'|'denied'|'unsupported'>`
- Consumes: `window.noonNative.permit(ask: boolean) → Promise<boolean>` (exists).

- [ ] **Step 1: `locate()` in `astro.js`** — replace the `$('pLocate')` handler body with a reusable function:

```js
  // Location from the device (GPS on phones): the nearest listed city gives the country, the
  // coordinates and time zone are your own. Used by the button and by the first-launch card.
  function locate() {
    const msg = $('pLocateMsg');
    if (!navigator.geolocation) { msg.textContent = T('المتصفح لا يدعم تحديد الموقع. اختر المدينة من القائمة.'); return Promise.resolve('unsupported'); }
    msg.textContent = T('جارٍ تحديد موقعك…');
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition((pos) => {
        /* existing body unchanged: nearest city, tz, P.country/P.city/P.custom, message, changed() */
        resolve('ok');
      }, () => {
        msg.textContent = T('تعذّر الوصول إلى موقعك. اختر الدولة والمدينة من القائمة.');
        resolve('denied');
      }, { timeout: 10000, maximumAge: 600000 });
    });
  }
  $('pLocate').addEventListener('click', () => locate());
```

(the comment marks where the current success body moves in verbatim — lines 424-436 today) and `window.noonPlace = { open: openPanel, locate };`.

- [ ] **Step 2: The card in `settings.js`** — before `wizard(0)` for new users, show the card. Replace the start-up IIFE's last line `if (used) markDone(); else setTimeout(() => wizard(0), 700);` with:

```js
    if (used) { markDone(); return; }
    setTimeout(() => (read2(PERM) ? wizard(0) : askPermissions()), 700);
```

and add above it:

```js
  // ---- before the welcome: location and notifications, asked once with a tap ----
  const PERM = 'noon-perm-asked';
  function askPermissions() {
    store2(PERM, '1');
    const veil = el('div', 'st-perm-veil');
    const card = el('div', 'st-perm');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.dir = I.isEn ? 'ltr' : 'rtl';
    const logo = el('img', 'st-logo'); logo.src = 'icons/icon-192.png'; logo.alt = '';
    const list = el('ul', 'st-perm-list');
    [['📍', 'موقعك', 'لمواقيت الصلاة واتجاه القبلة بدقة. يبقى على جهازك.'],
      ['🔔', 'الإشعارات', 'للأذان وتذكيراتك في وقتها.']].forEach(([icon, title, why]) => {
      const li = el('li');
      const txt = el('span');
      txt.append(el('b', '', T(title)), el('small', '', T(why)));
      li.append(el('span', 'st-perm-icon', icon), txt);
      list.append(li);
    });
    const msg = el('p', 'hint');
    const done = () => { veil.remove(); card.remove(); wizard(0); };
    const allow = button('btn btn-primary', T('السماح'), async () => {
      allow.disabled = true;
      msg.textContent = T('جارٍ تحديد موقعك…');
      if (window.noonPlace && window.noonPlace.locate) await window.noonPlace.locate();
      if (window.noonNative) await window.noonNative.permit(true);
      else if ('Notification' in window && Notification.permission === 'default') { try { await Notification.requestPermission(); } catch (_) {} }
      done();
    });
    card.append(logo, el('h3', '', T('نحتاج إذنين')), list, msg, allow, button('link-btn', T('اختيار المدينة يدوياً'), done));
    document.body.append(veil, card);
    setTimeout(() => allow.focus(), 50);
  }
```

(`el`, `button`, `I`, `T` are already in scope in `settings.js`; check with `grep -n "const { T, I, el, button" js/settings.js` and add any missing name to that destructuring.)

- [ ] **Step 3: CSS** — after the `.st-welcome` rules in `index.html`:

```css
  .st-perm-veil { position: fixed; inset: 0; z-index: 70; background: rgba(10, 12, 16, 0.5); }
  .st-perm { position: fixed; z-index: 71; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(420px, calc(100vw - 32px)); box-sizing: border-box; padding: 24px 22px; border-radius: 22px; background: var(--paper); color: var(--ink); box-shadow: 0 18px 50px rgba(0, 0, 0, 0.3); display: flex; flex-direction: column; gap: 12px; text-align: center; }
  .st-perm h3 { margin: 0; font-size: 20px; }
  .st-perm .st-logo { width: 64px; height: 64px; margin: 0 auto; border-radius: 16px; }
  .st-perm-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; text-align: start; }
  .st-perm-list li { display: flex; gap: 12px; align-items: flex-start; padding: 10px 12px; border-radius: 14px; background: var(--surface); }
  .st-perm-list b { display: block; font-size: 15px; }
  .st-perm-list small { color: var(--ink-soft); font-size: 13px; }
  .st-perm-icon { font-size: 22px; line-height: 1; }
```

- [ ] **Step 4: i18n** — add: `'نحتاج إذنين': 'Two permissions'`, `'موقعك': 'Your location'`, `'لمواقيت الصلاة واتجاه القبلة بدقة. يبقى على جهازك.': 'For exact prayer times and the qibla direction. It stays on your device.'`, `'الإشعارات'` (check it exists first), `'للأذان وتذكيراتك في وقتها.': 'For the adhan and your reminders on time.'`, `'السماح': 'Allow'`, `'اختيار المدينة يدوياً': 'Choose the city myself'`.

- [ ] **Step 5: Verify in the browser** (Playwright, fresh profile: `localStorage.clear()` then reload): the card shows; "Choose the city myself" opens the welcome; reload → the card does not show again (`noon-perm-asked`); with geolocation denied (Playwright default) "Allow" still reaches the welcome.

---

### Task 4: Small exports used by the slots

**Files:**
- Modify: `js/adhkar.js:161`, `js/tasks.js:132`, `js/qibla.js:88-139`, `js/astro.js:286-300`

**Interfaces (produces):**
- `noonAdhkar.tasbeeh() → { n: number, phrase: string }`; `noonAdhkar.tasbeehTap() → number` (new count; same vibration as the button; dispatches `noon-tasbeeh`).
- `window.noonFocusToggle()` → calls the existing `toggleFocus()`.
- `noonQibla.watch(cb: (headingDeg|null) => void) → () => void` (unsubscribe); starts the orientation listener only on Android-style browsers that need no permission; never prompts.
- `snapshot(epoch).fmtIn(hours) → string` (the existing `fmtIn`).

- [ ] **Step 1: adhkar.js** — replace line 161 with:

```js
  function tasbeehTap() {
    if (S.day !== dayKey()) { S = blank(); }
    S.tasbeeh.n++;
    if (navigator.vibrate) navigator.vibrate(S.tasbeeh.n % 33 === 0 ? [30, 60, 30] : 10);
    save();
    window.dispatchEvent(new CustomEvent('noon-tasbeeh'));
    if (document.querySelector('.tasbeeh-n')) render();
    return S.tasbeeh.n;
  }
  const tasbeeh = () => ({ n: S.day === dayKey() ? S.tasbeeh.n : 0, phrase: (TASBEEH[S.tasbeeh.phrase] || TASBEEH[0])[0] });
  window.noonAdhkar = { open(cat) { open = cat; window.noonUI.show('adhkar'); render(); }, progress, period, tasbeeh, tasbeehTap };
```

(check `blank`, `dayKey`, `render`, `TASBEEH` names with `grep -n "const blank\|dayKey\|function render\|const TASBEEH" js/adhkar.js`.)

- [ ] **Step 2: tasks.js** — after line 132 (`window.noonFocus = …`) add `window.noonFocusToggle = () => toggleFocus();` (`toggleFocus` is a hoisted function declaration at line 576).

- [ ] **Step 3: qibla.js** — keep one orientation listener for the panel and for watchers:

```js
  // Watchers outside the panel (the clock's qibla slot) get the heading too.
  const watchers = new Set();
  function onOrient(e) {
    /* existing heading computation unchanged */
    watchers.forEach((cb) => cb(heading));
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; if (box && !box.hidden) draw(); });
  }
  const quietSensor = () => typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission !== 'function' && matchMedia('(pointer: coarse)').matches;
  function watch(cb) {
    watchers.add(cb);
    if (!listening && quietSensor()) {
      listening = true;
      addEventListener('ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation', onOrient);
    }
    return () => { watchers.delete(cb); if (!watchers.size && (!box || box.hidden)) stop(); };
  }
```

`stop()` already removes both listeners; `close()` must not stop while watchers remain: change its `stop();` to `if (!watchers.size) stop();`. Export: `window.noonQibla = { open, watch, bearing: … }`. The existing `if (!raf) … if (!box.hidden)` becomes `box && !box.hidden` because watchers can run before the panel is built.

- [ ] **Step 4: astro.js** — add `fmtIn` to the snapshot object (`hijri, hijriFull, fmtHM, fmtIn`).

- [ ] **Step 5: Verify** — `node --check js/adhkar.js js/tasks.js js/qibla.js js/astro.js`; in the browser console: `noonAdhkar.tasbeehTap()` returns 1 then 2 and the Adhkar tab counter shows the same; `noonAstro.snapshot(Date.now()).fmtIn(1.5)` → `بعد ١س ٣٠د`.

---

### Task 5: Face, accent and slot settings (`look.js`, `index.html`)

**Files:**
- Modify: `js/look.js:65,113-117,140-174`; `index.html:1677` (three `look-section`s before «وضع الألوان»)

**Interfaces:**
- Produces: `noonLook.get()` now also returns `face: 'classic'|'modern'|'minimal'`, `accent: string (#hex)`, `slots: { A: string, B: string, C: string }` (slot ids from Task 6's table); `noonLook.SLOTS` = the list `[id, arabicLabel]`.
- The `noon-look` event fires on any change (existing).

- [ ] **Step 1: Defaults and get()** — in `L` defaults add `face: 'classic', accent: '#3FD0D4', slots: null`; constants:

```js
  const FACE_OPTS = [['classic', 'كلاسيكي'], ['modern', 'حديث'], ['minimal', 'بسيط']];
  const ACCENT_OPTS = [['#3FD0D4', 'فيروزي'], ['#E3B04B', 'ذهبي'], ['#F28DB2', 'وردي'], ['#5CC48A', 'أخضر']];
  const SLOT_OPTS = [['prayer', 'الصلاة القادمة'], ['qibla', 'القبلة'], ['radio', 'الإذاعة'], ['sun', 'الشروق والغروب'],
    ['hijri', 'التاريخ الهجري'], ['tasbih', 'المسبحة'], ['reminder', 'التذكير القادم'], ['focus', 'التركيز']];
  const SLOT_DEFAULTS = { classic: { A: 'prayer' }, minimal: { A: 'prayer' }, modern: { A: 'qibla', B: 'prayer', C: 'sun' } };
  const slotsFor = (face) => Object.assign({}, SLOT_DEFAULTS[face] || SLOT_DEFAULTS.classic, (L.slots || {})[face] || {});
```

`get()` adds `face: L.face, accent: L.accent, slots: slotsFor(L.face)`; `window.noonLook.SLOTS = SLOT_OPTS`. Slots are stored per face: `L.slots = { modern: { A: 'qibla', … }, classic: { A: … } }`.

- [ ] **Step 2: HTML** — before the `وضع الألوان` section:

```html
    <div class="look-section">
      <h3>وجه الساعة</h3>
      <div class="sw-row" id="lookFaces"></div>
    </div>
    <div class="look-section" id="lookAccentBox">
      <h3>لون الوجه الحديث</h3>
      <div class="sw-row" id="lookAccents"></div>
    </div>
    <div class="look-section">
      <h3>خانات الساعة</h3>
      <div class="look-slots" id="lookSlots"></div>
    </div>
```

and CSS `.look-slots { display: grid; gap: 8px; } .look-slots label { display: flex; align-items: center; gap: 10px; justify-content: space-between; font-size: 14px; } .look-slots select { flex: 0 1 60%; }`.

- [ ] **Step 3: renderPanel()** — at its top:

```js
    $('lookFaces').replaceChildren(...FACE_OPTS.map(([id, label]) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'chip'; b.textContent = T(label);
      b.setAttribute('aria-pressed', String(L.face === id));
      b.addEventListener('click', () => { L.face = id; save(); announce(); renderPanel(); });
      return b;
    }));
    $('lookAccentBox').hidden = L.face !== 'modern';
    $('lookAccents').replaceChildren(...ACCENT_OPTS.map(([col, label]) =>
      swatch(label, L.accent === col, { background: col }, () => { L.accent = col; save(); announce(); renderPanel(); }, 'sw sw-round')));
    const cur = slotsFor(L.face);
    $('lookSlots').replaceChildren(...Object.keys(cur).map((k, i, all) => {
      const lab = document.createElement('label');
      const sel = document.createElement('select');
      sel.className = 'ls-select';
      SLOT_OPTS.forEach(([id, name]) => sel.append(new Option(T(name), id)));
      sel.value = cur[k];
      sel.addEventListener('change', () => {
        L.slots = Object.assign({}, L.slots);
        L.slots[L.face] = Object.assign({}, slotsFor(L.face), { [k]: sel.value });
        save(); announce();
      });
      lab.append(document.createTextNode(all.length > 1 ? `${T('الخانة')} ${I.num ? I.num(i + 1) : i + 1}` : T('الخانة العلوية')), sel);
      return lab;
    }));
```

(`I` here is `window.noonI18n`; add `const I = window.noonI18n;` next to `const T = window.noonI18n.t;`.)

- [ ] **Step 4: Verify** — `node --check js/look.js`; open Appearance: three face chips, the accent row only for "modern", one slot select (classic) or three (modern); switching keeps each face's own choice after reload.

---

### Task 6: Classic face — slot, sun counter, moon, focus ring, taps

**Files:**
- Modify: `js/clock.js:120-124` (look), `:543-743` (complications and focus ring), `:789-808` (frame)
- Modify: `index.html` script order: `<script src="js/clock-core.js?v=2.3.0"></script>` immediately before `js/clock.js`

**Interfaces:**
- Consumes: Task 1 (`noonClockCore.*`), Task 4 exports, Task 5 `noonLook.get()`.
- Produces inside `clock.js`: `slotData(id, snap) → { kicker, main, sub, key }`, `runSlot(id)`, `drawSlotBand(g, rect, data)`, `drawSlotRound(g, s, data, id)`, `currentSlots() → Array<{ rect, id }>`.

- [ ] **Step 1: look() carries face, accent, slots**

```js
  const look = () => {
    const l = window.noonLook ? window.noonLook.get() : {};
    return { dial: DIALS[l.dial] || DIALS.ceramic, metal: METALS[l.metal] || METALS.steel,
      face: l.face || 'classic', accent: l.accent || '#3FD0D4', slots: l.slots || { A: 'prayer' } };
  };
```

- [ ] **Step 2: slot data and actions** (after `fitText`):

```js
  // ---------- Slots: what each one shows, and what a tap does ----------
  const I18 = window.noonI18n;
  const tr = (s) => (I18 ? I18.t(s) : s);
  const num = (n) => (I18 && I18.num ? I18.num(n) : String(n));
  const POINTS = ['شمال', 'شمال شرق', 'شرق', 'جنوب شرق', 'جنوب', 'جنوب غرب', 'غرب', 'شمال غرب'];
  function slotData(id, snap) {
    const C = window.noonClockCore;
    switch (id) {
      case 'qibla': {
        const b = window.noonQibla && window.noonQibla.bearing();
        if (!Number.isFinite(b)) return { kicker: tr('القبلة'), main: '—', sub: tr('اختر مدينتك'), key: 'q-' };
        return { kicker: tr('القبلة'), main: `${num(Math.round(b))}°`, sub: tr(POINTS[C.compassPoint(b)]), key: `q${Math.round(b)}`, bearing: b };
      }
      case 'radio': {
        const L = window.noonListen, st = L ? L.state() : 'off', last = L && L.last();
        const on = st === 'playing' || st === 'loading';
        return { kicker: tr('الإذاعة'), main: (last && last.title) || tr('الإذاعة'), sub: tr(on ? 'تعمل الآن' : 'اضغط للتشغيل'), key: `r${st}${last && last.title}`, on };
      }
      case 'sun': {
        const c = C.sunCountdown(snap.nowH, snap.today.sunrise, snap.today.sunset);
        if (!c) return { kicker: tr('الشروق والغروب'), main: '—', sub: '', key: 's-' };
        const at = c.kind === 'sunrise' ? snap.today.sunrise : snap.today.sunset;
        return { kicker: tr(c.kind === 'sunrise' ? 'الشروق' : 'الغروب'), main: snap.fmtHM(at), sub: snap.fmtIn(c.inH), key: `s${c.kind}`, kind: c.kind };
      }
      case 'hijri':
        return { kicker: tr('هجري'), main: snap.hijri, sub: snap.dateEn, key: 'h' };
      case 'tasbih': {
        const t = window.noonAdhkar && window.noonAdhkar.tasbeeh ? window.noonAdhkar.tasbeeh() : { n: 0, phrase: '' };
        return { kicker: tr('المسبحة'), main: num(t.n), sub: t.phrase, key: `t${t.n}` };
      }
      case 'reminder': {
        const RM = window.noonReminders, n = RM && RM.upcoming()[0];
        if (!n) return { kicker: tr('التذكير القادم'), main: tr('لا تذكيرات'), sub: '', key: 'm-' };
        return { kicker: tr('التذكير القادم'), main: n.r.title || tr('تذكير'), sub: RM.when(n.t), key: `m${n.r.id}${n.t}` };
      }
      case 'focus': {
        const f = window.noonFocus && window.noonFocus();
        if (!f || !f.running) return { kicker: tr('التركيز'), main: tr('ابدأ'), sub: tr('جلسة تركيز'), key: 'f-' };
        const left = Math.max(0, Math.ceil((f.endEpoch - Date.now()) / 60000));
        return { kicker: tr(f.mode === 'focus' ? 'التركيز' : 'استراحة'), main: I18 ? I18.dur(Math.floor(left / 60), left % 60) : `${left}m`, sub: tr('متبقٍّ'), key: `f${left}` };
      }
      default:
        return { kicker: snap.place.name, main: `${snap.next.name} ${snap.next.time}`, sub: snap.next.inText, key: `p${snap.next.key}${snap.next.inText}` };
    }
  }
  function runSlot(id) {
    switch (id) {
      case 'qibla': if (window.noonQibla) window.noonQibla.open(); break;
      case 'radio': {
        const L = window.noonListen; if (!L) break;
        const st = L.state();
        if (st === 'playing' || st === 'loading') L.stop(); else if (L.last()) L.resume(); else L.open();
        break;
      }
      case 'hijri': window.noonUI && window.noonUI.go('calendar'); break;
      case 'tasbih': window.noonAdhkar && window.noonAdhkar.tasbeehTap(); break;
      case 'reminder': window.noonReminders && window.noonReminders.open(); break;
      case 'focus': window.noonFocusToggle && window.noonFocusToggle(); break;
      default: if (window.noonSettings) window.noonSettings.open('place'); else if (window.noonAstro) window.noonAstro.open();
    }
    compKey = '';
  }
```

- [ ] **Step 3: draw the band slot** (replaces `drawNextPrayer`):

```js
  // Classic and minimal: the slot is a band above the centre, three lines like the old next-prayer text.
  function drawSlotBand(g, rect, d) {
    const D = T.dial, cx = rect.x + rect.w / 2;
    g.direction = TEXT_DIR;
    g.fillStyle = D.faint;
    fitText(g, d.kicker || '', rect.w * 0.7, 0.05, 500);
    g.fillText(d.kicker || '', cx, rect.y + rect.h * 0.2);
    g.fillStyle = D.ink;
    fitText(g, d.main || '', rect.w * 0.86, 0.075, 700);
    g.fillText(d.main || '', cx, rect.y + rect.h * 0.52);
    g.fillStyle = D.accent;
    fitText(g, d.sub || '', rect.w * 0.8, 0.054, 600);
    g.fillText(d.sub || '', cx, rect.y + rect.h * 0.82);
  }
```

- [ ] **Step 4: the sun counter** — replace `drawSunDial` with an arc of the day (sunrise left, sunset right) and the countdown line; the night ring keeps the 24h dial look:

```js
  function drawSunDial(g, snap) {
    const D = T.dial;
    const sx = CX - R * 0.37, sy = CY, rs = R * 0.16;
    const face = () => { g.beginPath(); g.arc(sx, sy, rs, 0, TAU); };
    g.fillStyle = D.sub; face(); g.fill();
    insetShadow(g, face, 0.3);
    const sr = snap.today.sunrise, ss = snap.today.sunset;
    const c = window.noonClockCore.sunCountdown(snap.nowH, sr, ss);
    // Day arc over the top half: sunrise at the left end, sunset at the right.
    const ar = rs * 0.72, ay = sy + rs * 0.18;
    g.lineCap = 'round';
    g.lineWidth = R * 0.016;
    g.strokeStyle = rgba(D.soft, 0.35);
    g.beginPath(); g.arc(sx, ay, ar, Math.PI, TAU); g.stroke();
    if (Number.isFinite(sr) && Number.isFinite(ss)) {
      const p = Math.min(1, Math.max(0, (snap.nowH - sr) / (ss - sr)));
      const isDay = snap.nowH > sr && snap.nowH < ss;
      g.strokeStyle = '#E3B04B';
      g.beginPath(); g.arc(sx, ay, ar, Math.PI, Math.PI + Math.PI * p); g.stroke();
      const a = Math.PI + Math.PI * p, bx = sx + Math.cos(a) * ar, by = ay + Math.sin(a) * ar;
      g.fillStyle = isDay ? '#F2A516' : '#DCE3EE';
      g.strokeStyle = isDay ? '#B8740C' : '#56607A';
      g.lineWidth = Math.max(1, R * 0.006);
      g.beginPath(); g.arc(bx, by, R * 0.026, 0, TAU); g.fill(); g.stroke();
    }
    g.strokeStyle = rgba(D.soft, 0.5);
    g.lineWidth = Math.max(1, R * 0.004);
    g.beginPath(); g.moveTo(sx - ar - R * 0.02, ay); g.lineTo(sx + ar + R * 0.02, ay); g.stroke();
    g.direction = TEXT_DIR;
    if (c) {
      g.fillStyle = D.ink;
      fitText(g, tr(c.kind === 'sunrise' ? 'الشروق' : 'الغروب'), rs * 1.5, 0.05, 700);
      g.fillText(tr(c.kind === 'sunrise' ? 'الشروق' : 'الغروب'), sx, ay + rs * 0.3);
      g.fillStyle = D.accent;
      fitText(g, snap.fmtIn(c.inH), rs * 1.7, 0.048, 600);
      g.fillText(snap.fmtIn(c.inH), sx, ay + rs * 0.62);
    }
    g.fillStyle = D.soft;
    g.font = cfont(0.046, 600);
    g.fillText(`${snap.fmtHM(sr, false)} – ${snap.fmtHM(ss, false)}`, sx, sy + rs + R * 0.055);
  }
```

`cfont` keeps a 9px floor; at a 360px screen `R ≈ 0.38 × 331 ≈ 126`, so `0.046R ≈ 5.8px` is lifted to 9px by `Math.max(9, …)`; raise that floor to 11 (`Math.max(11, k * R)`) to meet the spec's 11px. Check the date window and moon labels still fit with `fitText` (they shrink to fit).

- [ ] **Step 5: the moon** — replace `drawMoon`:

```js
  function drawMoon(g, snap) {
    const mx = CX, my = CY + R * 0.3, rm = R * 0.085;
    const hole = () => { g.beginPath(); g.arc(mx, my, rm * 1.25, 0, TAU); };
    const sky = g.createRadialGradient(mx, my - rm * 0.5, 0, mx, my, rm * 1.25);
    sky.addColorStop(0, '#26314A'); sky.addColorStop(1, '#0F1420');
    g.fillStyle = sky; hole(); g.fill();
    insetShadow(g, hole, 0.5);
    g.save();
    g.translate(mx, my);
    if (snap.place.lat < 0) g.scale(-1, 1); // southern hemisphere sees it mirrored
    const f = snap.moon.frac, k = Math.cos(2 * Math.PI * f), rx = Math.abs(k) * rm;
    // Earthshine: the dark side faintly visible.
    g.fillStyle = '#2B3346';
    g.beginPath(); g.arc(0, 0, rm, 0, TAU); g.fill();
    const lit = () => {
      g.beginPath();
      if (f < 0.5) { g.arc(0, 0, rm, -Math.PI / 2, Math.PI / 2, false); g.ellipse(0, 0, rx, rm, 0, Math.PI / 2, -Math.PI / 2, k > 0); }
      else { g.arc(0, 0, rm, Math.PI / 2, Math.PI * 1.5, false); g.ellipse(0, 0, rx, rm, 0, -Math.PI / 2, Math.PI / 2, k > 0); }
    };
    const glow = g.createRadialGradient(-rm * 0.35, -rm * 0.4, rm * 0.1, 0, 0, rm);
    glow.addColorStop(0, '#FFFDF4'); glow.addColorStop(0.75, '#EFE6CC'); glow.addColorStop(1, '#CFC3A2');
    g.fillStyle = glow; lit(); g.fill();
    // Craters, only on the lit part.
    g.save(); lit(); g.clip();
    g.fillStyle = 'rgba(120,110,85,0.18)';
    [[-0.32, -0.22, 0.24], [0.28, 0.18, 0.2], [-0.05, 0.45, 0.14]].forEach(([dx, dy, r]) => { g.beginPath(); g.arc(dx * rm, dy * rm, r * rm, 0, TAU); g.fill(); });
    g.restore();
    g.strokeStyle = 'rgba(255,255,255,0.18)';
    g.lineWidth = Math.max(0.6, R * 0.003);
    g.beginPath(); g.arc(0, 0, rm, 0, TAU); g.stroke();
    g.restore();
    g.direction = TEXT_DIR;
    g.fillStyle = T.dial.soft;
    fitText(g, snap.moon.name, R * 0.5, 0.048, 600);
    g.fillText(snap.moon.name, mx, my + rm * 1.25 + R * 0.05);
  }
```

- [ ] **Step 6: buildComplications per face** (classic now; modern/minimal in Task 7):

```js
  function currentSlots() {
    return window.noonClockCore.slotRects(T.face, CX, CY, R).map((rect) => ({ rect, id: T.slots[rect.id] || 'prayer' }));
  }
  function buildComplications(snap) {
    const [c, g] = makeLayer();
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (T.face === 'modern') { drawModern(g, snap); return c; }
    for (const s of currentSlots()) drawSlotBand(g, s.rect, slotData(s.id, snap));
    if (T.face !== 'minimal') { drawSunDial(g, snap); drawMoon(g, snap); }
    drawDateWindow(g, snap);
    return c;
  }
```

and in `frame()` the key includes the slots' data: `const key = snap.key + '|' + canvas.width + 'x' + canvas.height + '|' + T.face + '|' + currentSlots().map((s) => slotData(s.id, snap).key).join(',');`

- [ ] **Step 7: taps** — replace line 708:

```js
  canvas.addEventListener('click', (ev) => {
    const box = canvas.getBoundingClientRect();
    const id = window.noonClockCore.hitSlot(window.noonClockCore.slotRects(T.face, CX, CY, R), ev.clientX - box.left, ev.clientY - box.top);
    if (id) { runSlot(T.slots[id] || 'prayer'); return; }
    if (window.noonAstro) window.noonAstro.open();
  });
  canvas.style.cursor = 'pointer';
  ['noon-tasbeeh', 'noon-reminders'].forEach((e) => window.addEventListener(e, () => { compKey = ''; }));
```

- [ ] **Step 8: the focus ring with labels and laps** — replace `drawFocusArc`:

```js
  function drawFocusArc() {
    const f = window.noonFocus && window.noonFocus();
    if (!f || !f.running) return;
    const now = Date.now();
    const col = f.mode === 'focus' ? (T.face === 'modern' ? T.accent : T.dial.accent) : '#3F9A6A';
    const a0 = minuteTrackAngle(f.startEpoch);
    const laps = window.noonClockCore.focusLaps(f.startEpoch, f.endEpoch, now);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineWidth = R * 0.018;
    laps.forEach(({ lap, len, done }) => {
      const rr = R * (0.978 - lap * 0.06);
      const span = len / 60 * TAU, d = done / 60 * TAU;
      if (d > 0.001) { ctx.strokeStyle = rgba(col, 0.28); ctx.beginPath(); ctx.arc(CX, CY, rr, a0, a0 + d); ctx.stroke(); }
      if (span - d > 0.001) { ctx.strokeStyle = rgba(col, 0.95); ctx.beginPath(); ctx.arc(CX, CY, rr, a0 + d, a0 + span); ctx.stroke(); }
    });
    // Start tick and end dot, each with its clock time.
    const last = laps[laps.length - 1];
    if (last) {
      const rEnd = R * (0.978 - last.lap * 0.06), aEnd = a0 + last.len / 60 * TAU;
      ctx.strokeStyle = col; ctx.lineWidth = R * 0.008;
      ctx.beginPath(); ctx.moveTo(CX + Math.cos(a0) * R * 0.94, CY + Math.sin(a0) * R * 0.94); ctx.lineTo(CX + Math.cos(a0) * R * 1.01, CY + Math.sin(a0) * R * 1.01); ctx.stroke();
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(CX + Math.cos(aEnd) * rEnd, CY + Math.sin(aEnd) * rEnd, R * 0.022, 0, TAU); ctx.fill();
      const label = (a, rr, t) => {
        const txt = focusTime.format(t);
        const lx = CX + Math.cos(a) * rr, ly = CY + Math.sin(a) * rr;
        ctx.font = cfont(0.048, 700);
        const w = ctx.measureText(txt).width + R * 0.04, h = R * 0.075;
        ctx.fillStyle = 'rgba(15,18,24,0.78)';
        roundRectPath(ctx, lx - w / 2, ly - h / 2, w, h, h / 2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = 'ltr';
        ctx.fillText(txt, lx, ly + R * 0.003);
      };
      const lr = R * 0.84 - last.lap * R * 0.06;
      // Keep the two labels apart when the session is short.
      const gap = ((aEnd - a0) % TAU + TAU) % TAU;
      const push = gap < 0.5 ? (0.5 - gap) / 2 : 0;
      label(a0 - push, R * 0.84, f.startEpoch);
      label(aEnd + push, lr, f.endEpoch);
    }
    ctx.restore();
  }
  const focusTime = new Intl.DateTimeFormat(window.noonI18n ? window.noonI18n.locale : 'en-GB', { hour: 'numeric', minute: '2-digit' });
```

(`focusTime` must be declared before the first `frame()` call; put it above `drawFocusArc`.) The time shown uses the device clock; the angles use `minuteTrackAngle`, which follows the chosen city — same as today.

- [ ] **Step 9: qibla needle per frame** — after `drawFocusArc()` in `frame()` call `drawQiblaNeedles()`:

```js
  // The qibla slot's needle turns with the phone, so it is drawn each frame (only while watched).
  let heading = null, unwatch = null;
  function syncCompass() {
    const want = onScreen && currentSlots().some((s) => s.id === 'qibla') && !document.hidden;
    if (want && !unwatch && window.noonQibla && window.noonQibla.watch) unwatch = window.noonQibla.watch((h) => { heading = h; });
    if (!want && unwatch) { unwatch(); unwatch = null; heading = null; }
  }
  function drawQiblaNeedles() {
    const b = window.noonQibla && window.noonQibla.bearing();
    if (!Number.isFinite(b)) return;
    for (const s of currentSlots()) {
      if (s.id !== 'qibla') continue;
      const r = s.rect.shape === 'circle' ? s.rect.r * 0.62 : s.rect.h * 0.32;
      const cx = s.rect.shape === 'circle' ? s.rect.cx : s.rect.x + s.rect.w * 0.12;
      const cy = s.rect.cy;
      const a = ((b - (heading === null ? 0 : heading)) * DEG) - Math.PI / 2;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(a + Math.PI / 2);
      ctx.fillStyle = T.face === 'modern' ? T.accent : T.dial.accent;
      ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(r * 0.28, r * 0.15); ctx.lineTo(0, -r * 0.05); ctx.lineTo(-r * 0.28, r * 0.15); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }
```

Call `syncCompass()` from the IntersectionObserver callback, on `visibilitychange`, and on `noon-look`. For the classic band, the needle sits at the band's start side (`x + 12%`) so it does not cover the text; in RTL that is the left end — acceptable since the band is centred text.

- [ ] **Step 10: Verify** — `node --check js/clock.js`; Playwright: classic face renders, tap on the band opens the place page, tap on the dial centre opens the place panel; choose `tasbih` for slot A → tap twice → `noonAdhkar.tasbeeh().n === 2`; start a focus session → labels show start and end times.

---

### Task 7: Modern and minimal faces

**Files:**
- Modify: `js/clock.js` (`buildStatic`, new `drawModern`, `frame`)

**Interfaces:** consumes `slotData`, `currentSlots`, `T.accent`, `noonQuran.progress()` (`{ today, goal }`), `snap.today` (prayer hours), `snap.next`.

- [ ] **Step 1: static layer per face** — at the start of `buildStatic()` after the crown and case (keep the case for all faces), branch the dial:

```js
    if (T.face === 'modern') {
      // A dark, glassy dial; no indices or numerals.
      g.save(); circlePath(g, CX, CY, R); g.clip();
      const base = g.createRadialGradient(CX, CY - R * 0.4, 0, CX, CY, R);
      base.addColorStop(0, '#1A1E26'); base.addColorStop(1, '#07080B');
      g.fillStyle = base; g.fillRect(CX - R, CY - R, R * 2, R * 2);
      g.restore();
      return c;
    }
```

placed right after the inner chamfer (line 265). For `minimal`, keep the dial but skip the printed numerals block (`if (T.face !== 'minimal') { …numerals… }`) and the railway track's minute ticks except the five-minute ones.

- [ ] **Step 2: `drawModern(g, snap)`**

```js
  function drawModern(g, snap) {
    const A = T.accent;
    const now = new Date(Date.now() + offsetMs);
    g.direction = TEXT_DIR;
    // Dates.
    g.fillStyle = '#FFFFFF';
    fitText(g, snap.hijri, R * 0.9, 0.07, 600);
    g.fillText(snap.hijri, CX, CY - R * 0.62);
    g.direction = 'ltr';
    g.fillStyle = A;
    fitText(g, snap.dateEn, R * 0.9, 0.055, 700);
    g.fillText(snap.dateEn, CX, CY - R * 0.5);
    // Today's prayers: five marks on a line from midnight to midnight, a pointer at now.
    const lx = CX - R * 0.6, lw = R * 1.2, ly = CY + R * 0.06;
    g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = Math.max(1, R * 0.006);
    g.beginPath(); g.moveTo(lx, ly); g.lineTo(lx + lw, ly); g.stroke();
    ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'].forEach((k) => {
      const h = snap.today[k]; if (!Number.isFinite(h)) return;
      const x = lx + lw * h / 24, isNext = snap.next.key === k;
      g.fillStyle = isNext ? A : 'rgba(255,255,255,0.55)';
      roundRectPath(g, x - R * 0.008, ly - R * (isNext ? 0.07 : 0.045), R * 0.016, R * (isNext ? 0.07 : 0.045), R * 0.008); g.fill();
    });
    g.fillStyle = '#FFFFFF';
    g.beginPath(); g.arc(lx + lw * snap.nowH / 24, ly, R * 0.016, 0, TAU); g.fill();
    g.direction = TEXT_DIR;
    g.fillStyle = 'rgba(255,255,255,0.7)';
    fitText(g, `${snap.next.name} ${snap.next.time} · ${snap.next.inText}`, lw, 0.05, 600);
    g.fillText(`${snap.next.name} ${snap.next.time} · ${snap.next.inText}`, CX, ly + R * 0.08);
    // Round slots.
    for (const s of currentSlots()) drawSlotRound(g, s.rect, slotData(s.id, snap), s.id);
    // Side gauges: left = towards the next prayer, right = today's wird.
    const prev = prevPrayerH(snap), gap = (snap.next.h >= prev ? snap.next.h - prev : snap.next.h + 24 - prev) || 1;
    const towards = Math.min(1, Math.max(0, 1 - snap.next.inH / gap));
    gauge(g, Math.PI * 0.72, Math.PI * 1.28, towards, A);
    const q = window.noonQuran && window.noonQuran.progress ? window.noonQuran.progress() : null;
    gauge(g, -Math.PI * 0.28, Math.PI * 0.28, q && q.goal ? Math.min(1, q.today / q.goal) : 0, '#E3B04B', true);
    // Sunrise and sunset along the bottom edge.
    curvedText(g, `☀ ${snap.fmtHM(snap.today.sunrise)}`, Math.PI * 0.62, R * 0.86);
    curvedText(g, `☾ ${snap.fmtHM(snap.today.sunset)}`, Math.PI * 0.38, R * 0.86);
  }
  function prevPrayerH(snap) {
    const hs = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'].map((k) => snap.today[k]).filter(Number.isFinite).filter((h) => h <= snap.nowH);
    return hs.length ? hs[hs.length - 1] : (snap.today.isha || 0) - 24;
  }
  function gauge(g, a0, a1, p, col, reverse) {
    const rr = R * 0.9;
    g.lineCap = 'round'; g.lineWidth = R * 0.03;
    g.strokeStyle = 'rgba(255,255,255,0.12)';
    g.beginPath(); g.arc(CX, CY, rr, a0, a1); g.stroke();
    if (p > 0.01) {
      g.strokeStyle = col;
      g.beginPath();
      if (reverse) g.arc(CX, CY, rr, a1 - (a1 - a0) * p, a1); else g.arc(CX, CY, rr, a0, a0 + (a1 - a0) * p);
      g.stroke();
    }
  }
  // Text along the bottom of the dial, reading left to right.
  function curvedText(g, text, centreAngle, rr) {
    g.save();
    g.direction = 'ltr';
    g.font = cfont(0.05, 600);
    g.fillStyle = 'rgba(255,255,255,0.8)';
    const chars = [...text], widths = chars.map((ch) => g.measureText(ch).width);
    const total = widths.reduce((s, w) => s + w, 0);
    let a = centreAngle + total / rr / 2;
    chars.forEach((ch, i) => {
      a -= widths[i] / 2 / rr;
      g.save(); g.translate(CX + Math.cos(a) * rr, CY + Math.sin(a) * rr); g.rotate(a - Math.PI / 2); g.fillText(ch, 0, 0); g.restore();
      a -= widths[i] / 2 / rr;
    });
    g.restore();
  }
  function drawSlotRound(g, s, d, id) {
    g.fillStyle = '#20252E';
    g.beginPath(); g.arc(s.cx, s.cy, s.r, 0, TAU); g.fill();
    g.strokeStyle = id === 'radio' && d.on ? T.accent : 'rgba(255,255,255,0.08)';
    g.lineWidth = Math.max(1, R * 0.008);
    g.stroke();
    g.direction = TEXT_DIR;
    g.fillStyle = T.accent;
    fitText(g, d.kicker || '', s.r * 1.6, 0.042, 600);
    g.fillText(d.kicker || '', s.cx, s.cy - s.r * 0.5);
    g.fillStyle = '#FFFFFF';
    fitText(g, d.main || '', s.r * 1.7, 0.075, 700);
    g.fillText(d.main || '', s.cx, s.cy + (id === 'qibla' ? s.r * 0.08 : 0));
    g.fillStyle = 'rgba(255,255,255,0.65)';
    fitText(g, d.sub || '', s.r * 1.6, 0.04, 500);
    g.fillText(d.sub || '', s.cx, s.cy + s.r * 0.5);
  }
```

- [ ] **Step 3: the time each frame** — in `frame()`, for `T.face === 'modern'` draw the digital time instead of the hands (hands are skipped):

```js
    if (T.face === 'modern') {
      drawFocusArc(); drawQiblaNeedles();
      const e = Date.now() + offsetMs, d = new Date(e + placeOffset(e));
      const hh = d.getUTCHours(), mm = d.getUTCMinutes(), ss = d.getUTCSeconds();
      const pad = (n) => String(n).padStart(2, '0');
      const h12 = hh % 12 || 12; // the app shows 12-hour times everywhere
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = 'ltr';
      ctx.fillStyle = '#FFFFFF';
      ctx.font = `300 ${R * 0.34}px "Readex Pro", "IBM Plex Sans Arabic", sans-serif`;
      ctx.fillText(`${h12}:${pad(mm)}`, CX - R * 0.07, CY - R * 0.24);
      ctx.fillStyle = T.accent;
      ctx.font = `500 ${R * 0.13}px "Readex Pro", "IBM Plex Sans Arabic", sans-serif`;
      ctx.fillText(pad(ss), CX + R * 0.5, CY - R * 0.2);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(glassLayer, 0, 0);
      return;
    }
```

inserted right after `ctx.setTransform(DPR, 0, 0, DPR, 0, 0);` in `frame()`.

- [ ] **Step 4: Verify** — `node --check js/clock.js`; Playwright at 390px and desktop: modern face shows dates, time with seconds, prayer line, three slots, gauges, curved sunrise/sunset; switching faces in Appearance redraws at once (`noon-look` → `resize()` → `compKey=''`); minimal shows hands without numerals.

---

### Task 8: Qibla card in "My day" and times in focus mode

**Files:** Modify `js/today.js:29-35`, `js/focus-mode.js` (after `label` creation and in its render/update function), `index.html` CSS.

- [ ] **Step 1: today.js** — after the prayer card:

```js
    // The qibla direction, with a small needle.
    const qb = window.noonQibla && window.noonQibla.bearing();
    if (Number.isFinite(qb)) {
      const POINTS = ['شمال', 'شمال شرق', 'شرق', 'جنوب شرق', 'جنوب', 'جنوب غرب', 'غرب', 'شمال غرب'];
      const needle = el('span', 'td-needle');
      needle.style.transform = `rotate(${Math.round(qb)}deg)`;
      cards.push(card('td-qibla', T('القبلة'), `${I.num(Math.round(qb))}°`, T(POINTS[window.noonClockCore.compassPoint(qb)]), () => window.noonQibla.open(), needle));
    }
```

CSS: `.td-needle { position: absolute; inset-inline-end: 14px; top: 14px; width: 26px; height: 26px; border-radius: 50%; border: 1.5px solid var(--line); background: conic-gradient(from -8deg, var(--accent) 0 16deg, transparent 16deg); }` and `.td-qibla { position: relative; }`.

- [ ] **Step 2: focus-mode.js** — under the timer label add `const span = el('div', 'fm-span');` appended after `label` in `center.append(...)`; where the label text is updated each tick, set `span.textContent = f.running ? \`${clockFmt.format(f.startEpoch)} ← ${clockFmt.format(f.endEpoch)}\` : ''` using `window.noonFocus()` (find the update function with `grep -n "label.textContent" js/focus-mode.js`). In English the arrow is `→`: `I.isEn ? '→' : '←'`. CSS `.fm-span { font-size: 14px; opacity: 0.75; direction: ltr; unicode-bidi: isolate; }`.

- [ ] **Step 3: Verify** — Playwright: "My day" shows the qibla card for Makkah-distant places (e.g. Cairo bearing ≈ 136°); focus mode shows `10:05 ← 10:25` while running.

---

### Task 9: Strings, versions and full checks

**Files:** `js/i18n.js`, `index.html`, `sw.js`, `js/app.js`

- [ ] **Step 1: i18n** — run the missing-phrase scan used for the reminders (both quote styles) over `js/clock.js js/look.js js/today.js js/settings.js js/focus-mode.js` plus the `FACE_OPTS`/`ACCENT_OPTS`/`SLOT_OPTS`/`POINTS` labels; add an English entry for each missing one (e.g. `'وجه الساعة': 'Clock face'`, `'كلاسيكي': 'Classic'`, `'حديث': 'Modern'`, `'بسيط': 'Minimal'`, `'فيروزي': 'Turquoise'`, `'لون الوجه الحديث': 'Modern face colour'`, `'خانات الساعة': 'Clock slots'`, `'الخانة': 'Slot'`, `'الخانة العلوية': 'Top slot'`, `'الشروق والغروب': 'Sunrise and sunset'`, `'التاريخ الهجري': 'Hijri date'`, `'التذكير القادم'` exists, `'شمال شرق': 'North-east'` … `'شمال غرب': 'North-west'`, `'تعمل الآن': 'Playing'`, `'اضغط للتشغيل': 'Tap to play'`, `'لا تذكيرات': 'No reminders'`, `'هجري': 'Hijri'`, `'متبقٍّ': 'left'`, `'جلسة تركيز': 'Focus session'`, `'اختر مدينتك': 'Choose your city'`). Static headings in `index.html` are translated by the same dictionary. `node tools/check_i18n.mjs` → 0 duplicates.
- [ ] **Step 2: versions** — `index.html` every `?v=2.2.0` → `?v=2.3.0`; `js/app.js` `VERSION = '2.3.0'`; `sw.js` `VERSION = 'v26'` and add `'js/clock-core.js'` to its file list.
- [ ] **Step 3: all checks** — `for f in js/*.js; do node --check "$f"; done`; `node --test tools/test_reminders.mjs tools/test_clock.mjs` → all pass; `node --check app/scripts/smoke.mjs`.
- [ ] **Step 4: smoke test hook** — in `app/scripts/smoke.mjs`, after the reminder check, add `report.clockCore = await js("typeof window.noonClockCore.slotRects === 'function' && window.noonClockCore.slotRects('modern', 100, 100, 100).length");` and the problem line `if (report.clockCore !== 3) problems.push(`clock rules missing in the app: ${report.clockCore}`);` (proves `clock-core.js` is copied into the APK and loads before `clock.js`).

---

### Task 10: Screenshots, approval, commit, push

- [ ] **Step 1:** Local server `python -m http.server 8765 --bind 127.0.0.1` (background), Playwright: clear caches and service worker, then for each of desktop 1440×900 and 390×844, light and dark (`noonLook` mode via Appearance), take: classic, modern, minimal; a 20-minute focus session on classic; a 90-minute session on modern (start the timer, set `F` via the focus UI's 90-minute option or `localStorage` of the timer if needed); the permission card (fresh profile); "My day" with the qibla card. Save under the scratchpad, view each, fix anything clipped or unreadable at 390px.
- [ ] **Step 2:** Show the screenshots to the user and wait for approval.
- [ ] **Step 3:** After approval: `git add` the changed files (list them; no `app/www`, no `assets/public`), commit `v2.3.0: Muslim Activity — clock faces, interactive slots, first-launch permissions`, push, then `gh api repos/micro4tricks-ai/muslim-todo-list/pages/builds/latest` → `"status": "built"`.
- [ ] **Step 4:** Ask the user before creating the `v2.3.0` tag.
