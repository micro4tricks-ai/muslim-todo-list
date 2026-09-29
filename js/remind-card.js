// ---------- Reminder cards: reminders shown as designed cards, which can be shared as images ----------
// Used by the calendar reminders, the prayer alerts (with the adhan) and the Mushaf / library
// ("share as a card"). The look is one of a few card designs chosen in the calendar settings.
(() => {
  'use strict';
  const { T, I, el, button, load, store, toast } = window.noonUI;
  const KEY = 'noon-sweep-card-look';
  const THEMES = [
    ['gold', 'ذهبي مزخرف', 'Gold pattern'],
    ['emerald', 'زمردي', 'Emerald'],
    ['paper', 'ورقي', 'Parchment'],
    ['night', 'ليلي', 'Night'],
    ['sky', 'سماوي', 'Sky'],
    ['rose', 'وردي هادئ', 'Soft rose']
  ];
  // Canvas colours for each design: background stops, pattern, frame, title, text, muted.
  const PAINT = {
    gold: { bg: ['#14213D', '#0B1426'], pat: 'rgba(212,175,55,0.10)', frame: '#D4AF37', title: '#F2D58A', text: '#F7F1E1', muted: 'rgba(247,241,225,0.7)' },
    emerald: { bg: ['#1F5A40', '#0E3325'], pat: 'rgba(255,255,255,0.07)', frame: '#8FE3B4', title: '#E9C46A', text: '#F3F8F4', muted: 'rgba(243,248,244,0.72)' },
    paper: { bg: ['#FBF4E2', '#EFE0BE'], pat: 'rgba(122,90,30,0.08)', frame: '#A67C2E', title: '#6B4A12', text: '#2E2616', muted: 'rgba(46,38,22,0.66)' },
    night: { bg: ['#171A2B', '#07080F'], pat: 'rgba(160,170,255,0.06)', frame: '#8E9BFF', title: '#E7E2D6', text: '#E7E2D6', muted: 'rgba(231,226,214,0.66)' },
    sky: { bg: ['#DDEEFF', '#A9CCF2'], pat: 'rgba(20,60,110,0.07)', frame: '#2B5C8A', title: '#173A5E', text: '#132A40', muted: 'rgba(19,42,64,0.66)' },
    rose: { bg: ['#FCE8E6', '#F1C5C0'], pat: 'rgba(120,40,40,0.07)', frame: '#B4542F', title: '#7A2E1C', text: '#3D1E17', muted: 'rgba(61,30,23,0.66)' }
  };
  let look = load(KEY, { theme: 'gold' }).theme || 'gold';
  const theme = () => (PAINT[look] ? look : 'gold');
  function setTheme(k) { look = k; store(KEY, { theme: k, updatedAt: Date.now() }); }

  // ---- the card on screen ----
  let box = null, onClose = null;
  function close() {
    if (!box || box.hidden) return;
    box.hidden = true;
    const f = onClose; onClose = null;
    if (f) f();
  }
  // c: { kicker, title, body, ref, lang, quran, actions: [{ label, run, primary }], onClose }
  function show(c) {
    if (!box) {
      box = el('div', 'rc');
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-modal', 'true');
      box.addEventListener('click', (ev) => { if (ev.target === box) close(); });
      box.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') close(); });
      document.body.append(box);
    }
    close();
    onClose = c.onClose || null;
    const card = el('div', 'rc-card');
    card.dataset.theme = theme();
    card.dir = I.dir;
    const x = button('rc-x', '×', close, T('إغلاق'));
    const kicker = el('span', 'rc-kicker', c.kicker || T('تذكير'));
    const title = el('h2', 'rc-title', c.title);
    title.id = 'rcTitle';
    card.append(x, el('span', 'rc-star', '۞'), kicker, title);
    if (c.body) {
      const b = el('p', `rc-body${c.quran ? ' is-quran' : ''}`, c.body);
      b.dir = 'auto';
      if (c.lang) b.lang = c.lang;
      card.append(b);
    }
    if (c.ref) card.append(el('p', 'rc-ref', c.ref));
    const acts = el('div', 'rc-acts');
    (c.actions || []).forEach((a) => acts.append(button(`btn ${a.primary ? 'btn-primary' : 'btn-quiet'}`, a.label, () => { if (a.keep !== true) close(); a.run(); })));
    acts.append(button('btn btn-quiet', T('مشاركة كصورة'), () => shareImage(c)));
    card.append(acts);
    box.setAttribute('aria-labelledby', 'rcTitle');
    box.replaceChildren(card);
    box.hidden = false;
    (acts.querySelector('.btn') || x).focus({ preventScroll: true });
  }

  // ---- the same card as an image (1080 × 1350) ----
  function wrap(ctx, text, width) {
    const words = String(text).split(/\s+/), lines = [];
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > width && line) { lines.push(line); line = w; } else line = test;
    }
    if (line) lines.push(line);
    return lines;
  }
  function pattern(ctx, W, H, color) {
    // Eight-pointed stars on a square grid.
    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = 2;
    const s = 90;
    for (let y = -s; y < H + s; y += s) {
      for (let x = -s; x < W + s; x += s) {
        ctx.beginPath(); ctx.rect(x + s * 0.2, y + s * 0.2, s * 0.6, s * 0.6); ctx.stroke();
        ctx.save(); ctx.translate(x + s / 2, y + s / 2); ctx.rotate(Math.PI / 4);
        ctx.beginPath(); ctx.rect(-s * 0.3, -s * 0.3, s * 0.6, s * 0.6); ctx.stroke(); ctx.restore();
      }
    }
    ctx.restore();
  }
  async function render(c) {
    const W = 1080, H = 1350, P = PAINT[theme()];
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    try { await Promise.all([document.fonts.load('700 60px "IBM Plex Sans Arabic"'), document.fonts.load('48px "Amiri"'), document.fonts.load('48px "Amiri Quran"', 'بِسْمِ')]); } catch (_) {}
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, P.bg[0]); g.addColorStop(1, P.bg[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    pattern(ctx, W, H, P.pat);
    ctx.strokeStyle = P.frame; ctx.lineWidth = 6; ctx.strokeRect(46, 46, W - 92, H - 92);
    ctx.lineWidth = 2; ctx.strokeRect(62, 62, W - 124, H - 124);
    const rtl = !I.isEn || /[؀-ۿ]/.test(c.body || '');
    ctx.textAlign = 'center';
    ctx.direction = I.isEn ? 'ltr' : 'rtl';
    ctx.fillStyle = P.frame; ctx.font = '64px "Amiri", serif';
    ctx.fillText('۞', W / 2, 170);
    ctx.fillStyle = P.muted; ctx.font = '600 34px "IBM Plex Sans Arabic", sans-serif';
    ctx.fillText(c.kicker || T('تذكير'), W / 2, 240);
    ctx.fillStyle = P.title; ctx.font = '700 58px "IBM Plex Sans Arabic", sans-serif';
    const tl = wrap(ctx, c.title || '', W - 220);
    let y = 330;
    tl.slice(0, 3).forEach((l) => { ctx.fillText(l, W / 2, y); y += 76; });
    // Body: as large as fits.
    ctx.direction = rtl ? 'rtl' : 'ltr';
    const body = c.body || '';
    let size = 54, lines = [];
    for (; size >= 28; size -= 2) {
      // Quran verses in the Mushaf typeface, so the pause marks sit where they belong.
      ctx.font = `${size}px ${c.quran ? '"Amiri Quran", "Amiri", serif' : rtl ? '"Amiri", serif' : '"IBM Plex Sans Arabic", sans-serif'}`;
      lines = wrap(ctx, body, W - 240);
      if (lines.length * size * 1.75 < H - y - 260) break;
    }
    ctx.fillStyle = P.text;
    y += 40;
    const lh = size * 1.75;
    const top = y + Math.max(0, (H - y - 260 - lines.length * lh) / 2);
    lines.forEach((l, k) => ctx.fillText(l, W / 2, top + (k + 0.8) * lh));
    ctx.direction = I.isEn ? 'ltr' : 'rtl';
    if (c.ref) { ctx.fillStyle = P.muted; ctx.font = '500 30px "IBM Plex Sans Arabic", sans-serif'; wrap(ctx, c.ref, W - 240).slice(0, 2).forEach((l, k) => ctx.fillText(l, W / 2, H - 170 + k * 42)); }
    ctx.fillStyle = P.frame; ctx.font = '600 26px "IBM Plex Sans Arabic", sans-serif';
    ctx.fillText('Muslim To-Do List', W / 2, H - 88);
    return cv;
  }
  async function shareImage(c) {
    const cv = await render(c);
    const name = 'muslim-todo-card.png';
    const C = window.Capacitor;
    const P = C && C.isNativePlatform && C.isNativePlatform() && C.Plugins;
    try {
      if (P && P.Filesystem && P.Share) {
        // Inside the Android app: save to the cache, then open the share sheet.
        const data = cv.toDataURL('image/png').split(',')[1];
        const f = await P.Filesystem.writeFile({ path: name, data, directory: 'CACHE' });
        await P.Share.share({ title: c.title, files: [f.uri] });
        return;
      }
      const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
      const file = new File([blob], name, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: c.title }); return; }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = name;
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toast(T('حُفظت صورة الكارت في التنزيلات.'));
    } catch (e) {
      if (!e || e.name !== 'AbortError') toast(T('تعذّرت مشاركة الصورة.'));
    }
  }

  window.noonCard = { show, close, shareImage, themes: THEMES, theme, setTheme };
})();
