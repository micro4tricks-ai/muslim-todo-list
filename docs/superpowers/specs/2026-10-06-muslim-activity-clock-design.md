# Muslim Activity 2.3: name, first-launch permissions, clock faces and slots

Approved in chat on 2026-10-06. Version 2.3.0. No `v*` tag without asking.

## ملخص بالعربي

١. الاسم «مهام المسلم» / «Muslim Activity» في كل مكان ظاهر، دون تغيير الـ appId ولا المستودع ولا مفاتيح التخزين ولا القنوات ولا Supabase.
٢. بطاقة صلاحيات عند أول تشغيل (قبل خطوات الترحيب): الموقع من GPS ثم الإشعارات، بضغطة «السماح»؛ والرفض يرجع لاختيار المدينة يدوياً بلا تكرار.
٣. ثلاثة أوجه للساعة: الكلاسيكي (الحالي محسّناً)، والحديث بأسلوب ساعات سامسونج، والبسيط.
٤. عدّاد شروق/غروب واضح، وقوس تركيز بعلامتي بداية ونهاية ووقتيهما وحلقة داخلية لما زاد عن ساعة، وقمر أيقوني.
٥. خانات تفاعلية يختارها المستخدم (الصلاة القادمة، القبلة، الراديو، الشروق والغروب، الهجري، المسبحة، التذكير القادم، التركيز)، والضغط ينفّذ أمرها.
٦. بطاقة القبلة في «يومي».

## 1. Name

| Where | Arabic | English |
|---|---|---|
| `index.html` `<title>`, meta, header texts | مهام المسلم | — |
| `en/index.html` | — | Muslim Activity |
| `manifest.webmanifest` | `name`: «مهام المسلم · Muslim Activity», `short_name`: «مهام المسلم» | |
| Android `res/values/strings.xml` | — | `app_name`, `title_activity_main`: Muslim Activity |
| Android `res/values-ar/strings.xml` | مهام المسلم | — |
| `fastlane/metadata/android/{ar,en-US}/title.txt` | مهام المسلم | Muslim Activity |
| `js/i18n.js`, `js/settings.js` (welcome), `js/remind-card.js`, `js/sunnah.js`, `js/app.js`, `PlayerService.java` (shown labels) | ✓ | ✓ |
| `install.html`, `privacy.html`, `README.md`, `docs/GOOGLE_PLAY.md`, `docs/PUBLISHING.md`, `app/capacitor.config.json` `appName`, `android.yml` release title | ✓ | ✓ |

Unchanged on purpose: `applicationId`/`appId` `io.github.micro4tricks.muslimtodo`, the repository name and URLs, the APK file name `muslim-todo-list.apk` (the in-app updater downloads it by name), `noon-sweep-*` keys, notification channel ids, anything in Supabase (including comments in `supabase/*.sql`).

## 2. First-launch permissions (`js/settings.js` + `js/astro.js` + `js/native.js`)

- `astro.js`: the `pLocate` handler becomes `locate()` returning a promise (`'ok' | 'denied' | 'unsupported'`), exported as `window.noonPlace.locate`. The button keeps using it.
- New step before the welcome steps, shown once to new users only (same "used" test as the welcome): a card «نحتاج إذنين» with two lines (location → prayer times and qibla; notifications → adhan and reminders), «السماح» and «اختيار المدينة يدوياً».
- «السماح» (a user tap, so browsers allow it): `locate()`; then notifications: in the app `noonNative.permit(true)`, on the web `Notification.requestPermission()`. Then the welcome steps continue; the place step shows the found place.
- Refusal or failure: no error, no second prompt; the place step is the manual choice. Stored once: `noon-perm-asked`.

## 3. Clock faces (`js/look.js`, `js/clock.js`)

New setting in Appearance «وجه الساعة»: `classic` (default, existing users unchanged), `modern`, `minimal`; for `modern` an accent: turquoise `#3FD0D4`, gold `#E3B04B`, rose `#F28DB2`, green `#5CC48A`. Stored in `noon-sweep-look` (`face`, `accent`, `slots`), synced like the rest of the look.

- **Classic:** today's face; slot A (top, where the next prayer is) is interactive; sun dial, date window and moon as improved below.
- **Modern** (inspired by the Galaxy watch face the user sent; all drawn here, no Samsung assets): round dark dial, Hijri + Gregorian date on top, large digital `HH:MM` with smaller seconds, a "today's prayers" strip (five marks on the day, a pointer at now), three round slots A B C in a row, sunrise and sunset times curved along the bottom edge, left gauge = how far through the gap to the next prayer, right gauge = today's wird (pages read / goal). No hands.
- **Minimal:** hands, hour marks without numerals, date, slot A.

The metal case and dial colours keep working for classic and minimal; modern uses its dark dial and the accent.

## 4. Sun dial (classic)

Day arc from sunrise to sunset with the sun on it (moon icon at night), and a clear line: «الغروب بعد ٢س ١٥د» / «الشروق بعد …». Text at least 11px at a 360px-wide screen.

## 5. Focus ring (`drawFocusArc`)

- On the minute track from start to end; elapsed faded, remaining bright; a start tick and an end dot, each labelled with its clock time (`10:05` → `10:25`), labels kept inside the dial and away from each other.
- Longer than 60 minutes: lap 1 is the whole outer track; each further hour continues on a ring 0.06R further in (`focusLaps(start, end, now)` → segments per lap; tested).
- Focus mode (SVG ring in `js/focus-mode.js`): add the same start → end times under the ring.

## 6. Moon

Crisp lit disc with a soft terminator (gradient), faint earthshine on the dark side, three light craters clipped to the lit part, thin rim. Same phase maths; still mirrored for `lat < 0`.

## 7. Slots

| Id | Shows | Tap |
|---|---|---|
| `prayer` (default A) | next prayer, time, time left | `noonSettings.open('place')` |
| `qibla` | needle to the Kaaba; relative to the phone's heading when the sensor is on, else bearing in degrees | `noonQibla.open()` |
| `radio` | last station, playing/stopped | `noonListen.resume()` / `stop()` |
| `sun` | nearest sunrise/sunset and time left | `noonSettings.open('place')` |
| `hijri` | day and month | `noonUI.go('calendar')` |
| `tasbih` | today's count | +1 on the Adhkar tab's free counter (new `noonAdhkar.tasbeeh()` / `noonAdhkar.tasbeehTap()`) |
| `reminder` | next reminder title and time | `noonReminders.open()` |
| `focus` | time left / "start" | start or stop the focus timer (existing `toggleFocus` in `tasks.js`, exported as `noonFocusToggle`) |

- Defaults: classic/minimal A = `prayer`; modern A B C = `qibla`, `prayer`, `sun`.
- Chosen in Appearance per slot (select per slot of the current face).
- Hit test: slot rectangles are computed in CSS pixels with the layout (`slotRects(face, CX, CY, R)`, tested); a click inside runs the slot's action, outside keeps `noonAstro.open()`.
- Drawing: static slot content goes into `compLayer`; its key adds the slots' state (`slotKey`: radio state, tasbih count, next reminder id, focus state per minute). Only the compass needle (while the sensor is on) and the focus slot's seconds are drawn per frame.
- Compass sensor: listened to only while a `qibla` slot is on screen (IntersectionObserver `onScreen`) and the face is visible; removed otherwise. Desktop: static bearing.

## 8. Qibla in "My day" (`js/today.js`)

A card «القبلة» with the bearing (e.g. «١٣٥° جنوب شرق») and a small needle; tap → `noonQibla.open()`.

## Constraints

- LITE path untouched: 8 fps, DPR ≤ 2, no drawing off screen; static parts in cached layers.
- Light and dark page themes; RTL `index.html` and LTR `en/`.
- Every new text has an English entry in `js/i18n.js`.
- Version 2.3.0: `js/app.js` `VERSION`, `?v=` on script tags, `sw.js` `VERSION`.

## Testing

- `tools/test_clock.mjs` (new, pure functions in `js/clock-core.js`): `focusLaps`, `slotRects` + `hitSlot`, `sunCountdown`.
- `node --check` on changed files; `node --test tools/test_reminders.mjs tools/test_clock.mjs`; `node tools/check_i18n.mjs`.
- Playwright screenshots for the user before any commit: desktop and 390px, light and dark, the three faces, a running focus session (20 min and 90 min).
- After approval: commit, push, check `gh api repos/micro4tricks-ai/muslim-todo-list/pages/builds/latest`.
