// ---------- Place, sun, moon, dates and prayer times ----------
// Prayer-time math follows the PrayTimes.org algorithm (sun declination and
// equation of time from the Julian date, then hour angles for each angle).
(() => {
  'use strict';
  const PLACE_KEY = 'noon-sweep-place';
  const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
  const ar = (v) => String(v).replace(/[0-9]/g, (d) => AR_DIGITS[d]);
  const $ = (id) => document.getElementById(id);

  const METHODS = {
    egypt:     { ar: 'الهيئة المصرية العامة للمساحة', fajr: 19.5, isha: 17.5 },
    ummalqura: { ar: 'أم القرى (مكة المكرمة)', fajr: 18.5, ishaMin: 90 },
    mwl:       { ar: 'رابطة العالم الإسلامي', fajr: 18, isha: 17 },
    isna:      { ar: 'أمريكا الشمالية (ISNA)', fajr: 15, isha: 15 },
    karachi:   { ar: 'جامعة العلوم الإسلامية بكراتشي', fajr: 18, isha: 18 },
    dubai:     { ar: 'دبي', fajr: 18.2, isha: 18.2 },
    kuwait:    { ar: 'الكويت', fajr: 18, isha: 17.5 },
    qatar:     { ar: 'قطر', fajr: 18, ishaMin: 90 },
    algeria:   { ar: 'الجزائر', fajr: 18, isha: 17 },
    morocco:   { ar: 'المغرب', fajr: 19, isha: 17 },
    turkey:    { ar: 'تركيا (رئاسة الشؤون الدينية)', fajr: 18, isha: 17 },
    singapore: { ar: 'سنغافورة وماليزيا وإندونيسيا', fajr: 20, isha: 18 }
  };

  // [Arabic name, latitude, longitude, optional time zone override]
  const COUNTRIES = [
    { id: 'EG', ar: 'مصر', method: 'egypt', tz: 'Africa/Cairo', cities: [
      ['القاهرة', 30.0444, 31.2357], ['الجيزة', 30.0131, 31.2089], ['الإسكندرية', 31.2001, 29.9187],
      ['المنصورة', 31.0409, 31.3785], ['طنطا', 30.7865, 31.0004], ['الزقازيق', 30.5877, 31.502],
      ['دمياط', 31.4165, 31.8133], ['بورسعيد', 31.2653, 32.3019], ['الإسماعيلية', 30.5965, 32.2715],
      ['السويس', 29.9668, 32.5498], ['الفيوم', 29.3084, 30.8428], ['بني سويف', 29.0661, 31.0994],
      ['المنيا', 28.0871, 30.7618], ['أسيوط', 27.1809, 31.1837], ['سوهاج', 26.5591, 31.6957],
      ['الأقصر', 25.6872, 32.6396], ['أسوان', 24.0889, 32.8998], ['الغردقة', 27.2579, 33.8116],
      ['شرم الشيخ', 27.9158, 34.33], ['مرسى مطروح', 31.3543, 27.2373]] },
    { id: 'SA', ar: 'السعودية', method: 'ummalqura', tz: 'Asia/Riyadh', cities: [
      ['مكة المكرمة', 21.3891, 39.8579], ['المدينة المنورة', 24.5247, 39.5692], ['الرياض', 24.7136, 46.6753],
      ['جدة', 21.4858, 39.1925], ['الدمام', 26.4207, 50.0888], ['الطائف', 21.2703, 40.4158],
      ['تبوك', 28.3835, 36.5662], ['أبها', 18.2164, 42.5053], ['بريدة', 26.3592, 43.9818], ['حائل', 27.5114, 41.7208]] },
    { id: 'AE', ar: 'الإمارات', method: 'dubai', tz: 'Asia/Dubai', cities: [
      ['دبي', 25.2048, 55.2708], ['أبوظبي', 24.4539, 54.3773], ['الشارقة', 25.3463, 55.4209],
      ['العين', 24.2075, 55.7447], ['عجمان', 25.4052, 55.5136], ['رأس الخيمة', 25.8007, 55.9762]] },
    { id: 'KW', ar: 'الكويت', method: 'kuwait', tz: 'Asia/Kuwait', cities: [
      ['مدينة الكويت', 29.3759, 47.9774], ['الجهراء', 29.3375, 47.6581], ['الأحمدي', 29.0769, 48.0839]] },
    { id: 'QA', ar: 'قطر', method: 'qatar', tz: 'Asia/Qatar', cities: [
      ['الدوحة', 25.2854, 51.531], ['الوكرة', 25.1659, 51.5976], ['الخور', 25.6839, 51.5058]] },
    { id: 'BH', ar: 'البحرين', method: 'mwl', tz: 'Asia/Bahrain', cities: [
      ['المنامة', 26.2285, 50.586], ['المحرق', 26.2572, 50.6119]] },
    { id: 'OM', ar: 'عُمان', method: 'mwl', tz: 'Asia/Muscat', cities: [
      ['مسقط', 23.588, 58.3829], ['صلالة', 17.0151, 54.0924], ['صحار', 24.3474, 56.7092], ['نزوى', 22.9333, 57.5333]] },
    { id: 'YE', ar: 'اليمن', method: 'mwl', tz: 'Asia/Aden', cities: [
      ['صنعاء', 15.3694, 44.191], ['عدن', 12.7855, 45.0187], ['تعز', 13.5795, 44.0209], ['المكلا', 14.5425, 49.1242]] },
    { id: 'JO', ar: 'الأردن', method: 'mwl', tz: 'Asia/Amman', cities: [
      ['عمّان', 31.9539, 35.9106], ['إربد', 32.5556, 35.85], ['الزرقاء', 32.0728, 36.088], ['العقبة', 29.532, 35.0063]] },
    { id: 'PS', ar: 'فلسطين', method: 'mwl', tz: 'Asia/Hebron', cities: [
      ['القدس', 31.7683, 35.2137], ['غزة', 31.5017, 34.4668, 'Asia/Gaza'], ['رام الله', 31.9038, 35.2034],
      ['نابلس', 32.2211, 35.2544], ['الخليل', 31.5326, 35.0998]] },
    { id: 'LB', ar: 'لبنان', method: 'mwl', tz: 'Asia/Beirut', cities: [
      ['بيروت', 33.8938, 35.5018], ['طرابلس', 34.4367, 35.8497], ['صيدا', 33.5571, 35.3729]] },
    { id: 'SY', ar: 'سوريا', method: 'mwl', tz: 'Asia/Damascus', cities: [
      ['دمشق', 33.5138, 36.2765], ['حلب', 36.2021, 37.1343], ['حمص', 34.7324, 36.7137], ['اللاذقية', 35.5317, 35.7901]] },
    { id: 'IQ', ar: 'العراق', method: 'mwl', tz: 'Asia/Baghdad', cities: [
      ['بغداد', 33.3152, 44.3661], ['البصرة', 30.5085, 47.7804], ['الموصل', 36.3489, 43.1577],
      ['أربيل', 36.1911, 44.0092], ['النجف', 32.0259, 44.3462], ['كربلاء', 32.616, 44.0249]] },
    { id: 'SD', ar: 'السودان', method: 'egypt', tz: 'Africa/Khartoum', cities: [
      ['الخرطوم', 15.5007, 32.5599], ['أم درمان', 15.6445, 32.4777], ['بورتسودان', 19.6158, 37.2164]] },
    { id: 'LY', ar: 'ليبيا', method: 'egypt', tz: 'Africa/Tripoli', cities: [
      ['طرابلس', 32.8872, 13.1913], ['بنغازي', 32.1167, 20.0667], ['مصراتة', 32.3754, 15.0925]] },
    { id: 'TN', ar: 'تونس', method: 'mwl', tz: 'Africa/Tunis', cities: [
      ['تونس', 36.8065, 10.1815], ['صفاقس', 34.7406, 10.7603], ['سوسة', 35.8256, 10.6084]] },
    { id: 'DZ', ar: 'الجزائر', method: 'algeria', tz: 'Africa/Algiers', cities: [
      ['الجزائر العاصمة', 36.7538, 3.0588], ['وهران', 35.6971, -0.6308], ['قسنطينة', 36.365, 6.6147]] },
    { id: 'MA', ar: 'المغرب', method: 'morocco', tz: 'Africa/Casablanca', cities: [
      ['الرباط', 34.0209, -6.8416], ['الدار البيضاء', 33.5731, -7.5898], ['فاس', 34.0181, -5.0078],
      ['مراكش', 31.6295, -7.9811], ['طنجة', 35.7595, -5.834]] },
    { id: 'MR', ar: 'موريتانيا', method: 'mwl', tz: 'Africa/Nouakchott', cities: [['نواكشوط', 18.0735, -15.9582]] },
    { id: 'SO', ar: 'الصومال', method: 'mwl', tz: 'Africa/Mogadishu', cities: [['مقديشو', 2.0469, 45.3182]] },
    { id: 'DJ', ar: 'جيبوتي', method: 'mwl', tz: 'Africa/Djibouti', cities: [['جيبوتي', 11.5721, 43.1456]] },
    { id: 'TR', ar: 'تركيا', method: 'turkey', tz: 'Europe/Istanbul', cities: [
      ['إسطنبول', 41.0082, 28.9784], ['أنقرة', 39.9334, 32.8597], ['إزمير', 38.4237, 27.1428]] },
    { id: 'PK', ar: 'باكستان', method: 'karachi', tz: 'Asia/Karachi', cities: [
      ['كراتشي', 24.8607, 67.0011], ['لاهور', 31.5204, 74.3587], ['إسلام آباد', 33.6844, 73.0479]] },
    { id: 'IN', ar: 'الهند', method: 'karachi', tz: 'Asia/Kolkata', cities: [
      ['دلهي', 28.6139, 77.209], ['مومباي', 19.076, 72.8777]] },
    { id: 'ID', ar: 'إندونيسيا', method: 'singapore', tz: 'Asia/Jakarta', cities: [['جاكرتا', -6.2088, 106.8456]] },
    { id: 'MY', ar: 'ماليزيا', method: 'singapore', tz: 'Asia/Kuala_Lumpur', cities: [['كوالالمبور', 3.139, 101.6869]] },
    { id: 'GB', ar: 'بريطانيا', method: 'mwl', tz: 'Europe/London', cities: [
      ['لندن', 51.5074, -0.1278], ['مانشستر', 53.4808, -2.2426], ['برمنغهام', 52.4862, -1.8904]] },
    { id: 'FR', ar: 'فرنسا', method: 'mwl', tz: 'Europe/Paris', cities: [
      ['باريس', 48.8566, 2.3522], ['مرسيليا', 43.2965, 5.3698], ['ليون', 45.764, 4.8357]] },
    { id: 'DE', ar: 'ألمانيا', method: 'mwl', tz: 'Europe/Berlin', cities: [
      ['برلين', 52.52, 13.405], ['ميونخ', 48.1351, 11.582], ['فرانكفورت', 50.1109, 8.6821]] },
    { id: 'US', ar: 'الولايات المتحدة', method: 'isna', tz: 'America/New_York', cities: [
      ['نيويورك', 40.7128, -74.006], ['واشنطن', 38.9072, -77.0369], ['ديترويت', 42.3314, -83.0458, 'America/Detroit'],
      ['شيكاغو', 41.8781, -87.6298, 'America/Chicago'], ['هيوستن', 29.7604, -95.3698, 'America/Chicago'],
      ['لوس أنجلوس', 34.0522, -118.2437, 'America/Los_Angeles']] },
    { id: 'CA', ar: 'كندا', method: 'isna', tz: 'America/Toronto', cities: [
      ['تورونتو', 43.6532, -79.3832], ['مونتريال', 45.5017, -73.5673], ['فانكوفر', 49.2827, -123.1207, 'America/Vancouver']] },
    { id: 'AU', ar: 'أستراليا', method: 'mwl', tz: 'Australia/Sydney', cities: [
      ['سيدني', -33.8688, 151.2093], ['ملبورن', -37.8136, 144.9631, 'Australia/Melbourne']] }
  ];

  // ---- place state ----
  function guessPlace() {
    let tz = '';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (_) {}
    for (const c of COUNTRIES) {
      const i = c.cities.findIndex((ct) => (ct[3] || c.tz) === tz);
      if (i >= 0) return { country: c.id, city: i, method: '', asr: 1, custom: null };
    }
    return { country: 'EG', city: 0, method: '', asr: 1, custom: null };
  }
  let P = (() => {
    try {
      const saved = JSON.parse(localStorage.getItem(PLACE_KEY) || 'null');
      if (saved && COUNTRIES.some((c) => c.id === saved.country)) return Object.assign(guessPlace(), saved);
    } catch (_) {}
    return guessPlace();
  })();
  let version = 1;
  function savePlace() {
    version++;
    try { localStorage.setItem(PLACE_KEY, JSON.stringify(P)); } catch (_) {}
  }
  const countryOf = (id) => COUNTRIES.find((c) => c.id === id) || COUNTRIES[0];
  function resolved() {
    const c = countryOf(P.country);
    const methodKey = P.method && METHODS[P.method] ? P.method : c.method;
    if (P.custom) {
      return { name: P.custom.name, country: c.ar, lat: P.custom.lat, lon: P.custom.lon, tz: P.custom.tz, methodKey, asr: P.asr };
    }
    const ct = c.cities[P.city] || c.cities[0];
    return { name: ct[0], country: c.ar, lat: ct[1], lon: ct[2], tz: ct[3] || c.tz, methodKey, asr: P.asr };
  }

  // ---- time zone ----
  const dtfCache = {};
  let offCache = { key: '', val: 0 };
  function tzOffset(epoch, tz) {
    const key = tz + '|' + Math.floor(epoch / 60000);
    if (offCache.key === key) return offCache.val;
    try {
      const f = dtfCache[tz] || (dtfCache[tz] = new Intl.DateTimeFormat('en-US', {
        timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric',
        hour: 'numeric', minute: 'numeric', second: 'numeric' }));
      const p = {};
      for (const x of f.formatToParts(epoch)) p[x.type] = x.value;
      const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
      offCache = { key, val: asUTC - Math.floor(epoch / 1000) * 1000 };
    } catch (_) {
      offCache = { key, val: -new Date(epoch).getTimezoneOffset() * 60000 };
    }
    return offCache.val;
  }

  // ---- sun & prayer times (PrayTimes.org) ----
  const D2R = Math.PI / 180;
  const dsin = (d) => Math.sin(d * D2R), dcos = (d) => Math.cos(d * D2R), dtan = (d) => Math.tan(d * D2R);
  const darcsin = (x) => Math.asin(x) / D2R, darccos = (x) => Math.acos(x) / D2R;
  const darctan2 = (y, x) => Math.atan2(y, x) / D2R, darccot = (x) => Math.atan(1 / x) / D2R;
  const fix = (a, b) => { a = a - b * Math.floor(a / b); return a < 0 ? a + b : a; };
  function julian(y, m, d) {
    if (m <= 2) { y -= 1; m += 12; }
    const A = Math.floor(y / 100), B = 2 - A + Math.floor(A / 4);
    return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5;
  }
  function sunPos(jd) {
    const D = jd - 2451545.0;
    const g = fix(357.529 + 0.98560028 * D, 360);
    const q = fix(280.459 + 0.98564736 * D, 360);
    const L = fix(q + 1.915 * dsin(g) + 0.020 * dsin(2 * g), 360);
    const e = 23.439 - 0.00000036 * D;
    const RA = darctan2(dcos(e) * dsin(L), dcos(L)) / 15;
    return { decl: darcsin(dsin(e) * dsin(L)), eqt: q / 15 - fix(RA, 24) };
  }
  // Returns local clock hours (e.g. 17.5 = 5:30 pm) for the given local date.
  function prayerTimes(y, m, d, lat, lon, tzHours, method, asrFactor) {
    const jDate = julian(y, m, d) - lon / (15 * 24);
    const midDay = (t) => fix(12 - sunPos(jDate + t).eqt, 24);
    const angleTime = (angle, t, ccw) => {
      const decl = sunPos(jDate + t).decl;
      const T = darccos((-dsin(angle) - dsin(decl) * dsin(lat)) / (dcos(decl) * dcos(lat))) / 15;
      return midDay(t) + (ccw ? -T : T);
    };
    const asrTime = (f, t) => {
      const decl = sunPos(jDate + t).decl;
      return angleTime(-darccot(f + dtan(Math.abs(lat - decl))), t);
    };
    const g = { fajr: 5, sunrise: 6, dhuhr: 12, asr: 13, sunset: 18, isha: 18 };
    const t = {
      fajr: angleTime(method.fajr, g.fajr / 24, true),
      sunrise: angleTime(0.833, g.sunrise / 24, true),
      dhuhr: midDay(g.dhuhr / 24),
      asr: asrTime(asrFactor, g.asr / 24),
      sunset: angleTime(0.833, g.sunset / 24),
      isha: method.ishaMin ? NaN : angleTime(method.isha, g.isha / 24)
    };
    const adj = tzHours - lon / 15;
    const out = {};
    for (const k in t) out[k] = t[k] + adj;
    out.dhuhr += 1 / 60;
    out.maghrib = out.sunset;
    if (method.ishaMin) out.isha = out.sunset + method.ishaMin / 60;
    return out;
  }

  // ---- moon ----
  const SYNODIC = 29.530588853;
  const NEW_MOON_REF = Date.UTC(2000, 0, 6, 18, 14);
  const PHASES = [
    [1.84566, 'محاق'], [5.53699, 'هلال متزايد'], [9.22831, 'تربيع أول'], [12.91963, 'أحدب متزايد'],
    [16.61096, 'بدر'], [20.30228, 'أحدب متناقص'], [23.99361, 'تربيع أخير'], [27.68493, 'هلال متناقص'], [99, 'محاق']
  ];
  function moon(epoch) {
    const age = fix((epoch - NEW_MOON_REF) / 86400000, SYNODIC);
    const illum = (1 - Math.cos((2 * Math.PI * age) / SYNODIC)) / 2;
    return { age, frac: age / SYNODIC, illum, name: PHASES.find((p) => age < p[0])[1] };
  }

  // ---- formatting ----
  const pad = (n) => String(n).padStart(2, '0');
  function fmtHM(h, withSuffix = true) {
    if (!Number.isFinite(h)) return '—';
    const mins = Math.round(fix(h, 24) * 60) % 1440;
    const hh = Math.floor(mins / 60), mm = mins % 60;
    return ar(`${hh % 12 || 12}:${pad(mm)}`) + (withSuffix ? (hh < 12 ? ' ص' : ' م') : '');
  }
  function fmtIn(hours) {
    const mins = Math.max(0, Math.round(hours * 60));
    if (mins < 1) return 'الآن';
    const h = Math.floor(mins / 60), m = mins % 60;
    return 'بعد ' + (h ? ar(`${h}س ${m}د`) : ar(`${m}د`));
  }
  const PRAYER_NAMES = { fajr: 'الفجر', sunrise: 'الشروق', dhuhr: 'الظهر', asr: 'العصر', maghrib: 'المغرب', isha: 'العشاء' };
  const PRAYER_ORDER = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

  // ---- snapshot (cached per minute and per place change) ----
  let snapCache = { key: '', val: null };
  function snapshot(epoch) {
    const key = Math.floor(epoch / 60000) + '|' + version;
    if (snapCache.key === key) return snapCache.val;
    const place = resolved();
    const method = METHODS[place.methodKey];
    const off = tzOffset(epoch, place.tz);
    const local = new Date(epoch + off);
    const y = local.getUTCFullYear(), m = local.getUTCMonth() + 1, d = local.getUTCDate();
    const nowH = local.getUTCHours() + local.getUTCMinutes() / 60 + local.getUTCSeconds() / 3600;
    const tzH = off / 3600000;
    const today = prayerTimes(y, m, d, place.lat, place.lon, tzH, method, place.asr);

    let next = null;
    for (const k of PRAYER_ORDER) {
      if (Number.isFinite(today[k]) && today[k] > nowH) { next = { key: k, h: today[k], inH: today[k] - nowH }; break; }
    }
    if (!next) {
      const tm = new Date(Date.UTC(y, m - 1, d + 1));
      const tomorrow = prayerTimes(tm.getUTCFullYear(), tm.getUTCMonth() + 1, tm.getUTCDate(), place.lat, place.lon, tzH, method, place.asr);
      next = { key: 'fajr', h: tomorrow.fajr, inH: tomorrow.fajr + 24 - nowH };
    }
    next.name = PRAYER_NAMES[next.key];
    next.time = fmtHM(next.h);
    next.inText = Number.isFinite(next.inH) ? fmtIn(next.inH) : '';

    const opt = (o) => Object.assign({ timeZone: place.tz }, o);
    let hijri = '', hijriFull = '';
    try {
      hijri = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-arab', opt({ day: 'numeric', month: 'long' })).format(epoch);
      hijriFull = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-arab', opt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })).format(epoch);
    } catch (_) {}

    const val = {
      key, place, method, nowH, today, next,
      dayLen: today.sunset - today.sunrise,
      moon: moon(epoch),
      dateEn: (() => {
        const p = {};
        for (const x of new Intl.DateTimeFormat('en-US', opt({ weekday: 'short', day: 'numeric', month: 'short' })).formatToParts(epoch)) p[x.type] = x.value;
        return `${p.weekday} ${p.day} ${p.month}`.toUpperCase();
      })(),
      dateEnFull: new Intl.DateTimeFormat('en-US', opt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })).format(epoch),
      dateArFull: new Intl.DateTimeFormat('ar-EG', opt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })).format(epoch),
      timeHere: new Intl.DateTimeFormat('ar-EG', opt({ hour: 'numeric', minute: '2-digit' })).format(epoch),
      hijri, hijriFull, fmtHM
    };
    snapCache = { key, val };
    return val;
  }

  // ---- settings panel ----
  const panel = $('placePanel'), selCountry = $('pCountry'), selCity = $('pCity'), selMethod = $('pMethod'), selAsr = $('pAsr');

  function fillSelect(sel, items, value) {
    sel.replaceChildren(...items.map(([v, label]) => {
      const o = document.createElement('option');
      o.value = v; o.textContent = label;
      return o;
    }));
    sel.value = value;
  }
  function syncForm() {
    const c = countryOf(P.country);
    fillSelect(selCountry, COUNTRIES.map((x) => [x.id, x.ar]), P.country);
    const cityItems = c.cities.map((ct, i) => [String(i), ct[0]]);
    if (P.custom) cityItems.unshift(['custom', P.custom.name]);
    fillSelect(selCity, cityItems, P.custom ? 'custom' : String(P.city));
    fillSelect(selMethod, [['', `تلقائي حسب الدولة (${METHODS[c.method].ar})`]].concat(Object.entries(METHODS).map(([k, m]) => [k, m.ar])), P.method || '');
    selAsr.value = String(P.asr);
    $('placeName').textContent = resolved().name;
  }
  function renderPanel() {
    const s = snapshot(Date.now());
    $('placeName').textContent = s.place.name;
    if (panel.hidden) return;
    const dates = $('ppDates');
    dates.replaceChildren();
    const line = (text, cls, dir) => {
      const p = document.createElement('p');
      if (cls) p.className = cls;
      if (dir) p.dir = dir;
      p.textContent = text;
      dates.append(p);
    };
    line(`${s.place.name}، ${s.place.country} · الساعة الآن ${s.timeHere}`, 'pp-here');
    line(s.hijriFull, 'pp-date');
    line(s.dateArFull, 'pp-date');
    line(s.dateEnFull, 'pp-date pp-en', 'ltr');

    const rows = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'].map((k) => {
      const tr = document.createElement('tr');
      if (s.next && s.next.key === k) tr.className = 'is-next';
      const a = document.createElement('th'); a.scope = 'row'; a.textContent = PRAYER_NAMES[k];
      const b = document.createElement('td'); b.textContent = fmtHM(s.today[k]);
      const c = document.createElement('td'); c.className = 'pp-in';
      c.textContent = s.next && s.next.key === k ? s.next.inText : '';
      tr.append(a, b, c);
      return tr;
    });
    $('ppTimes').replaceChildren(...rows);
    const dl = s.dayLen;
    const dlText = Number.isFinite(dl) ? ar(`${Math.floor(dl)}س ${Math.round((dl % 1) * 60)}د`) : '—';
    $('ppSun').textContent = `الشروق ${fmtHM(s.today.sunrise)} · الغروب ${fmtHM(s.today.sunset)} · طول النهار ${dlText}`;
    $('ppMoon').textContent = `القمر: ${s.moon.name} · الإضاءة ${ar(Math.round(s.moon.illum * 100))}٪ · عمره ${ar(Math.floor(s.moon.age))} يوماً`;
    $('ppMethod').textContent = `طريقة الحساب: ${s.method.ar}`;
  }
  function openPanel() {
    syncForm();
    panel.hidden = false;
    const lp = panel.closest('.left-pane');
    if (lp) lp.scrollTop = 0;
    renderPanel();
    selCity.focus();
  }
  function closePanel() {
    panel.hidden = true;
    $('placeChip').focus();
  }
  function changed() {
    savePlace();
    syncForm();
    renderPanel();
  }

  selCountry.addEventListener('change', () => { P.country = selCountry.value; P.city = 0; P.custom = null; P.method = ''; changed(); });
  selCity.addEventListener('change', () => {
    if (selCity.value !== 'custom') { P.city = Number(selCity.value); P.custom = null; }
    changed();
  });
  selMethod.addEventListener('change', () => { P.method = selMethod.value; changed(); });
  selAsr.addEventListener('change', () => { P.asr = Number(selAsr.value) || 1; changed(); });
  $('placeChip').addEventListener('click', () => (panel.hidden ? openPanel() : closePanel()));
  $('placeClose').addEventListener('click', closePanel);
  panel.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); closePanel(); } });

  $('pLocate').addEventListener('click', () => {
    const msg = $('pLocateMsg');
    if (!navigator.geolocation) { msg.textContent = 'المتصفح لا يدعم تحديد الموقع. اختر المدينة من القائمة.'; return; }
    msg.textContent = 'جارٍ تحديد موقعك…';
    navigator.geolocation.getCurrentPosition((pos) => {
      const { latitude: lat, longitude: lon } = pos.coords;
      let best = null;
      for (const c of COUNTRIES) c.cities.forEach((ct, i) => {
        const dist = Math.hypot(ct[1] - lat, (ct[2] - lon) * Math.cos(lat * D2R));
        if (!best || dist < best.dist) best = { c, i, dist };
      });
      let tz = best.c.cities[best.i][3] || best.c.tz;
      try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || tz; } catch (_) {}
      P.country = best.c.id;
      P.city = best.i;
      P.custom = { name: `موقعي (قرب ${best.c.cities[best.i][0]})`, lat, lon, tz };
      msg.textContent = 'تم تحديد موقعك.';
      changed();
    }, () => {
      msg.textContent = 'تعذّر الوصول إلى موقعك. اختر الدولة والمدينة من القائمة.';
    }, { timeout: 10000, maximumAge: 600000 });
  });

  setInterval(renderPanel, 15000);

  window.noonAstro = {
    tzOffset: (epoch) => tzOffset(epoch, resolved().tz),
    snapshot,
    open: openPanel
  };
  syncForm();
})();
