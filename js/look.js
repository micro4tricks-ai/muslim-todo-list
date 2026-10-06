// ---------- Appearance: page backgrounds, dial colour, case metal ----------
(() => {
  'use strict';
  const KEY = 'noon-sweep-look';
  const IMG_KEY = 'noon-sweep-look-image';
  const $ = (id) => document.getElementById(id);
  const T = window.noonI18n.t;
  const I = window.noonI18n;

  const svg = (w, h, body) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'>${body}</svg>`)}")`;
  const NOISE = svg(220, 220, "<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .1 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/>");
  const MARBLE = svg(900, 900, "<filter id='m'><feTurbulence type='turbulence' baseFrequency='.0035 .011' numOctaves='5' seed='11'/><feColorMatrix values='0 0 0 0 .32  0 0 0 0 .33  0 0 0 0 .36  -2.2 0 0 0 .62'/></filter><rect width='100%' height='100%' filter='url(#m)'/>");
  const STARS = (() => {
    let s = 7, body = '';
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 140; i++) {
      const size = r() < 0.9 ? 0.6 + r() * 0.8 : 1.6 + r();
      body += `<circle cx='${(r() * 900).toFixed(1)}' cy='${(r() * 700).toFixed(1)}' r='${size.toFixed(2)}' fill='white' opacity='${(0.35 + r() * 0.65).toFixed(2)}'/>`;
    }
    return svg(900, 700, body);
  })();
  const GIRIH = svg(96, 96, "<g fill='none' stroke='rgba(255,255,255,0.2)' stroke-width='1.3'><rect x='27' y='27' width='42' height='42'/><rect x='27' y='27' width='42' height='42' transform='rotate(45 48 48)'/><circle cx='48' cy='48' r='10'/><path d='M0 0L27 27M96 0L69 27M0 96L27 69M96 96L69 69M48 0V6M48 90V96M0 48H6M90 48H96'/></g>");

  const BGS = [
    { id: 'mist', ar: 'ضباب الصباح', css: `${NOISE}, linear-gradient(180deg, #ECEEF0, #D3D8DD)` },
    { id: 'dawn', ar: 'فجر', css: `${NOISE}, linear-gradient(160deg, #F7D9C4 0%, #E8B4B8 45%, #A8A5D6 100%)` },
    { id: 'sunset', ar: 'غروب', css: `${NOISE}, linear-gradient(170deg, #FFBE8F 0%, #E0676A 50%, #5B3A70 100%)` },
    { id: 'desert', ar: 'صحراء', css: `${NOISE}, radial-gradient(ellipse at 70% 10%, rgba(255,240,200,0.8), transparent 45%), linear-gradient(175deg, #F3D9A4, #D9A066 60%, #A0623A)` },
    { id: 'sea', ar: 'بحر', css: `${NOISE}, linear-gradient(180deg, #B6E3F2 0%, #3A8FB7 55%, #17476A 100%)` },
    { id: 'forest', ar: 'غابة', css: `${NOISE}, radial-gradient(ellipse at 50% 0%, #7DB08A, #2B5337 60%, #16301F)` },
    { id: 'night', ar: 'ليل ونجوم', css: `${STARS}, radial-gradient(ellipse at 50% 110%, #3A506B, transparent 60%), linear-gradient(180deg, #070B1E, #1C2541)`, size: '900px 700px, auto, auto' },
    { id: 'aurora', ar: 'شفق قطبي', css: `${STARS}, radial-gradient(ellipse at 20% 30%, rgba(80,255,180,0.42), transparent 50%), radial-gradient(ellipse at 80% 15%, rgba(130,110,255,0.4), transparent 55%), linear-gradient(180deg, #06121F, #0E2A3B)`, size: '900px 700px, auto, auto, auto' },
    { id: 'lavender', ar: 'لافندر', css: `${NOISE}, linear-gradient(135deg, #ECE6F6, #C4B5E4)` },
    { id: 'mint', ar: 'نعناع', css: `${NOISE}, linear-gradient(135deg, #E6F5EE, #B8DFCC)` },
    { id: 'rose', ar: 'وردي', css: `${NOISE}, linear-gradient(135deg, #FCE7EB, #EDB2C1)` },
    { id: 'paper', ar: 'ورق', css: `${NOISE}, linear-gradient(180deg, #F5F3EE, #E7E3DA)` },
    { id: 'marble', ar: 'رخام', css: `${MARBLE}, ${NOISE}, linear-gradient(135deg, #F4F3F0, #E3E1DC)`, size: '900px 900px, auto, auto' },
    { id: 'wood', ar: 'خشب', css: `${NOISE}, repeating-linear-gradient(93deg, rgba(0,0,0,0.06) 0 2px, transparent 2px 11px), repeating-linear-gradient(87deg, rgba(255,255,255,0.05) 0 1px, transparent 1px 27px), linear-gradient(180deg, #93613B, #6A4226)` },
    { id: 'concrete', ar: 'خرسانة', css: `${NOISE}, ${NOISE}, radial-gradient(ellipse at 30% 20%, #C9CBC6, #9FA29C)`, size: '220px 220px, 140px 140px, auto' },
    { id: 'girih', ar: 'زخرفة إسلامية', css: `${GIRIH}, radial-gradient(ellipse at 50% 30%, #2A7470, #134341)`, size: '96px 96px, auto' },
    { id: 'charcoal', ar: 'فحمي', css: `${NOISE}, radial-gradient(ellipse at 50% 20%, #3A3F47, #15171B)` }
  ];
  const DIAL_OPTS = [
    ['ceramic', 'سيراميك أبيض', '#F4F4F0'], ['navy', 'أزرق ليلي', '#1E3A5F'], ['emerald', 'أخضر زمردي', '#1E4B39'],
    ['black', 'أسود', '#17191D'], ['salmon', 'سلموني', '#E6B09A'], ['champagne', 'شامبانيا', '#E4D3AC'], ['ice', 'أزرق ثلجي', '#CFE2EE'],
    ['sage', 'أخضر زيتوني فاتح', '#C9D6C3'], ['lavender', 'لافندر', '#D9D2EA'], ['sand', 'رملي', '#E8DCC4'], ['blush', 'وردي فاتح', '#F1D9D6']
  ];
  const METAL_OPTS = [
    ['steel', 'ستانلس ستيل', 'linear-gradient(135deg, #FBFBFC, #9DA2A8 55%, #E6E8EA)'],
    ['gold', 'ذهبي', 'linear-gradient(135deg, #FFF8DC, #B58E3E 55%, #F2DA96)'],
    ['rose', 'ذهبي وردي', 'linear-gradient(135deg, #FFEFE8, #B57A66 55%, #F0C7B6)'],
    ['black', 'أسود مطفي', 'linear-gradient(135deg, #6C727A, #1D2025 55%, #4B5057)']
  ];

  // Interface fonts (fonts/extra.css, chosen in Settings › Fonts). The English font goes first in
  // the stack, so Latin text takes it while Arabic letters and digits fall through to the Arabic one.
  const AR_FONTS = [
    ['plex', 'IBM Plex Sans Arabic', 'بلكس (الافتراضي)'], ['cairo', 'Cairo', 'القاهرة'], ['tajawal', 'Tajawal', 'تجوال'],
    ['almarai', 'Almarai', 'المراعي'], ['kufi', 'Noto Kufi Arabic', 'نوتو كوفي'], ['naskh', 'Noto Naskh Arabic', 'نوتو نسخ'],
    ['readex', 'Readex Pro', 'ريدكس'], ['messiri', 'El Messiri', 'المسيري'], ['amiri', 'Amiri', 'أميري']
  ];
  const EN_FONTS = [
    ['same', '', 'مثل الخط العربي'], ['inter', 'Inter', 'Inter'], ['roboto', 'Roboto', 'Roboto'],
    ['nunito', 'Nunito', 'Nunito'], ['lato', 'Lato', 'Lato'], ['poppins', 'Poppins', 'Poppins']
  ];

  // Clock faces (js/clock.js), the modern face's colour, and what each interactive slot shows.
  const FACE_OPTS = [['classic', 'كلاسيكي'], ['modern', 'حديث'], ['minimal', 'بسيط']];
  // The modern face's themes: background and accent together (light, medium, and dark but not black).
  const THEME_OPTS = [
    ['pearl', 'لؤلؤي وفيروزي', '#F4F6F7', '#DDE5E8', '#0E9AA0'], ['sand', 'رملي ومرجاني', '#F6EEE2', '#E6D5BD', '#D9603B'],
    ['rose', 'وردي وعنابي', '#F8E8EA', '#ECCBD0', '#9C2F4A'], ['ocean', 'أزرق محيطي', '#1F5F86', '#123E5E', '#7FE0F2'],
    ['emerald', 'زمردي ونعناعي', '#1F6150', '#123F34', '#8EF0C4'], ['plum', 'بنفسجي ووردي', '#4A2F6B', '#2E1C47', '#F59AC8'],
    ['graphite', 'رمادي جرافيت', '#3A404B', '#22262E', '#5FD7E0'], ['midnight', 'أزرق ليلي وذهبي', '#25345A', '#141D36', '#E8C064']
  ];
  const SLOT_OPTS = [['prayer', 'الصلاة القادمة'], ['qibla', 'القبلة'], ['radio', 'الإذاعة'], ['sun', 'الشروق والغروب'],
    ['hijri', 'التاريخ الهجري'], ['gdate', 'التاريخ الميلادي'], ['moon', 'القمر'], ['tasbih', 'المسبحة'],
    ['reminder', 'التذكير القادم'], ['focus', 'التركيز'], ['none', 'مخفية']];
  const SLOT_DEFAULTS = { classic: { A: 'prayer' }, minimal: { A: 'prayer', B: 'hijri', C: 'moon', D: 'none' }, modern: { A: 'qibla', B: 'prayer', C: 'sun' } };
  const SLOT_NAMES = { minimal: ['الخانة العلوية', 'الخانة اليمنى', 'الخانة السفلية', 'الخانة اليسرى'] };

  let L = { bg: 'mist', dial: 'ceramic', metal: 'steel', mode: 'auto', scale: 1, fontAr: 'plex', fontEn: 'same', face: 'classic', theme: 'pearl', slots: null };
  try { Object.assign(L, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (_) {}
  let customImage = null;
  try { customImage = localStorage.getItem(IMG_KEY); } catch (_) {}

  // Each face keeps its own slot choices.
  const slotsFor = (face) => Object.assign({}, SLOT_DEFAULTS[face] || SLOT_DEFAULTS.classic, (L.slots || {})[face] || {});
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(L)); } catch (_) {}
  }

  // Colour mode: light, dark, or following the device; and the size of the text.
  const DARK_BGS = ['night', 'aurora', 'girih', 'charcoal', 'forest', 'wood'];
  const darkQuery = matchMedia('(prefers-color-scheme: dark)');
  const isDark = () => L.mode === 'dark' || (L.mode === 'auto' && darkQuery.matches);
  function applyMode() {
    const dark = isDark();
    document.documentElement.dataset.mode = dark ? 'dark' : 'light';
    document.documentElement.style.setProperty('--ui-scale', String(L.scale || 1));
    applyFont();
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = dark ? '#121417' : '#EFEFEC';
    applyBackground();
  }
  darkQuery.addEventListener('change', () => { if (L.mode === 'auto') applyMode(); });

  function applyBackground() {
    const b = document.body.style;
    if (L.bg === 'custom' && customImage) {
      b.backgroundImage = `url("${customImage}")`;
      b.backgroundSize = 'cover';
      b.backgroundPosition = 'center';
      b.backgroundColor = '#333';
      return;
    }
    let bg = BGS.find((x) => x.id === L.bg) || BGS[0];
    // A light background under dark panels looks wrong; dark mode swaps it for charcoal.
    if (isDark() && !DARK_BGS.includes(bg.id)) bg = BGS.find((x) => x.id === 'charcoal');
    b.backgroundImage = bg.css;
    b.backgroundSize = bg.size || 'auto';
    b.backgroundPosition = '';
    b.backgroundColor = '';
  }

  function applyFont() {
    const ar = (AR_FONTS.find((f) => f[0] === L.fontAr) || AR_FONTS[0])[1];
    const en = (EN_FONTS.find((f) => f[0] === L.fontEn) || EN_FONTS[0])[1];
    document.documentElement.style.setProperty('--font', `${en ? `"${en}", ` : ''}"${ar}", "Segoe UI", Tahoma, Arial, sans-serif`);
  }

  window.noonLook = {
    get: () => ({ dial: L.dial, metal: L.metal, mode: L.mode, fontAr: L.fontAr, fontEn: L.fontEn,
      face: FACE_OPTS.some((f) => f[0] === L.face) ? L.face : 'classic', slots: slotsFor(L.face),
      theme: (() => { const t = THEME_OPTS.find((x) => x[0] === L.theme) || THEME_OPTS[0]; return { id: t[0], bg1: t[2], bg2: t[3], accent: t[4] }; })() }),
    SLOTS: SLOT_OPTS,
    fonts: { ar: AR_FONTS, en: EN_FONTS },
    setFont(kind, id) { L[kind === 'en' ? 'fontEn' : 'fontAr'] = id; save(); applyFont(); }
  };
  const announce = () => window.dispatchEvent(new CustomEvent('noon-look'));

  // ---- panel ----
  const panel = $('lookPanel');
  function swatch(label, pressed, style, onClick, cls) {
    label = T(label);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = cls;
    b.setAttribute('aria-pressed', String(pressed));
    b.setAttribute('aria-label', label);
    b.title = label;
    const chip = document.createElement('span');
    chip.className = 'sw-chip';
    Object.assign(chip.style, style);
    const name = document.createElement('span');
    name.className = 'sw-name';
    name.textContent = label;
    b.append(chip, name);
    b.addEventListener('click', onClick);
    return b;
  }
  function renderPanel() {
    $('lookFaces').replaceChildren(...FACE_OPTS.map(([id, label]) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'chip'; b.textContent = T(label);
      b.setAttribute('aria-pressed', String(L.face === id));
      b.addEventListener('click', () => { L.face = id; save(); announce(); renderPanel(); });
      return b;
    }));
    $('lookAccentBox').hidden = L.face !== 'modern';
    $('lookAccents').replaceChildren(...THEME_OPTS.map(([id, label, bg1, bg2, accent]) =>
      swatch(label, (L.theme || 'pearl') === id, { background: `radial-gradient(circle at 50% 50%, ${accent} 0 22%, transparent 24%), linear-gradient(160deg, ${bg1}, ${bg2})` },
        () => { L.theme = id; save(); announce(); renderPanel(); }, 'sw sw-round')));
    const cur = slotsFor(L.face);
    const keys = Object.keys(cur);
    $('lookSlots').replaceChildren(...keys.map((k, i) => {
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
      const names = SLOT_NAMES[L.face];
      lab.append(document.createTextNode(names ? T(names[i]) : keys.length > 1 ? `${T('الخانة')} ${I.num(i + 1)}` : T('الخانة العلوية')), sel);
      return lab;
    }));
    const modes = $('lookModes');
    if (modes) {
      modes.replaceChildren(...[['auto', 'تلقائي (حسب الجهاز)'], ['light', 'فاتح'], ['dark', 'داكن']].map(([id, label]) => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'chip'; b.textContent = T(label);
        b.setAttribute('aria-pressed', String(L.mode === id));
        b.addEventListener('click', () => { L.mode = id; save(); applyMode(); renderPanel(); });
        return b;
      }));
    }
    const sizes = $('lookSizes');
    if (sizes) {
      sizes.replaceChildren(...[[0.9, 'صغير'], [1, 'عادي'], [1.12, 'كبير'], [1.25, 'أكبر']].map(([v, label]) => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'chip'; b.textContent = T(label);
        b.setAttribute('aria-pressed', String((L.scale || 1) === v));
        b.addEventListener('click', () => { L.scale = v; save(); applyMode(); renderPanel(); });
        return b;
      }));
    }
    $('lookDials').replaceChildren(...DIAL_OPTS.map(([id, label, col]) =>
      swatch(label, L.dial === id, { background: `radial-gradient(circle at 35% 30%, #ffffff55, transparent 60%), ${col}` },
        () => { L.dial = id; save(); announce(); renderPanel(); }, 'sw sw-round')));
    $('lookMetals').replaceChildren(...METAL_OPTS.map(([id, label, grad]) =>
      swatch(label, L.metal === id, { background: grad }, () => { L.metal = id; save(); announce(); renderPanel(); }, 'sw sw-round')));
    const tiles = BGS.map((bg) =>
      swatch(bg.ar, L.bg === bg.id, { backgroundImage: bg.css, backgroundSize: bg.size ? bg.size.replace(/\d+px \d+px/g, '120px 90px') : 'auto' },
        () => { L.bg = bg.id; save(); applyBackground(); renderPanel(); }, 'sw sw-tile'));
    if (customImage) {
      tiles.push(swatch('صورتك', L.bg === 'custom', { backgroundImage: `url("${customImage}")`, backgroundSize: 'cover', backgroundPosition: 'center' },
        () => { L.bg = 'custom'; save(); applyBackground(); renderPanel(); }, 'sw sw-tile'));
    }
    $('lookBgs').replaceChildren(...tiles);
  }
  function openPanel() {
    renderPanel();
    panel.hidden = false;
    const lp = panel.closest('.left-pane');
    if (lp) lp.scrollTop = 0;
    $('lookClose').focus();
  }
  function closePanel() { panel.hidden = true; $('lookChip').focus(); }
  window.noonLook.open = openPanel; // Settings › Appearance hosts this panel
  $('lookChip').addEventListener('click', () => (panel.hidden ? openPanel() : closePanel()));
  $('lookClose').addEventListener('click', closePanel);
  panel.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); closePanel(); } });

  // Your own photo: scaled down so it fits in browser storage.
  $('lookUpload').addEventListener('change', (ev) => {
    const file = ev.target.files && ev.target.files[0];
    const msg = $('lookUploadMsg');
    if (!file) return;
    if (!file.type.startsWith('image/')) { msg.textContent = T('اختر ملف صورة (JPG أو PNG).'); return; }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, 1920 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      customImage = c.toDataURL('image/jpeg', 0.82);
      L.bg = 'custom';
      save();
      try {
        localStorage.setItem(IMG_KEY, customImage);
        msg.textContent = T('تم تعيين صورتك كخلفية.');
      } catch (_) {
        msg.textContent = T('تم تعيين صورتك، لكنها كبيرة على مساحة الحفظ فلن تبقى بعد إغلاق الصفحة.');
      }
      applyBackground();
      renderPanel();
      ev.target.value = '';
    };
    img.onerror = () => { msg.textContent = T('تعذّر فتح هذه الصورة. جرّب صورة أخرى.'); URL.revokeObjectURL(url); };
    img.src = url;
  });

  applyMode();
  announce();
})();
