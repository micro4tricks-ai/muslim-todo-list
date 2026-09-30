// ---------- Tools in the library: zakat, date converter, the names of Allah, istikhara,
// Umrah and Hajj step by step, nearby mosques, and a backup of everything on this device ----------
// Texts come from js/extras-data.js (tools/build_extras.py), cut from their sources.
(() => {
  'use strict';
  const { T, I, el, button, load, store, toast } = window.noonUI;
  const X = window.NOON_EXTRAS || { texts: {}, umrah: [], hajj: [], names: [] };
  const LIST = [
    ['zakat', '٪', 'حاسبة الزكاة', 'Zakat calculator'],
    ['umrah', '🕋', 'دليل العمرة', 'Umrah guide'],
    ['hajj', '⛰', 'دليل الحج', 'Hajj guide'],
    ['names', '✦', 'أسماء الله الحسنى', 'The Names of Allah'],
    ['istikhara', '🤲', 'صلاة الاستخارة', 'Istikhara prayer'],
    ['mosques', '🕌', 'المساجد القريبة', 'Nearby mosques'],
    ['convert', '📅', 'محوّل التاريخ', 'Date converter'],
    ['backup', '💾', 'نسخة احتياطية', 'Backup']
  ];

  function hadith(id) {
    const t = X.texts[id];
    if (!t) return el('span');
    const q = el('blockquote', 'cal-hadith');
    const a = el('p', 'cal-hadith-ar', t.ar); a.lang = 'ar'; a.dir = 'rtl';
    const e = el('p', 'cal-hadith-en', t.en); e.lang = 'en'; e.dir = 'ltr';
    q.append(...(I.isEn ? [e, a] : [a, e]), el('cite', '', I.isEn ? t.refEn : t.refAr));
    return q;
  }
  function head(root, backBtn, title, sub) {
    const h = el('div', 'view-head');
    h.append(backBtn, el('h2', '', T(title)));
    root.append(h);
    if (sub) root.append(el('p', 'hint', T(sub)));
  }
  const num = (v) => { const n = Number(String(v || '').replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[٬,]/g, '')); return Number.isFinite(n) ? n : 0; };
  const money = (v) => v.toLocaleString(I.isEn ? 'en-GB' : 'ar-EG', { maximumFractionDigits: 2 });

  // ---- zakat ----
  const ZKEY = 'noon-sweep-zakat';
  function zakat(root, backBtn) {
    head(root, backBtn, 'حاسبة الزكاة', 'زكاة المال ربع العشر (٢٫٥٪) إذا بلغ النصاب وحال عليه الحول القمري. اكتب المبالغ بعملتك.');
    const Z = Object.assign({ gold: '', silver: '', basis: 'gold', karat: '24', cash: '', goldG: '', goldK: '21', silverG: '', trade: '', debtsIn: '', debtsOut: '', jewelry: '', jewelryOn: false, people: '1', sa: '' }, load(ZKEY, {}));
    const box = el('div', 'zk');
    const field = (key, label, hint) => {
      const f = el('label', 'field');
      const i = el('input'); i.inputMode = 'decimal'; i.value = Z[key]; i.placeholder = '0';
      i.addEventListener('input', () => { Z[key] = i.value; store(ZKEY, Z); calc(); });
      f.append(el('span', '', T(label)), i);
      if (hint) f.append(el('small', 'hint', T(hint)));
      return f;
    };
    const select = (key, label, opts) => {
      const f = el('label', 'field');
      const s = el('select');
      opts.forEach(([v, t]) => s.append(new Option(T(t), v)));
      s.value = Z[key];
      s.addEventListener('change', () => { Z[key] = s.value; store(ZKEY, Z); calc(); });
      f.append(el('span', '', T(label)), s);
      return f;
    };
    const g1 = el('fieldset', 'zk-group'); g1.append(el('legend', '', T('الأسعار والنصاب')),
      field('gold', 'سعر جرام الذهب (عيار ٢٤)'), field('silver', 'سعر جرام الفضة الخالصة'),
      select('basis', 'حساب النصاب على', [['gold', 'الذهب: ٨٥ جراماً'], ['silver', 'الفضة: ٥٩٥ جراماً']]));
    const g2 = el('fieldset', 'zk-group'); g2.append(el('legend', '', T('ما تملكه')),
      field('cash', 'النقود والأرصدة في البنوك'), field('goldG', 'ذهب للادخار (جرامات)'),
      select('goldK', 'عيار هذا الذهب', [['24', 'عيار ٢٤'], ['22', 'عيار ٢٢'], ['21', 'عيار ٢١'], ['18', 'عيار ١٨']]),
      field('silverG', 'فضة (جرامات)'), field('trade', 'قيمة عروض التجارة والأسهم المعدّة للبيع'),
      field('debtsIn', 'ديون لك مرجوّة السداد'), field('debtsOut', 'ديون عليك حالّة الآن'));
    const jw = el('fieldset', 'zk-group');
    const on = el('input'); on.type = 'checkbox'; on.checked = Z.jewelryOn;
    on.addEventListener('change', () => { Z.jewelryOn = on.checked; store(ZKEY, Z); calc(); });
    const lab = el('label', 'check'); lab.append(on, ' ', T('أُدخل الحُلي المستعمل في الحساب'));
    jw.append(el('legend', '', T('الحُلي المستعمل')), lab, field('jewelry', 'قيمة الحُلي المستعمل', 'اختلف العلماء في زكاة الحُلي المعدّ للاستعمال؛ فعّلها إن كنت تأخذ بالقول بوجوبها.'));
    const out = el('div', 'zk-result');
    box.append(g1, g2, jw, out);
    root.append(box);
    // Zakat al-fitr.
    const fitr = el('fieldset', 'zk-group');
    const fOut = el('p', 'zk-fitr');
    fitr.append(el('legend', '', T('زكاة الفطر')), field('people', 'عدد الأفراد'), field('sa', 'ثمن صاع من قوت البلد (نحو ٢٫٥–٣ كجم)'), fOut, hadith('fitr'));
    root.append(fitr, el('h3', 'lib-h', T('الدليل')), hadith('nisab'), hadith('rate'),
      el('p', 'hint', T('الحاسبة تقريبية للمسائل المشهورة. في الحالات الخاصة (الشركات، الأراضي، الديون المشكوك فيها) اسأل أهل العلم.')));
    function calc() {
      const g24 = num(Z.gold), ag = num(Z.silver);
      const nisab = Z.basis === 'silver' ? 595 * ag : 85 * g24;
      const total = num(Z.cash) + num(Z.goldG) * (num(Z.goldK) / 24) * g24 + num(Z.silverG) * ag + num(Z.trade) + num(Z.debtsIn)
        + (Z.jewelryOn ? num(Z.jewelry) : 0) - num(Z.debtsOut);
      out.replaceChildren();
      if (!nisab) { out.append(el('p', 'hint', T('اكتب سعر جرام الذهب (أو الفضة) ليُحسب النصاب.'))); }
      else {
        out.append(el('p', '', `${T('النصاب')}: ${money(nisab)} · ${T('المجموع الخاضع للزكاة')}: ${money(Math.max(0, total))}`));
        if (total >= nisab) out.append(el('p', 'zk-due', `${T('الزكاة الواجبة')}: ${money(total * 0.025)}`), el('p', 'hint', T('إن مرّ على بلوغ المال النصاب حولٌ قمري كامل.')));
        else out.append(el('p', 'zk-none', T('المال لم يبلغ النصاب، فلا زكاة فيه.')));
      }
      const people = num(Z.people), sa = num(Z.sa);
      fOut.textContent = sa ? `${T('زكاة الفطر عن')} ${I.num(people || 1)}: ${money((people || 1) * sa)}` : T('اكتب ثمن الصاع لتحسب زكاة الفطر.');
    }
    calc();
  }

  // ---- steps (Umrah, Hajj) ----
  function steps(root, backBtn, list, title, sub, intro) {
    head(root, backBtn, title, sub);
    if (intro) root.append(hadith(intro));
    const ol = el('ol', 'salah-steps');
    list.forEach((st) => {
      const li = el('li', 'salah-step');
      li.append(el('h3', '', I.isEn ? st.en : st.ar));
      st.hadith.forEach((h) => li.append(hadith(h)));
      ol.append(li);
    });
    root.append(ol);
  }

  // ---- the names of Allah ----
  function names(root, backBtn) {
    head(root, backBtn, 'أسماء الله الحسنى');
    root.append(hadith('names'), el('p', 'hint', T('سرد الأسماء بأعيانها ورد في رواية الترمذي (٣٥٠٧) وضعّفها كثير من أهل العلم؛ والقائمة هنا هي القائمة المشهورة، والثابت أصل الحديث في الصحيحين.')));
    const grid = el('div', 'names-grid');
    X.names.forEach((n) => {
      const c = el('div', 'name-card');
      const a = el('b', '', n.ar); a.lang = 'ar';
      c.append(el('small', '', I.num(n.n)), a, el('span', 'name-tr', n.tr), el('span', 'name-en', n.en));
      grid.append(c);
    });
    root.append(grid, el('p', 'credit', T('الأسماء والمعاني الإنجليزية من api.aladhan.com.')));
  }

  // ---- istikhara ----
  function istikhara(root, backBtn) {
    head(root, backBtn, 'صلاة الاستخارة', 'إذا همّ المسلم بأمر مباح: يصلي ركعتين من غير الفريضة، ثم يدعو بهذا الدعاء ويسمّي حاجته.');
    root.append(hadith('istikhara'));
    const t = X.texts.istikhara;
    if (t) root.append(button('btn btn-quiet', T('نسخ الدعاء'), async () => { try { await navigator.clipboard.writeText(t.ar); toast(T('نُسخ.')); } catch (_) { toast(T('تعذّر النسخ.')); } }));
  }

  // ---- nearby mosques (OpenStreetMap) ----
  function mosques(root, backBtn) {
    head(root, backBtn, 'المساجد القريبة', 'من خرائط OpenStreetMap المفتوحة؛ قد لا تكون كل المساجد مسجّلة فيها.');
    const bar = el('div', 'lib-bar');
    const radius = el('select');
    [[1000, '١ كم'], [3000, '٣ كم'], [5000, '٥ كم'], [10000, '١٠ كم']].forEach(([v, t]) => radius.append(new Option(T(t), String(v))));
    radius.value = '3000';
    const list = el('div', 'lib-list');
    const run = (lat, lon) => find(lat, lon, Number(radius.value), list);
    const here = button('btn btn-primary', T('ابحث حول موقعي الحالي'), () => {
      if (!navigator.geolocation) { toast(T('المتصفح لا يدعم تحديد الموقع.')); return; }
      list.replaceChildren(el('p', 'hint', T('جارٍ تحديد موقعك…')));
      navigator.geolocation.getCurrentPosition((p) => run(p.coords.latitude, p.coords.longitude),
        () => list.replaceChildren(el('p', 'hint', T('تعذّر الوصول إلى موقعك. جرّب البحث حول المدينة المختارة.'))), { timeout: 15000, maximumAge: 300000 });
    });
    const city = button('btn btn-quiet', T('حول المدينة المختارة'), () => {
      const p = window.noonAstro && window.noonAstro.snapshot(Date.now()).place;
      if (p) run(p.lat, p.lon);
    });
    const r = el('label', 'field'); r.append(el('span', '', T('المسافة')), radius);
    bar.append(here, city, r);
    root.append(bar, list, el('p', 'credit', '© OpenStreetMap contributors (ODbL)'));
  }
  async function find(lat, lon, radius, list) {
    list.replaceChildren(el('p', 'hint', T('جارٍ البحث…')));
    const q = `[out:json][timeout:25];(nwr["amenity"="place_of_worship"]["religion"="muslim"](around:${radius},${lat},${lon}););out center 80;`;
    // A map search always works, whatever happens to the OpenStreetMap servers.
    const maps = el('a', 'btn btn-quiet', T('ابحث عن المساجد في خرائط جوجل'));
    maps.href = `https://www.google.com/maps/search/${encodeURIComponent(I.isEn ? 'mosque' : 'مسجد')}/@${lat},${lon},15z`;
    maps.target = '_blank'; maps.rel = 'noopener';
    try {
      const j = await overpass(q);
      const R = Math.PI / 180;
      const dist = (a, b) => { const x = (b.lon - a.lon) * R * Math.cos(((a.lat + b.lat) / 2) * R), y = (b.lat - a.lat) * R; return Math.sqrt(x * x + y * y) * 6371000; };
      const items = j.elements.map((e) => {
        const p = e.center || { lat: e.lat, lon: e.lon };
        return { name: (e.tags && (I.isEn ? e.tags['name:en'] || e.tags.name : e.tags['name:ar'] || e.tags.name)) || T('مسجد'), lat: p.lat, lon: p.lon, d: dist({ lat, lon }, p) };
      }).filter((x) => Number.isFinite(x.lat)).sort((a, b) => a.d - b.d);
      list.replaceChildren(maps, el('p', 'view-sub', items.length ? `${I.num(items.length)} ${T('مسجداً')}` : T('لم نجد مساجد مسجّلة في هذه المسافة. جرّب مسافة أكبر.')));
      items.forEach((m) => {
        const row = el('div', 'q-mark');
        const info = el('div', 'q-mark-open');
        info.append(el('b', '', m.name), el('span', '', m.d < 1000 ? `${I.num(Math.round(m.d))} ${T('متر')}` : `${I.num((m.d / 1000).toFixed(1))} ${T('كم')}`));
        const a = el('a', 'btn btn-quiet', T('الطريق'));
        a.href = `https://www.google.com/maps/dir/?api=1&destination=${m.lat},${m.lon}`;
        a.target = '_blank'; a.rel = 'noopener';
        row.append(info, a);
        list.append(row);
      });
    } catch (_) {
      list.replaceChildren(el('p', 'hint', T('خوادم الخرائط المفتوحة لا تستجيب الآن. استخدم خرائط جوجل أو حاول لاحقاً.')), maps);
    }
  }
  // The public Overpass servers are often busy: try them in turn, 20 seconds each.
  async function overpass(q) {
    // The public servers are often busy: ask them all at once and take the first answer.
    const servers = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter',
      'https://overpass.private.coffee/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 40000);
    try {
      return await Promise.any(servers.map(async (url) => {
        const r = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: ctl.signal });
        if (!r.ok) throw new Error(r.status);
        return r.json();
      }));
    } catch (_) {
      throw new Error('no server');
    } finally { clearTimeout(timer); ctl.abort(); }
  }

  // ---- date converter ----
  function convert(root, backBtn) {
    head(root, backBtn, 'محوّل التاريخ', 'حسب تقويم أم القرى، مع تعديل اليوم المختار في التقويم.');
    const S = window.noonSunnah;
    const MONTHS = I.isEn ? ['Muharram', 'Safar', 'Rabi‘ I', 'Rabi‘ II', 'Jumada I', 'Jumada II', 'Rajab', 'Sha‘ban', 'Ramadan', 'Shawwal', 'Dhu al-Qa‘dah', 'Dhu al-Hijjah']
      : ['محرّم', 'صفر', 'ربيع الأول', 'ربيع الآخر', 'جمادى الأولى', 'جمادى الآخرة', 'رجب', 'شعبان', 'رمضان', 'شوّال', 'ذو القعدة', 'ذو الحجة'];
    const g = el('div', 'zk-group');
    const gi = el('input'); gi.type = 'date'; gi.valueAsDate = new Date();
    const gOut = el('p', 'conv-out');
    const toH = () => {
      if (!gi.value || !S) return;
      const [y, m, d] = gi.value.split('-').map(Number);
      const h = S.hijri(new Date(y, m - 1, d).getTime());
      gOut.textContent = `${I.num(h.d)} ${MONTHS[h.m - 1]} ${I.num(h.y)} ${T('هـ')}`;
    };
    gi.addEventListener('change', toH);
    const gl = el('label', 'field'); gl.append(el('span', '', T('من ميلادي إلى هجري')), gi);
    g.append(gl, gOut);
    const h = el('div', 'zk-group');
    const hd = el('input'); hd.inputMode = 'numeric'; hd.placeholder = T('اليوم');
    const hm = el('select'); MONTHS.forEach((n, k) => hm.append(new Option(n, String(k + 1))));
    const hy = el('input'); hy.inputMode = 'numeric'; hy.placeholder = T('السنة');
    const hOut = el('p', 'conv-out');
    const now = S ? S.hijri(new Date().setHours(0, 0, 0, 0)) : { d: 1, m: 1, y: 1448 };
    hd.value = String(now.d); hm.value = String(now.m); hy.value = String(now.y);
    const toG = () => {
      const D = num(hd.value), Mo = num(hm.value), Y = num(hy.value);
      if (!S || !D || !Y) return;
      // Start near the date (a Hijri year is about 354.37 days) and look around it.
      const guess = Date.UTC(622, 6, 16) + ((Y - 1) * 354.367 + (Mo - 1) * 29.53 + D - 1) * 864e5;
      for (let k = -45; k <= 45; k++) {
        const t = new Date(guess + k * 864e5); t.setHours(0, 0, 0, 0);
        const x = S.hijri(t.getTime());
        if (x.y === Y && x.m === Mo && x.d === D) { hOut.textContent = t.toLocaleDateString(I.locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); return; }
      }
      hOut.textContent = T('تاريخ غير صحيح أو خارج مدى التقويم.');
    };
    [hd, hm, hy].forEach((x) => x.addEventListener('input', toG));
    const row = el('div', 'conv-row'); row.append(hd, hm, hy);
    h.append(el('span', 'field', T('من هجري إلى ميلادي')), row, hOut);
    root.append(g, h);
    toH(); toG();
  }

  // ---- backup ----
  function backup(root, backBtn) {
    head(root, backBtn, 'نسخة احتياطية', 'احفظ مهامك وإعداداتك وقراءتك في ملف، واسترجعها على أي جهاز من غير حساب.');
    const keys = () => Object.keys(localStorage).filter((k) => k.startsWith('noon-') && k !== 'noon-sweep-auth');
    const save = button('btn btn-primary', T('حفظ نسخة احتياطية'), async () => {
      const data = { app: 'muslim-todo-list', v: 1, at: new Date().toISOString(), items: {} };
      keys().forEach((k) => { data.items[k] = localStorage.getItem(k); });
      const text = JSON.stringify(data);
      const name = `muslim-todo-backup-${new Date().toISOString().slice(0, 10)}.json`;
      const C = window.Capacitor, P = C && C.isNativePlatform && C.isNativePlatform() && C.Plugins;
      try {
        if (P && P.Filesystem && P.Share) {
          const f = await P.Filesystem.writeFile({ path: name, data: text, directory: 'CACHE', encoding: 'utf8' });
          await P.Share.share({ title: name, files: [f.uri] });
          return;
        }
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = name;
        document.body.append(a); a.click(); a.remove();
        toast(T('حُفظت النسخة في التنزيلات.'));
      } catch (_) { toast(T('تعذّر حفظ النسخة.')); }
    });
    const file = el('input'); file.type = 'file'; file.accept = 'application/json,.json'; file.hidden = true;
    let armed = false;
    const restore = button('btn btn-quiet', T('استرجاع من ملف'), () => file.click());
    file.addEventListener('change', async () => {
      const f = file.files[0];
      if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        if (data.app !== 'muslim-todo-list' || !data.items) throw new Error('bad');
        if (!armed) { armed = true; toast(T('سيُستبدل ما على هذا الجهاز بما في الملف. اختر الملف مرة أخرى للتأكيد.')); file.value = ''; return; }
        Object.entries(data.items).forEach(([k, v]) => { if (k.startsWith('noon-') && k !== 'noon-sweep-auth') localStorage.setItem(k, v); });
        toast(T('تم الاسترجاع. سيُعاد فتح الصفحة.'));
        setTimeout(() => location.reload(), 1200);
      } catch (_) { toast(T('هذا الملف ليس نسخة احتياطية صحيحة.')); }
      file.value = '';
    });
    const row = el('div', 'salah-links'); row.append(save, restore, file);
    root.append(row, el('p', 'hint', `${T('عدد العناصر المحفوظة على هذا الجهاز')}: ${I.num(keys().length)}`));
  }

  function render(name, root, backBtn) {
    root.replaceChildren();
    if (name === 'zakat') return zakat(root, backBtn);
    if (name === 'umrah') return steps(root, backBtn, X.umrah, 'دليل العمرة', 'خطوات العمرة كما وردت في السنة، بأدلتها.', 'umrahVirtue');
    if (name === 'hajj') return steps(root, backBtn, X.hajj, 'دليل الحج', 'أعمال أيام الحج من صفة حجة النبي ﷺ كما رواها جابر رضي الله عنه في صحيح مسلم، وتسبقها أعمال العمرة للمتمتّع.', 'umrahVirtue');
    if (name === 'names') return names(root, backBtn);
    if (name === 'istikhara') return istikhara(root, backBtn);
    if (name === 'mosques') return mosques(root, backBtn);
    if (name === 'convert') return convert(root, backBtn);
    if (name === 'backup') return backup(root, backBtn);
  }
  window.noonTools = { list: () => LIST, render };
})();
