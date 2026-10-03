# Google Play: the answers for each form

The Play build is the `play` flavour (`app/android/app/build.gradle`, `src/play/AndroidManifest.xml`):
no self-update (Play updates it), no direct battery-optimisation request, and `SCHEDULE_EXACT_ALARM`
instead of `USE_EXACT_ALARM`. Every `v*` release attaches the signed bundle `muslim-todo-list-play.aab`
to the GitHub release, next to the website APK.

## 1. Create the app

| Field | Answer |
|---|---|
| App name | قائمة مهام المسلم - Muslim To-Do List |
| Default language | Arabic – ar |
| App or game | App |
| Free or paid | Free |
| Package name (from the first upload) | `io.github.micro4tricks.muslimtodo` |

## 2. App signing — keep the same key

Choose **"Use a different key" → "Export and upload a key from Java keystore"**. Play shows an
*encryption public key* to download: save it to the Desktop as `play-encryption-key.pem` and say so.
The maintainer's helper then runs Google's `pepk.jar` on the existing keystore
(`muslim-todo-keystore\`, alias `muslimtodo`) and leaves `play-key.zip` on the Desktop to upload.
Same key on Play and on the website means people can move between the two without reinstalling.
**Never let Play generate a new key, and never create a new keystore.**

## 3. App content (Policy → App content)

| Form | Answer |
|---|---|
| Privacy policy | `https://micro4tricks-ai.github.io/muslim-todo-list/privacy.html` |
| Ads | No, the app has no ads |
| App access | All functionality is available without special access (sign-in is optional, only for sync) |
| Content rating (IARC) | Category: Reference, news or educational. Violence, sex, language, drugs, gambling: No. User interaction: users can share a display name inside a group khatma (yes to "users can interact"), no chat, no location sharing with other users, no purchases |
| Target audience | 13–15, 16–17, 18 and over (not under 13 — avoids the Families programme) |
| News app | No |
| Government app | No |
| Financial features | None (the zakat calculator only does arithmetic) |
| Health | None |
| Data safety | see below |
| Foreground service | Media playback — "Plays the adhan at prayer time and Quran radio/recitations the user starts, with the screen off." Video: start a radio, lock the phone, show the notification controls |
| Exact alarm | Uses `SCHEDULE_EXACT_ALARM` (granted by the user from Settings › Adhan); no declaration form is needed for it |

### Data safety

- Does the app collect or share user data? **Yes, collects** (only when the user signs in). **Shares: No.**
- Is all data encrypted in transit? **Yes.**
- Can users request deletion? **Yes** — in the app (Settings › Account › Delete my account) and at
  `https://micro4tricks-ai.github.io/muslim-todo-list/privacy.html#delete`.

| Data type | Collected | Optional? | Purpose |
|---|---|---|---|
| Personal info → Email address | Yes | Optional (sign-in only) | Account management |
| Personal info → Name | Yes | Optional (display name in a group khatma) | App functionality |
| App activity → Other user-generated content (tasks, settings) | Yes | Optional (sync) | App functionality |
| Location → Approximate location | **Yes, but not stored** — only when the user uses "Nearby mosques", sent to OpenStreetMap to search; mark "processed ephemerally" | Optional | App functionality |

Everything else (financial, health, messages, photos, contacts, identifiers, analytics, crash logs): **No**.

## 4. Store listing

Texts: `fastlane/metadata/android/ar/` and `en-US/` (title, short and full description).
Graphics: icon 512×512, feature graphic 1024×500, at least 2 phone screenshots (`docs/screens/`).
Category: **Lifestyle** (or Books & Reference). Contact email: micro4tricks@gmail.com.

## 5. Closed testing (new personal accounts)

1. Testing → Closed testing → create a track, upload `muslim-todo-list-play.aab` from the latest release.
2. Testers: an email list of **at least 12 Google accounts** (family and friends).
3. Send them the opt-in link; each one taps "Become a tester", installs from Play, and **keeps it
   installed for 14 days in a row**.
4. After 14 days: Dashboard → **Apply for production**, answer the questions about the test.

## 6. Production and later updates

After approval: Production → create a release → the same AAB. Later versions: each `v*` release
attaches a new AAB; upload it to Production (this can be automated with a Play service account later).
