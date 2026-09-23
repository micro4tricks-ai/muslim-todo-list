# Muslim To-Do List

ساعة عقارب مع مواقيت الصلاة، وطور القمر، والشروق والغروب، والتاريخ الهجري والميلادي، ومؤقت تركيز، وقائمة مهام، ومكتبة أصوات للتركيز.

## التشغيل

- **على الإنترنت:** افتح رابط GitHub Pages الخاص بالمستودع.
- **على جهازك:** دبل كليك على `تشغيل.bat` (يشغّل سيرفر محلي صغير حتى تتكرر الأصوات بلا فاصل)، أو افتح `index.html` مباشرة.

## اللغة / Language

الصفحة بالعربي افتراضياً، وزر **English** أعلى قائمة المهام يحوّلها للإنجليزي (والاختيار يُحفظ).
رابط مباشر للنسخة الإنجليزية: `/en/` أو `?lang=en`.

The page opens in Arabic; the **English** button above the task list switches languages (and remembers the choice).
Direct English link: `/en/` or `?lang=en`.

## المحتويات

| المسار | الوصف |
|---|---|
| `index.html` | الصفحة والتصميم |
| `en/index.html` | رابط مباشر للنسخة الإنجليزية |
| `js/i18n.js` | الترجمة والتبديل بين العربي والإنجليزي |
| `js/clock.js` | رسم الساعة والعقارب والمينا |
| `js/astro.js` | الموقع، مواقيت الصلاة، القمر، التاريخ |
| `js/look.js` | ألوان المينا والإطار وخلفيات الصفحة |
| `js/sounds.js` | مكتبة الأصوات |
| `js/tasks.js` | المهام ومؤقت التركيز |
| `sounds/` | تسجيلات الأصوات |

## المصادر والتراخيص

- **الأصوات:** من مشروع [Moodist](https://github.com/remvze/moodist)، مرخّصة تحت CC0 و[رخصة محتوى Pixabay](https://pixabay.com/service/license-summary/). إذا لم يوجد مجلد `sounds` تُحمَّل الملفات نفسها من jsDelivr.
- **مواقيت الصلاة:** حسابات مبنية على خوارزمية [PrayTimes.org](http://praytimes.org).
- **قائمة المهام:** مستوحاة من [to-do-list-project](https://github.com/nagesh882/to-do-list-project)، ومزايا التركيز وتتبّع الوقت من [Super Productivity](https://github.com/super-productivity/super-productivity).
