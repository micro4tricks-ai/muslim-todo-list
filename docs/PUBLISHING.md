# Publishing the Android app

The app is built and signed by GitHub Actions on every `v*` tag and served from the website
(`/muslim-todo-list.apk`). These are the other free places it can be listed. Each needs the
owner's own account, so they are steps for the maintainer, not automated.

The store texts, icon and screenshots are in `fastlane/metadata/android/` (Arabic and English),
the layout F-Droid and most stores read.

## F-Droid (free, for open-source apps)

1. Open a "Request for Packaging" issue at <https://gitlab.com/fdroid/rfp/-/issues> with the
   repository link, or submit a merge request to <https://gitlab.com/fdroid/fdroiddata> with
   `metadata/io.github.micro4tricks.muslimtodo.yml`.
2. F-Droid builds from source. The build steps are the same as in `.github/workflows/android.yml`:
   `cd app && npm ci && npm run copy-web && npx cap sync android`, then `./gradlew assembleSiteRelease`
   in `app/android`, with `APP_VERSION_NAME` / `APP_VERSION_CODE` set from the tag.
3. Things the reviewers will ask about:
   - Network use: recitations, tafsirs, hadith chapters, word-by-word meanings and map search are
     read from public services (cdn.islamic.network, jsDelivr, api.alquran.cloud, api.quran.com,
     everyayah.com, OpenStreetMap). Sync (Supabase) is optional and off until the user signs in.
   - No trackers, ads or Google Play Services.
   - F-Droid signs with its own key, so users can't update between the F-Droid build and the
     website APK without reinstalling.

## Samsung Galaxy Store

Seller registration at <https://seller.samsungapps.com> (no fee at the time of writing — check
before starting). Upload the signed APK from the latest release and the texts above.

## Huawei AppGallery

Developer registration at <https://developer.huawei.com/consumer/en/appgallery> (identity check;
no fee at the time of writing). The app has no Google services, so it works on Huawei phones as is.

## Google Play

A one-time $25 registration. New personal accounts must run a closed test with testers before
the app can go public.
