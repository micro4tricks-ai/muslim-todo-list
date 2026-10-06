// ---------- Hijri calendar, seasons of worship and Sunnah reminders ----------
// Recommended fasts (Monday & Thursday, the White Days, Arafah, Ashura, six of Shawwal),
// the seasons (Ramadan, its last ten nights, the ten days of Dhul-Hijjah, Muharram, Sha'ban),
// the days on which fasting is not allowed (the two Eids, the days of Tashreeq), and Friday.
// Each one shows its evidence from js/sunnah-data.js (cut from the hadith collections by
// tools/build_sunnah.py). Reminders come the evening before; the phone app books them ahead.
(() => {
  'use strict';
  const { T, I, $, el, button, load, store, dayKey, toast, onRemote } = window.noonUI;
  const TX = window.NOON_SUNNAH_TEXTS || {};
  const KEY = 'noon-sweep-sunnah';
  const root = $('view-calendar');
  const native = () => window.noonNative;
  const defaults = () => ({ adj: 0, time: '21:00', fast: true, white: true, seasons: true, friday: true, adhkar: false, wird: false, wirdTime: '20:00',
    suhoor: true, daily: false, notify: !!native(), ramadan: {} });
  let S = Object.assign(defaults(), load(KEY, {}));
  const save = () => { S.updatedAt = Date.now(); store(KEY, S); window.dispatchEvent(new CustomEvent('noon-sunnah')); };

  const MONTHS_AR = ['محرّم', 'صفر', 'ربيع الأول', 'ربيع الآخر', 'جمادى الأولى', 'جمادى الآخرة', 'رجب', 'شعبان', 'رمضان', 'شوّال', 'ذو القعدة', 'ذو الحجة'];
  const MONTHS_EN = ['Muharram', 'Safar', 'Rabi‘ al-Awwal', 'Rabi‘ al-Akhir', 'Jumada al-Ula', 'Jumada al-Akhirah', 'Rajab', 'Sha‘ban', 'Ramadan', 'Shawwal', 'Dhu al-Qa‘dah', 'Dhu al-Hijjah'];
  const monthName = (m) => (I.isEn ? MONTHS_EN : MONTHS_AR)[m - 1];

  // ---- dates: a day is its local midnight (ms); the Hijri date follows Umm al-Qura plus the user's shift ----
  const midnight = (t) => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
  const plusDays = (day, n) => { const d = new Date(day); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n).getTime(); };
  let hfmt = null;
  try { hfmt = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'UTC' }); } catch (_) {}
  const hcache = new Map();
  function hijri(day) {
    const d = new Date(day);
    const k = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}|${S.adj}`;
    if (hcache.has(k)) return hcache.get(k);
    let h = { y: 0, m: 0, d: 0 };
    if (hfmt) {
      const p = {};
      hfmt.formatToParts(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate() + S.adj, 12)).forEach((x) => { p[x.type] = x.value; });
      h = { y: parseInt(p.year, 10), m: parseInt(p.month, 10), d: parseInt(p.day, 10) };
    }
    hcache.set(k, h);
    return h;
  }
  const hijriText = (h, withYear) => `${I.num(h.d)} ${monthName(h.m)}${withYear ? ` ${I.num(h.y)} ${T('هـ')}` : ''}`;
  const gregText = (day, o) => new Date(day).toLocaleDateString(I.locale, o || { weekday: 'long', day: 'numeric', month: 'long' });

  // ---- what each day holds ----
  // kind: fast (recommended fast), season, nofast (fasting not allowed), friday
  const INFO = {
    monday: ['صيام يوم الاثنين', 'Fasting on Monday', 'fast', ['monThu', 'monday']],
    thursday: ['صيام يوم الخميس', 'Fasting on Thursday', 'fast', ['monThu']],
    white: ['صيام الأيام البيض', 'Fasting the White Days', 'fast', ['white']],
    arafah: ['صيام يوم عرفة', 'Fasting the Day of Arafah', 'fast', ['arafah']],
    tasua: ['صيام تاسوعاء (٩ محرّم)', 'Fasting Tasu‘a (9 Muharram)', 'fast', ['tasua']],
    ashura: ['صيام يوم عاشوراء (١٠ محرّم)', 'Fasting Ashura (10 Muharram)', 'fast', ['ashura']],
    shawwal: ['صيام ستة أيام من شوّال', 'Fasting six days of Shawwal', 'fast', ['shawwal']],
    dhulhijja: ['العشر الأوائل من ذي الحجة', 'The first ten days of Dhul-Hijjah', 'season', ['dhulhijja']],
    muharram: ['شهر الله المحرّم', 'Allah’s month of Muharram', 'season', ['muharram']],
    shaban: ['شهر شعبان', 'The month of Sha‘ban', 'season', ['shaban']],
    ramadan: ['شهر رمضان', 'The month of Ramadan', 'season', ['ramadan']],
    lastTen: ['العشر الأواخر: تحرَّ ليلة القدر', 'The last ten nights: seek Laylat al-Qadr', 'season', ['lastTen']],
    eidFitr: ['عيد الفطر: لا يُصام', 'Eid al-Fitr: no fasting', 'nofast', ['eid']],
    eidAdha: ['عيد الأضحى: لا يُصام', 'Eid al-Adha: no fasting', 'nofast', ['eid']],
    tashreeq: ['أيام التشريق: لا تُصام', 'Days of Tashreeq: no fasting', 'nofast', ['tashreeq']],
    friday: ['يوم الجمعة: سورة الكهف والصلاة على النبي ﷺ', 'Friday: Surat al-Kahf and blessings on the Prophet ﷺ', 'friday', ['kahf', 'friday', 'fridayFast']]
  };
  function eventsOn(day) {
    const h = hijri(day), w = new Date(day).getDay(), out = [];
    const add = (id) => out.push(id);
    const eid = (h.m === 10 && h.d === 1) || (h.m === 12 && h.d === 10);
    const tashreeq = h.m === 12 && h.d >= 11 && h.d <= 13;
    if (h.m === 10 && h.d === 1) add('eidFitr');
    if (h.m === 12 && h.d === 10) add('eidAdha');
    if (tashreeq) add('tashreeq');
    if (h.m === 9) { add('ramadan'); if (h.d >= 21) add('lastTen'); }
    if (h.m === 12 && h.d === 9) add('arafah');
    if (h.m === 12 && h.d <= 8) add('dhulhijja');
    if (h.m === 1 && h.d === 9) add('tasua');
    if (h.m === 1 && h.d === 10) add('ashura');
    if (h.m === 1 && h.d === 1) add('muharram');
    if (h.m === 8 && h.d === 1) add('shaban');
    if (h.m === 10 && h.d >= 2) add('shawwal');
    if (!eid && !tashreeq && h.m !== 9) {
      if (h.d >= 13 && h.d <= 15) add('white');
      if (w === 1) add('monday');
      if (w === 4) add('thursday');
    }
    if (w === 5) add('friday');
    return out;
  }
  const title = (id) => (I.isEn ? INFO[id][1] : INFO[id][0]);
  const kind = (id) => INFO[id][2];

  // ---- reminders ----
  // Which events remind, and on which day (the evening before, at the chosen time).
  function wants(id, day) {
    const h = hijri(day);
    if (id === 'monday' || id === 'thursday') return S.fast;
    if (id === 'white') return S.white;
    if (id === 'shawwal') return S.seasons && h.d === 2;
    if (id === 'ramadan') return S.seasons && h.d === 1;
    if (id === 'lastTen') return S.seasons && h.d === 21;
    if (id === 'dhulhijja') return S.seasons && h.d === 1;
    if (['arafah', 'tasua', 'ashura', 'muharram', 'shaban', 'eidFitr', 'eidAdha'].includes(id)) return S.seasons;
    return false;
  }
  const hm = (s) => { const [a, b] = String(s).split(':').map(Number); return (a || 0) + (b || 0) / 60; };
  const at = (day, hours) => day + Math.round(hours * 60) * 60000;
  // Prayer times of a given day, from the clock's place settings, with that place's midnight.
  function times(day) {
    const A = window.noonAstro;
    if (!A) return null;
    const noon = day + 12 * 3600e3;
    const snap = A.snapshot(noon);
    return snap && Object.assign({ mid: noon - snap.nowH * 3600e3 }, snap.today);
  }
  function brief(id) {
    const t = TX[INFO[id][3][0]];
    return t ? (I.isEn ? t.en : t.ar) : '';
  }
  function refOf(id) {
    const t = TX[INFO[id][3][0]];
    return t ? (I.isEn ? t.refEn : t.refAr) : '';
  }
  // Everything due from `from` (ms) over `days` days, as { key, at, title, body }.
  function plan(from, days) {
    const out = [];
    const start = midnight(from);
    for (let n = 0; n <= days; n++) {
      const day = plusDays(start, n), next = plusDays(day, 1);
      // Tomorrow's fasts and seasons, announced this evening.
      const tomorrow = eventsOn(next).filter((id) => wants(id, next));
      if (tomorrow.length) {
        const fast = tomorrow.some((id) => kind(id) === 'fast');
        out.push({
          key: `eve-${dayKey(next)}`, at: at(day, hm(S.time)),
          title: `${T('غداً')}: ${tomorrow.map(title).join(I.isEn ? ' · ' : ' · ')}`,
          body: fast ? `${T('انوِ الصيام من الليل ولا تنسَ السحور.')} ${brief(tomorrow[0])}` : brief(tomorrow[0]),
          hadith: brief(tomorrow[0]), ref: refOf(tomorrow[0]), note: fast ? T('انوِ الصيام من الليل ولا تنسَ السحور.') : '', view: 'calendar'
        });
      }
      const tt = (S.friday || S.adhkar) ? times(day) : null;
      if (S.friday && new Date(day).getDay() === 5) {
        const sun = tt && Number.isFinite(tt.sunrise) ? at(tt.mid, tt.sunrise + 1.5) : at(day, 8);
        out.push({ key: `fri-${dayKey(day)}`, at: sun, title: title('friday'), body: brief('friday'), hadith: brief('friday'), ref: refOf('friday'), view: 'calendar' });
      }
      if (S.adhkar && tt) {
        if (Number.isFinite(tt.fajr)) out.push({ key: `am-${dayKey(day)}`, at: at(tt.mid, tt.fajr + 0.4), title: T('أذكار الصباح'), body: T('حان وقت أذكار الصباح. اضغط لفتحها.'), view: 'adhkar' });
        if (Number.isFinite(tt.asr)) out.push({ key: `pm-${dayKey(day)}`, at: at(tt.mid, tt.asr + 0.4), title: T('أذكار المساء'), body: T('حان وقت أذكار المساء. اضغط لفتحها.'), view: 'adhkar' });
      }
      const cards = window.noonCards && window.noonCards.plan(dayKey(day));
      if (cards) out.push({ key: `cards-${dayKey(day)}`, at: at(day, hm(cards.time)), title: T('مراجعة كروت الحفظ'), body: `${T('لديك كروت للمراجعة اليوم:')} ${I.num(cards.due)}`, view: 'cards' });
      if (S.suhoor && hijri(next).m === 9) {
        const nt = times(next);
        if (nt && Number.isFinite(nt.fajr)) out.push({ key: `suhoor-${dayKey(next)}`, at: at(nt.mid, nt.fajr - 0.75), title: T('وقت السحور'), body: T('بقي نحو ٤٥ دقيقة على الفجر. تسحّروا فإن في السحور بركة.'), view: 'calendar' });
      }
      if (S.daily && window.NOON_EXTRAS) {
        const v = verseOfDay(day);
        out.push({ key: `daily-${dayKey(day)}`, at: at(day, 7.5), title: T('آية اليوم'), body: I.isEn ? v.en : v.ar, hadith: I.isEn ? v.en : v.ar, ref: I.isEn ? v.refEn : v.refAr, quran: !I.isEn, view: 'quran' });
      }
      if (S.wird) out.push({ key: `wird-${dayKey(day)}`, at: at(day, hm(S.wirdTime)), title: T('وردك من القرآن'), body: T('خصّص دقائق لوردك اليومي من المصحف.'), view: 'quran' });
    }
    return out.filter((x) => x.at > from - 30 * 60000).sort((a, b) => a.at - b.at);
  }

  // In the page: announce what falls due while it is open.
  let fired = {};
  try { fired = JSON.parse(localStorage.getItem('noon-sunnah-fired') || '{}'); } catch (_) {}
  function check() {
    const now = Date.now();
    for (const r of plan(now - 864e5, 1)) {
      if (r.at > now || now - r.at > 30 * 60000 || fired[r.key]) continue;
      fired[r.key] = now;
      if (r.key.startsWith('wird-') && window.noonQuran) { const p = window.noonQuran.progress(); if (p.today >= p.goal) continue; }
      showCard(r);
      if (!native() && S.notify && 'Notification' in window && Notification.permission === 'granted') {
        try { new Notification(r.title, { body: r.body, tag: r.key }); } catch (_) {}
      }
    }
    // Forget announcements older than two days.
    for (const k of Object.keys(fired)) if (now - fired[k] > 2 * 864e5) delete fired[k];
    try { localStorage.setItem('noon-sunnah-fired', JSON.stringify(fired)); } catch (_) {}
  }

  // A reminder as a designed card (js/remind-card.js), or a plain notice without it.
  function showCard(r) {
    const open = r.view ? [{ label: T('افتح'), primary: true, run: () => window.noonUI.go(r.view) }] : [];
    if (!window.noonCard) { toast(`${r.title}. ${r.body}`, r.view ? { label: T('افتح'), run: () => window.noonUI.go(r.view) } : null); return; }
    window.noonCard.show({ title: r.title, body: r.hadith || r.body, ref: r.hadith ? [r.note, r.ref].filter(Boolean).join(' · ') : '', quran: r.quran, actions: open });
  }
  // The verse of the day: one of the chosen verses in js/extras-data.js, the same all day.
  function verseOfDay(day) {
    const V = window.NOON_EXTRAS.verses;
    return V[Math.floor(midnight(day) / 864e5) % V.length];
  }
  // The phone app opens the card of the reminder that was tapped.
  window.addEventListener('noon-reminder-tap', (ev) => {
    const r = plan(Date.now() - 2 * 864e5, 3).find((x) => x.key === ev.detail.key);
    if (r) showCard(r); else if (ev.detail.view) window.noonUI.go(ev.detail.view);
  });

  // ================= the view =================
  let shown = null; // first day of the Hijri month on screen
  let picked = null; // day whose details are open
  function monthStart(day) { const h = hijri(day); return plusDays(midnight(day), 1 - h.d); }

  function render() {
    const today = midnight(Date.now());
    if (!shown) shown = monthStart(today);
    if (!picked) picked = today;
    root.replaceChildren();
    const h = hijri(today);
    const head = el('div', 'view-head');
    head.append(el('h2', '', T('التقويم الهجري والمواسم')), el('span', 'view-sub', T('تقويم أم القرى')));
    root.append(head);

    // Today.
    const card = el('div', 'cal-today');
    const big = el('div', 'cal-today-date');
    big.append(el('b', '', hijriText(h, true)), el('span', '', gregText(today, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })));
    card.append(big);
    const evs = eventsOn(today), tom = eventsOn(plusDays(today, 1));
    const lines = el('div', 'cal-lines');
    if (evs.length) evs.forEach((id) => lines.append(tag(id, T('اليوم'))));
    tom.filter((id) => id !== 'ramadan' && id !== 'shawwal' && id !== 'dhulhijja' && id !== 'lastTen').forEach((id) => lines.append(tag(id, T('غداً'))));
    if (!lines.childNodes.length) lines.append(el('span', 'hint', T('لا مناسبة خاصة اليوم. أكثِر من ذكر الله.')));
    card.append(lines);
    if (evs.some((id) => kind(id) === 'fast')) {
      const fasting = !!(load('noon-sweep-habits', { log: {} }).log[dayKey()] || {}).fasting;
      const b = button(`btn ${fasting ? 'btn-quiet' : 'btn-primary'}`, T(fasting ? 'سجّلت صيام اليوم ✓' : 'أنا صائم اليوم'), () => {
        window.dispatchEvent(new CustomEvent('noon-habit', { detail: { id: 'fasting', value: !fasting } }));
        if (!fasting) toast(T('تقبّل الله صيامك. سُجّل في عادة «صيام تطوع».'));
        render();
      });
      card.append(b);
    }
    root.append(card);

    // Big occasions ahead.
    const rm = ramadanCard(today);
    if (rm) root.append(rm);
    root.append(countdowns(today));

    // Month grid.
    root.append(monthGrid(today));
    root.append(dayDetails(picked));
    root.append(settings());
    root.append(el('p', 'credit', T('الأحاديث من صحيح البخاري ومسلم والسنن (بترقيم محمد فؤاد عبد الباقي وأحكام الألباني)، منقولة من مجموعات الحديث المفتوحة (github.com/fawazahmed0/hadith-api). التاريخ حسب تقويم أم القرى، وقد يختلف يوماً عن رؤية الهلال في بلدك؛ عدّله من الإعدادات.')));
  }
  // ---- Ramadan: suhoor and iftar times, the fasts of the month, the timetable ----
  function ramadanStart(today) {
    const h = hijri(today);
    if (h.m === 9) return plusDays(today, 1 - h.d);
    for (let n = 1; n < 400; n++) { const d = plusDays(today, n), x = hijri(d); if (x.m === 9 && x.d === 1) return d; }
    return null;
  }
  function ramadanDays(start) {
    const out = [];
    for (let n = 0; n < 30; n++) { const d = plusDays(start, n); if (hijri(d).m !== 9) break; out.push(d); }
    return out;
  }
  let tick = 0;
  function ramadanCard(today) {
    const h = hijri(today);
    const soon = h.m === 8 && h.d >= 15;
    if (h.m !== 9 && !soon) return null;
    const box = el('section', 'rm-card');
    box.append(el('h3', '', h.m === 9 ? `${T('رمضان')} · ${T('اليوم')} ${I.num(h.d)}` : T('رمضان على الأبواب')));
    const tt = times(today);
    if (h.m === 9 && tt) {
      const row = el('div', 'rm-times');
      const cell = (label, hrs) => { const c = el('div', 'rm-time'); const cd = el('small', 'rm-cd'); cd.dataset.at = String(at(tt.mid, hrs)); c.append(el('span', '', T(label)), el('b', '', window.noonAstro.snapshot(Date.now()).fmtHM(hrs)), cd); return c; };
      row.append(cell('الإمساك (الفجر)', tt.fajr), cell('الإفطار (المغرب)', tt.maghrib));
      box.append(row);
      clearInterval(tick);
      const upd = () => box.querySelectorAll('.rm-cd').forEach((c) => {
        const ms = Number(c.dataset.at) - Date.now();
        c.textContent = ms > 0 ? `${T('بعد')} ${I.dur(Math.floor(ms / 3600e3), Math.floor((ms % 3600e3) / 60000))}` : T('مضى');
      });
      upd(); tick = setInterval(() => { if (!box.isConnected) clearInterval(tick); else upd(); }, 30000);
    }
    const X = window.NOON_EXTRAS && window.NOON_EXTRAS.texts;
    const quote = (id) => { const t = X && X[id]; if (!t) return el('span'); const q = el('blockquote', 'cal-hadith'); const a = el('p', 'cal-hadith-ar', t.ar); a.lang = 'ar'; a.dir = 'rtl'; q.append(a, el('cite', '', I.isEn ? `${t.en} — ${t.refEn}` : t.refAr)); return q; };
    if (h.m === 9) {
      box.append(el('p', 'hint', T('دعاء الإفطار:')), quote('iftar'));
      if (h.d >= 20) box.append(el('p', 'hint', T('في العشر الأواخر:')), quote('qadr'), el('p', 'hint', T('وأخرج زكاة الفطر قبل صلاة العيد.')));
      // Fasts of the month: tap a day to mark it fasted, or missed with an excuse (to make up).
      const start = ramadanStart(today), days = ramadanDays(start);
      const y = String(hijri(start).y);
      const log = (S.ramadan[y] = S.ramadan[y] || {});
      const grid = el('div', 'rm-grid');
      days.forEach((d, k) => {
        const v = log[k + 1];
        const b = button(`rm-day${v ? ` is-${v}` : ''}${d === today ? ' is-today' : ''}`, I.num(k + 1), () => {
          log[k + 1] = !v ? 'fast' : v === 'fast' ? 'excused' : undefined;
          save(); render();
        });
        b.title = T(!v ? 'اضغط: صمتُ' : v === 'fast' ? 'صمتُ' : 'أفطرتُ بعذر (للقضاء)');
        grid.append(b);
      });
      const fasted = Object.values(log).filter((v) => v === 'fast').length, owed = Object.values(log).filter((v) => v === 'excused').length;
      box.append(el('p', 'hint', `${T('صيام الشهر')}: ${I.num(fasted)} ${T('يوماً')}${owed ? ` · ${T('للقضاء')}: ${I.num(owed)}` : ''} ${T('(اضغط اليوم مرة لصمتُ، ومرتين لأفطرتُ بعذر)')}`), grid);
    }
    const acts = el('div', 'salah-links');
    acts.append(button('btn btn-quiet', T('إمساكية رمضان'), () => imsakiya(today)));
    if (window.noonLibrary) acts.append(button('btn btn-quiet', T('حاسبة زكاة الفطر'), () => window.noonLibrary.open('tool', 'zakat')));
    box.append(acts);
    return box;
  }
  function imsakiya(today) {
    const start = ramadanStart(today);
    if (!start) return;
    const days = ramadanDays(start);
    const A = window.noonAstro, snap = A.snapshot(Date.now());
    const rows = days.map((d, k) => { const t = times(d); return [I.num(k + 1), new Date(d).toLocaleDateString(I.locale, { weekday: 'short', day: 'numeric', month: 'short' }), t ? snap.fmtHM(t.fajr) : '', t ? snap.fmtHM(t.maghrib) : '']; });
    const title = `${T('إمساكية رمضان')} ${I.num(hijri(start).y)} · ${snap.place.name}`;
    const tbl = el('table', 'rm-table');
    const hr = el('tr'); [T('اليوم'), T('التاريخ'), T('الإمساك'), T('الإفطار')].forEach((x) => hr.append(el('th', '', x)));
    tbl.append(hr);
    rows.forEach((r) => { const tr = el('tr'); r.forEach((x) => tr.append(el('td', '', x))); tbl.append(tr); });
    const wrap = el('div', 'rm-imsak');
    wrap.append(tbl);
    if (window.noonCard) {
      window.noonCard.show({ kicker: T('رمضان كريم'), title, body: '', actions: [] });
      const card = document.querySelector('.rc-card');
      if (card) { card.querySelector('.rc-acts').remove(); card.append(wrap, button('btn btn-primary', T('مشاركة كصورة'), () => shareTable(title, rows))); }
    }
  }
  // The timetable as an image, drawn on a canvas.
  async function shareTable(title, rows) {
    const W = 1080, rowH = 44, H = 260 + rows.length * rowH + 120;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const c = cv.getContext('2d');
    const g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#14213D'); g.addColorStop(1, '#0B1426');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.strokeStyle = '#D4AF37'; c.lineWidth = 5; c.strokeRect(30, 30, W - 60, H - 60);
    c.textAlign = 'center'; c.direction = I.isEn ? 'ltr' : 'rtl';
    c.fillStyle = '#F2D58A'; c.font = '700 48px "IBM Plex Sans Arabic", sans-serif'; c.fillText(title, W / 2, 130);
    const cols = I.isEn ? [150, 420, 700, 930] : [930, 660, 380, 150];
    c.font = '600 30px "IBM Plex Sans Arabic", sans-serif'; c.fillStyle = 'rgba(247,241,225,0.7)';
    [T('اليوم'), T('التاريخ'), T('الإمساك'), T('الإفطار')].forEach((x, k) => c.fillText(x, cols[k], 210));
    c.font = '500 30px "IBM Plex Sans Arabic", sans-serif';
    rows.forEach((r, i) => {
      const y = 260 + i * rowH;
      if (i % 2) { c.fillStyle = 'rgba(255,255,255,0.05)'; c.fillRect(50, y - 30, W - 100, rowH); }
      c.fillStyle = '#F7F1E1';
      r.forEach((x, k) => c.fillText(x, cols[k], y));
    });
    c.fillStyle = '#D4AF37'; c.font = '600 24px "IBM Plex Sans Arabic", sans-serif'; c.fillText('Muslim Activity', W / 2, H - 60);
    const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
    const name = 'imsakiya.png';
    const C = window.Capacitor, P = C && C.isNativePlatform && C.isNativePlatform() && C.Plugins;
    try {
      if (P && P.Filesystem && P.Share) {
        const f = await P.Filesystem.writeFile({ path: name, data: cv.toDataURL('image/png').split(',')[1], directory: 'CACHE' });
        await P.Share.share({ title, files: [f.uri] });
        return;
      }
      const file = new File([blob], name, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title }); return; }
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); a.remove();
    } catch (_) { /* cancelled */ }
  }

  function tag(id, when) {
    const t = el('button', `cal-tag is-${kind(id)}`);
    t.type = 'button';
    t.append(el('small', '', when), el('span', '', title(id)));
    t.addEventListener('click', () => {
      picked = when === T('غداً') ? plusDays(midnight(Date.now()), 1) : midnight(Date.now());
      render();
      const d = root.querySelector('.cal-details');
      if (d) d.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
    return t;
  }

  function countdowns(today) {
    const wrap = el('div', 'cal-count');
    const targets = [
      ['رمضان', 'Ramadan', 9, 1], ['عيد الفطر', 'Eid al-Fitr', 10, 1], ['يوم عرفة', 'Day of Arafah', 12, 9],
      ['عيد الأضحى', 'Eid al-Adha', 12, 10], ['رأس السنة الهجرية', 'Islamic New Year', 1, 1], ['عاشوراء', 'Ashura', 1, 10]
    ];
    const found = [];
    for (let n = 0; n < 400 && found.length < targets.length; n++) {
      const day = plusDays(today, n), h = hijri(day);
      targets.forEach((t) => { if (h.m === t[2] && h.d === t[3] && !found.some((f) => f.t === t)) found.push({ t, n, day }); });
    }
    found.sort((a, b) => a.n - b.n).slice(0, 3).forEach(({ t, n, day }) => {
      const c = el('div', 'cal-cd');
      c.append(el('b', '', n === 0 ? T('اليوم') : `${I.num(n)}`), el('small', '', n === 0 ? '' : T(n === 1 ? 'يوم' : 'يوماً')),
        el('span', '', I.isEn ? t[1] : t[0]), el('small', 'cal-cd-date', gregText(day, { day: 'numeric', month: 'short' })));
      wrap.append(c);
    });
    return wrap;
  }

  function monthGrid(today) {
    const box = el('div', 'cal-month');
    const h0 = hijri(shown);
    const nav = el('div', 'cal-nav');
    const prev = button('cal-arrow', I.isEn ? '‹' : '›', () => { shown = monthStart(plusDays(shown, -2)); render(); }, T('الشهر السابق'));
    const next = button('cal-arrow', I.isEn ? '›' : '‹', () => { shown = monthStart(plusDays(shown, 31)); render(); }, T('الشهر التالي'));
    const len = (() => { let n = 29; while (n < 31 && hijri(plusDays(shown, n)).m === h0.m) n++; return n; })();
    const label = el('div', 'cal-title');
    label.append(el('b', '', `${monthName(h0.m)} ${I.num(h0.y)}`),
      el('small', '', `${gregText(shown, { day: 'numeric', month: 'short' })} – ${gregText(plusDays(shown, len - 1), { day: 'numeric', month: 'short', year: 'numeric' })}`));
    nav.append(prev, label, next);
    if (shown !== monthStart(today)) nav.append(button('link-btn', T('اليوم'), () => { shown = monthStart(today); picked = today; render(); }));
    box.append(nav);
    const grid = el('div', 'cal-grid');
    const first = I.isEn ? 0 : 6; // week starts on Sunday in English, Saturday in Arabic
    const WD = I.isEn ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] : ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];
    for (let k = 0; k < 7; k++) grid.append(el('span', 'cal-wd', WD[(first + k) % 7]));
    const lead = (new Date(shown).getDay() - first + 7) % 7;
    for (let k = 0; k < lead; k++) grid.append(el('span', 'cal-pad'));
    for (let n = 0; n < len; n++) {
      const day = plusDays(shown, n);
      const ids = eventsOn(day).filter((id) => id !== 'friday');
      const kinds = [...new Set(ids.map(kind))];
      const cell = button(`cal-day${day === today ? ' is-today' : ''}${day === picked ? ' is-picked' : ''}`, '', () => { picked = day; render(); });
      cell.append(el('b', '', I.num(hijri(day).d)), el('small', '', I.num(new Date(day).getDate())));
      const dots = el('span', 'cal-dots');
      kinds.forEach((k) => dots.append(el('i', `is-${k}`)));
      cell.append(dots);
      cell.setAttribute('aria-label', `${hijriText(hijri(day))}، ${gregText(day)}${ids.length ? '، ' + ids.map(title).join('، ') : ''}`);
      grid.append(cell);
    }
    box.append(grid);
    const legend = el('div', 'cal-legend');
    [['fast', 'صيام مستحب'], ['season', 'موسم طاعة'], ['nofast', 'لا يُصام']].forEach(([k, l]) => {
      const s = el('span'); s.append(el('i', `is-${k}`), T(l)); legend.append(s);
    });
    box.append(legend);
    return box;
  }

  function dayDetails(day) {
    const box = el('div', 'cal-details');
    box.append(el('h3', '', `${hijriText(hijri(day), true)} · ${gregText(day)}`));
    const ids = eventsOn(day);
    if (!ids.length) { box.append(el('p', 'hint', T('لا صيام مخصوص ولا مناسبة في هذا اليوم.'))); return box; }
    ids.forEach((id) => {
      const item = el('div', `cal-ev is-${kind(id)}`);
      item.append(el('b', '', title(id)));
      INFO[id][3].forEach((tid) => {
        const t = TX[tid];
        if (!t) return;
        const q = el('blockquote', 'cal-hadith');
        const a = el('p', 'cal-hadith-ar', t.ar); a.lang = 'ar'; a.dir = 'rtl';
        const e = el('p', 'cal-hadith-en', t.en); e.lang = 'en'; e.dir = 'ltr';
        q.append(...(I.isEn ? [e, a] : [a, e]), el('cite', '', I.isEn ? t.refEn : t.refAr));
        item.append(q);
      });
      if (id === 'white' && hijri(day).m === 12) item.append(el('p', 'hint', T('الثالث عشر من ذي الحجة من أيام التشريق فلا يُصام.')));
      if (id === 'friday' && window.noonQuran) item.append(button('btn btn-quiet', T('اقرأ سورة الكهف'), () => window.noonQuran.openSurah(18)));
      box.append(item);
    });
    return box;
  }

  function settings() {
    const box = el('details', 'cal-settings');
    box.open = !!render.settingsOpen;
    box.addEventListener('toggle', () => { render.settingsOpen = box.open; });
    box.append(el('summary', '', T('التنبيهات والإعدادات')));
    const row = (label, input) => { const l = el('label', 'check'); l.append(input, ' ', T(label)); return l; };
    const check = (k, label) => {
      const c = el('input'); c.type = 'checkbox'; c.checked = !!S[k];
      c.addEventListener('change', () => { S[k] = c.checked; save(); });
      return row(label, c);
    };
    const timeSel = (k, from, to) => {
      const s = el('select');
      for (let h = from; h <= to; h += 0.5) {
        const v = `${String(Math.floor(h)).padStart(2, '0')}:${h % 1 ? '30' : '00'}`;
        const d = new Date(2024, 0, 1, Math.floor(h), h % 1 ? 30 : 0);
        s.append(new Option(d.toLocaleTimeString(I.locale, { hour: 'numeric', minute: '2-digit' }), v));
      }
      s.value = S[k];
      s.addEventListener('change', () => { S[k] = s.value; save(); });
      return s;
    };
    const grid = el('div', 'cal-set-grid');
    grid.append(
      check('fast', 'تذكير بصيام الاثنين والخميس'),
      check('white', 'تذكير بالأيام البيض (١٣ و١٤ و١٥ من كل شهر هجري)'),
      check('seasons', 'تذكير بالمواسم: رمضان، العشر الأواخر، عشر ذي الحجة، عرفة، العيدين، عاشوراء، الست من شوّال'),
      check('friday', 'تذكير يوم الجمعة بسورة الكهف والصلاة على النبي ﷺ'),
      check('adhkar', 'تذكير بأذكار الصباح (بعد الفجر) والمساء (بعد العصر)'),
      check('wird', 'تذكير يومي بورد القرآن'),
      check('suhoor', 'في رمضان: تذكير بالسحور قبل الفجر بـ٤٥ دقيقة'),
      check('daily', 'آية اليوم كل صباح'));
    box.append(grid);
    const f1 = el('label', 'field'); f1.append(el('span', '', T('وقت تذكير الصيام (مساء اليوم السابق)')), timeSel('time', 17, 23.5));
    const f2 = el('label', 'field'); f2.append(el('span', '', T('وقت تذكير الورد')), timeSel('wirdTime', 5, 23.5));
    const adj = el('select');
    [[-2, '−٢ يوم'], [-1, '−١ يوم'], [0, 'بدون تعديل'], [1, '+١ يوم'], [2, '+٢ يوم']].forEach(([v, l]) => adj.append(new Option(T(l), String(v))));
    adj.value = String(S.adj);
    adj.addEventListener('change', () => { S.adj = Number(adj.value); hcache.clear(); shown = null; save(); render(); });
    const f3 = el('label', 'field'); f3.append(el('span', '', T('تعديل التاريخ الهجري')), adj);
    const fields = el('div', 'cal-set-fields'); fields.append(f1, f2, f3);
    box.append(fields);
    if (window.noonCard) {
      const looks = el('div', 'rc-looks');
      looks.append(el('span', 'hint', T('شكل كروت التذكير')));
      window.noonCard.themes.forEach(([k, ar, en]) => {
        const b = button(`rc-look`, I.isEn ? en : ar, () => {
          window.noonCard.setTheme(k);
          looks.querySelectorAll('.rc-look').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
          window.noonCard.show({ title: title('monday'), body: brief('monday'), ref: refOf('monday'), kicker: T('معاينة') });
        });
        b.dataset.theme = k;
        b.setAttribute('aria-pressed', String(window.noonCard.theme() === k));
        looks.append(b);
      });
      box.append(looks);
    }
    if (!native() && 'Notification' in window) {
      const c = el('input'); c.type = 'checkbox'; c.checked = S.notify && Notification.permission === 'granted';
      c.addEventListener('change', async () => {
        if (c.checked && Notification.permission !== 'granted') {
          let p = 'denied';
          try { p = await Notification.requestPermission(); } catch (_) {}
          if (p !== 'granted') { c.checked = false; toast(T('المتصفح لم يسمح بالإشعارات. يمكنك السماح بها من إعدادات الموقع في المتصفح.')); }
        }
        S.notify = c.checked; save();
      });
      box.append(row('إشعارات المتصفح (تعمل والصفحة مفتوحة؛ ثبّت تطبيق أندرويد لتصلك والتطبيق مغلق)', c));
    }
    return box;
  }

  // ---- a one-line note on the tasks view when today or tomorrow holds something ----
  function strip() {
    const box = $('sunnahStrip');
    if (!box) return;
    const today = midnight(Date.now());
    // Month-long seasons are named on their first day only.
    const firstDay = { shawwal: 2, dhulhijja: 1, ramadan: 1, lastTen: 21 };
    const now = eventsOn(today).filter((id) => !(id in firstDay) || firstDay[id] === hijri(today).d);
    const tom = eventsOn(plusDays(today, 1)).filter((id) => kind(id) === 'fast' || kind(id) === 'nofast');
    const h = hijri(today);
    box.replaceChildren();
    box.append(el('b', 'strip-date', hijriText(h, false)));
    const txt = [];
    if (now.length) txt.push(`${T('اليوم')}: ${now.map(title).join(' · ')}`);
    if (tom.length) txt.push(`${T('غداً')}: ${tom.map(title).join(' · ')}`);
    box.append(el('span', 'strip-text', txt.join(' — ') || T('التقويم الهجري والمواسم')));
    box.hidden = false;
  }
  $('sunnahStrip') && $('sunnahStrip').addEventListener('click', () => window.noonUI.go('calendar'));

  onRemote(KEY, () => { S = Object.assign(defaults(), load(KEY, {})); hcache.clear(); if (!root.hidden) render(); strip(); window.dispatchEvent(new CustomEvent('noon-sunnah')); });
  window.addEventListener('noon-view', (ev) => { if (ev.detail.view === 'calendar') { picked = null; render(); } });
  let lastDay = dayKey();
  setInterval(() => {
    check();
    if (lastDay !== dayKey()) { lastDay = dayKey(); shown = null; picked = null; strip(); if (!root.hidden) render(); }
  }, 30000);
  setTimeout(check, 4000);
  window.noonSunnah = { plan, eventsOn, hijri, settings: () => S, verseOfDay: (t) => verseOfDay(t || Date.now()) };
  render();
  strip();
})();
