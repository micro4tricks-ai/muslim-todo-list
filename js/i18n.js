// ---------- Language: Arabic (default), English, Urdu, Indonesian, Turkish or Spanish ----------
// Loaded before the other scripts. Picks the language from ?lang=, then the saved choice, then
// Arabic. For any language but Arabic it writes the language's dictionary (js/lang/<code>.js) into
// the page right after itself, so the dictionary is in place before the next script runs; the
// dictionary hands its phrases to use(), which translates the static page. Exposes the helpers
// the other scripts use for their own text, numbers and dates.
(() => {
  'use strict';
  const KEY = 'noon-sweep-lang';

  // code: [name in its own language, direction, locale, Hijri locale]
  const LANGS = {
    ar: ['العربية', 'rtl', 'ar-EG', 'ar-SA-u-ca-islamic-umalqura-nu-arab'],
    en: ['English', 'ltr', 'en-GB', 'en-GB-u-ca-islamic-umalqura'],
    ur: ['اردو', 'rtl', 'ur-PK', 'ur-PK-u-ca-islamic-umalqura-nu-latn'],
    id: ['Bahasa Indonesia', 'ltr', 'id-ID', 'id-ID-u-ca-islamic-umalqura'],
    tr: ['Türkçe', 'ltr', 'tr-TR', 'tr-TR-u-ca-islamic-umalqura'],
    es: ['Español', 'ltr', 'es-ES', 'es-ES-u-ca-islamic-umalqura']
  };
  const known = (l) => Object.prototype.hasOwnProperty.call(LANGS, l);

  const params = new URLSearchParams(location.search);
  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch (_) {}
  const fromUrl = params.get('lang');
  const lang = known(fromUrl) ? fromUrl : known(saved) ? saved : 'ar';
  if (known(fromUrl) && fromUrl !== saved) { try { localStorage.setItem(KEY, lang); } catch (_) {} }
  const [, dir, locale, hijriLocale] = LANGS[lang];
  const isAr = lang === 'ar';
  const rtl = dir === 'rtl';

  // The language's phrases (Arabic phrase -> translation), filled by use().
  let dict = {};
  const has = (s) => Object.prototype.hasOwnProperty.call(dict, s);

  const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
  const arDigits = (s) => String(s).replace(/[0-9]/g, (d) => AR_DIGITS[d]);
  // A number of days, per language. Arabic: the noun agrees with the number
  // (يوم واحد، يومان، ٣ أيام، ١١ يوماً، ١٠٠ يوم).
  const DAYS = {
    ar: (n) => {
      if (n === 1) return 'يوم واحد';
      if (n === 2) return 'يومان';
      const r = n % 100;
      const word = n === 0 || (n >= 100 && r <= 2) ? 'يوم' : r >= 3 && r <= 10 ? 'أيام' : 'يوماً';
      return `${arDigits(n)} ${word}`;
    },
    en: (n) => `${n} ${n === 1 ? 'day' : 'days'}`,
    ur: (n) => `${n} دن`,
    id: (n) => `${n} hari`,
    tr: (n) => `${n} gün`,
    es: (n) => `${n} ${n === 1 ? 'día' : 'días'}`
  };
  // Hours and minutes, short: "1h 25m" / "١س ٢٥د".
  const DUR = { ar: ['س', 'د'], en: ['h', 'm'], ur: [' گھنٹے', ' منٹ'], id: ['j', 'm'], tr: ['sa', 'dk'], es: [' h', ' min'] };
  // The Hijri months, named here: some phones and computers have no names for them in a language
  // and print the Gregorian ones instead («5 May» for 5 Jumada al-Ula).
  const HIJRI = {
    ar: ['محرم', 'صفر', 'ربيع الأول', 'ربيع الآخر', 'جمادى الأولى', 'جمادى الآخرة', 'رجب', 'شعبان', 'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة'],
    en: ['Muharram', 'Safar', 'Rabi‘ al-Awwal', 'Rabi‘ al-Akhir', 'Jumada al-Ula', 'Jumada al-Akhirah', 'Rajab', 'Sha‘ban', 'Ramadan', 'Shawwal', 'Dhu al-Qa‘dah', 'Dhu al-Hijjah'],
    ur: ['محرم', 'صفر', 'ربیع الاول', 'ربیع الثانی', 'جمادی الاول', 'جمادی الثانی', 'رجب', 'شعبان', 'رمضان', 'شوال', 'ذوالقعدہ', 'ذوالحجہ'],
    id: ['Muharram', 'Safar', 'Rabiulawal', 'Rabiulakhir', 'Jumadilawal', 'Jumadilakhir', 'Rajab', 'Syakban', 'Ramadan', 'Syawal', 'Zulkaidah', 'Zulhijah'],
    tr: ['Muharrem', 'Safer', 'Rebiülevvel', 'Rebiülahir', 'Cemaziyelevvel', 'Cemaziyelahir', 'Recep', 'Şaban', 'Ramazan', 'Şevval', 'Zilkade', 'Zilhicce'],
    es: ['Muharram', 'Safar', 'Rabi‘ al-Awwal', 'Rabi‘ al-Ajir', 'Yumada al-Ula', 'Yumada al-Ajira', 'Rayab', 'Sha‘ban', 'Ramadán', 'Shawwal', 'Dhu al-Qa‘da', 'Dhu al-Hiyya']
  };
  // After a Hijri year: ١٤٤٨هـ, 1448 AH, 1448ھ, 1448 H.
  const AH = { ar: 'هـ', en: ' AH', ur: 'ھ', id: ' H', tr: ' H', es: ' H' };
  // North, east, south, west.
  const COMPASS = { ar: ['ش', 'ق', 'ج', 'غ'], en: ['N', 'E', 'S', 'W'], ur: ['N', 'E', 'S', 'W'], id: ['U', 'T', 'S', 'B'], tr: ['K', 'D', 'G', 'B'], es: ['N', 'E', 'S', 'O'] };
  // The first day of the week (0 Sunday … 6 Saturday).
  const WEEK = { ar: 6, en: 0, ur: 1, id: 1, tr: 1, es: 1 };

  const I = {
    lang,
    langs: Object.keys(LANGS).map((code) => ({ code, name: LANGS[code][0], dir: LANGS[code][1] })),
    isAr,
    // The page is not in Arabic: show the translations and English data the app carries.
    foreign: !isAr,
    isEn: lang === 'en',
    rtl,
    // Written in Latin letters: names and references read better transliterated (Al-Fatiha,
    // Sahih al-Bukhari 1) than in Arabic script. Urdu readers read the Arabic forms.
    latin: !rtl,
    dir,
    locale,
    hijriLocale,
    // Translate a fixed Arabic phrase; one not translated yet stays Arabic.
    t: (s) => (!isAr && has(s) ? dict[s] : s),
    // Same, but try a "prefix:" form first for words with two meanings.
    tp: (prefix, s) => (!isAr && has(prefix + ':' + s) ? dict[prefix + ':' + s] : I.t(s)),
    // Is this phrase translated in the page language? (Arabic: always.)
    has: (s) => isAr || has(s),
    // The text of a data item that carries ar and en (and maybe this language's own field):
    // Arabic, this language's own text, the dictionary's translation of the Arabic, or English.
    pick: (o, ar = 'ar', en = 'en') => {
      if (!o) return '';
      if (isAr) return o[ar];
      const own = o[en === 'en' ? lang : en.replace(/En$/, lang[0].toUpperCase() + lang[1])];
      if (own) return own;
      if (lang !== 'en' && typeof o[ar] === 'string' && has(o[ar])) return dict[o[ar]];
      return o[en] || o[ar];
    },
    // A pair of labels written in the code: Arabic, its translation in the dictionary, or English.
    pair: (ar, en) => (isAr ? ar : has(ar) ? dict[ar] : en),
    // The translation that goes with an Arabic text (a verse, a dhikr, a hadith) in a foreign page:
    // this language's own, else the English the app carries.
    trans: (o) => (o ? o[lang] || o.en || '' : ''),
    // A reference or a name: transliterated in Latin-script languages, Arabic otherwise.
    ref: (o, ar = 'refAr', en = 'refEn') => (o ? (rtl ? o[ar] : o[en] || o[ar]) : ''),
    hijriMonths: HIJRI[lang],
    ah: AH[lang],
    compass: COMPASS[lang],
    weekStart: WEEK[lang],
    // Digits in the page language.
    num: (v) => (isAr ? arDigits(v) : String(v)),
    pct: (v) => (isAr ? `${arDigits(v)}٪` : lang === 'tr' ? `%${v}` : lang === 'es' ? `${v} %` : `${v}%`),
    days: (n) => DAYS[lang](n),
    dur: (h, m) => {
      const [hs, ms] = DUR[lang];
      const s = h ? `${h}${hs} ${m}${ms}` : `${m}${ms}`;
      return isAr ? arDigits(s) : s;
    },
    // Join list items with the right comma.
    list: (items) => items.join(rtl ? '، ' : ', '),
    // Arrows that point back and forward in the reading direction.
    back: rtl ? '→' : '←',
    fwd: rtl ? '←' : '→',
    setLang(next) {
      if (!known(next)) return;
      try { localStorage.setItem(KEY, next); } catch (_) {}
      const p = new URLSearchParams(location.search);
      p.set('lang', next);
      // Replace, so the back key doesn't return to the other language.
      location.replace(location.pathname + '?' + p.toString() + location.hash);
    },
    // Called by js/lang/<code>.js with its phrases: keeps them and translates the static page.
    use(phrases) {
      dict = phrases || {};
      translatePage();
    },
    _dict: () => dict
  };
  window.noonI18n = I;

  document.documentElement.lang = lang;
  document.documentElement.dir = dir;
  if (isAr) return;
  // The dictionary: written in now so it runs before the next script of the page.
  const me = document.currentScript;
  const src = me && me.src ? me.src.replace(/i18n\.js(\?.*)?$/, `lang/${lang}.js$1`) : `js/lang/${lang}.js`;
  document.write(`<script src="${src.replace(/"/g, '&quot;')}"><\/script>`);

  function translatePage() {
    if (has(document.title)) document.title = dict[document.title];
    document.querySelectorAll('[dir="rtl"]').forEach((el) => { el.dir = dir; });
    document.querySelectorAll('[lang="ar"]').forEach((el) => { el.lang = lang; });
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((n) => {
      const key = n.nodeValue.trim();
      if (key && has(key)) n.nodeValue = n.nodeValue.replace(key, dict[key]);
    });
    document.querySelectorAll('[aria-label], [title], [placeholder]').forEach((el) => {
      ['aria-label', 'title', 'placeholder'].forEach((a) => {
        const v = el.getAttribute(a);
        if (v && has(v)) el.setAttribute(a, dict[v]);
      });
    });
  }
})();
