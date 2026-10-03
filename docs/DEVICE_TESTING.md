# Testing on real phones (Firebase Test Lab)

Every release already goes through a full check on an Android emulator before it is published
(`.github/workflows/android.yml`). The **Real devices** workflow (`.github/workflows/devices.yml`) adds
real phones: after each release it installs the APK on a Samsung and a Xiaomi phone in Google's lab
and lets a robot tap through the app; a crash or a freeze turns the run red. The free Spark plan
allows 5 such tests a day, more than enough.

## الإعداد مرة واحدة (بالعربي)

1. افتح [console.firebase.google.com](https://console.firebase.google.com) وادخل بحساب Google، ثم **إنشاء مشروع**
   (أي اسم، مثلاً `muslim-todo-list`؛ التحليلات غير مطلوبة). يبقى على الخطة المجانية Spark.
2. من القائمة الجانبية افتح **Test Lab** مرة واحدة (هذا يفعّل الخدمة للمشروع).
3. افتح [console.cloud.google.com/iam-admin/serviceaccounts](https://console.cloud.google.com/iam-admin/serviceaccounts)
   واختر المشروع نفسه، ثم **إنشاء حساب خدمة** باسم `github-test-lab` ودور **Editor** (محرر) — لهذا المشروع فقط.
4. افتح الحساب ← **Keys** ← **Add key** ← **JSON**. سينزل ملف؛ احفظه على سطح المكتب باسم `firebase-key.json`.
   **لا تلصقه في المحادثة ولا ترفعه للمستودع.**
5. قل لي «حفظت الملف» واكتب **رقم المشروع (Project ID)**، وسأضيفهما سرّاً في GitHub ثم أحذف الملف من جهازك.

## Setup once (English)

1. Create a Firebase project at console.firebase.google.com (Spark plan, analytics not needed).
2. Open **Test Lab** once in that project.
3. In Google Cloud IAM, create a service account (`github-test-lab`) with the **Editor** role on this project only.
4. Create a **JSON key** for it.
5. Add two repository secrets: `FIREBASE_SA_KEY` (the whole JSON) and `FIREBASE_PROJECT` (the project id),
   e.g. `gh secret set FIREBASE_SA_KEY < firebase-key.json`. Then delete the key file.

Run it by hand from **Actions → Real devices → Run workflow**, or let it follow each release.
