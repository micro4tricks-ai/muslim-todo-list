// ---------- Group khatma: the whole Quran shared out by juz among family and friends ----------
// One person starts it and shares its code; whoever joins takes a free juz, reads it, and marks it
// done. Stored in Supabase behind the rules in supabase/khatma.sql: only members see a khatma, and
// nobody can change another member's juz. Needs the account (Settings › Account & sync).
(() => {
  'use strict';
  const { T, I, el, button, toast } = window.noonUI;
  const M = window.NOON_QURAN_META;
  const SITE = 'https://micro4tricks-ai.github.io/muslim-todo-list/';
  const NAME_KEY = 'noon-khatma-name';
  const db = () => window.noonSync && window.noonSync.client();
  const me = () => window.noonSync && window.noonSync.user();
  const myName = () => { try { return localStorage.getItem(NAME_KEY) || ''; } catch (_) { return ''; } };
  const keepName = (n) => { try { localStorage.setItem(NAME_KEY, n); } catch (_) {} };
  // A shared code waits here until the person has signed in and joined.
  const CODE_KEY = 'noon-khatma-code';
  const waiting = () => { try { return localStorage.getItem(CODE_KEY) || ''; } catch (_) { return ''; } };
  const wait = (c) => { try { if (c) localStorage.setItem(CODE_KEY, c); else localStorage.removeItem(CODE_KEY); } catch (_) {} };

  // ---- the screen, closed by the back key like Settings ----
  const root = el('div', 'st kh');
  root.hidden = true;
  root.dir = I.isEn ? 'ltr' : 'rtl';
  root.setAttribute('role', 'dialog');
  const title = el('h2', 'st-title', T('الختمة الجماعية'));
  const bar = el('header', 'st-bar');
  bar.append(button('st-back', I.isEn ? '←' : '→', () => history.back(), T('رجوع')), title);
  const body = el('div', 'st-body');
  root.append(bar, body);
  document.body.append(root);
  let open = false, current = null, timer = 0;
  function show(code) {
    if (!open) {
      open = true;
      root.hidden = false;
      document.body.classList.add('st-open');
      history.pushState({ kh: 1 }, '');
    }
    current = null;
    home(code);
  }
  function hide() { open = false; current = null; clearInterval(timer); root.hidden = true; document.body.classList.remove('st-open'); }
  addEventListener('popstate', () => { if (open) hide(); });

  const field = (label, value, placeholder) => {
    const w = el('label', 'kh-field');
    const i = el('input', 'ls-search'); i.value = value || ''; i.placeholder = placeholder || '';
    w.append(el('span', '', T(label)), i);
    return [w, i];
  };
  const fail = (e) => toast(T('تعذّر الاتصال. تأكد من الإنترنت وحاول مرة أخرى.') + (e && e.message ? ` (${e.message})` : ''));

  // ---- the first page: your khatmas, start one, join one ----
  async function home(code) {
    if (code) wait(code);
    code = code || waiting();
    title.textContent = T('الختمة الجماعية');
    body.replaceChildren(el('p', 'st-note', T('اقسموا ختمة القرآن على الأجزاء بينكم: يأخذ كل واحد جزءاً أو أكثر، ويعلّمه حين يقرؤه، ويرى الجميع التقدم.')));
    if (!db()) { body.append(el('p', 'hint', T('الختمة الجماعية تحتاج خدمة المزامنة، وهي غير متاحة الآن.'))); return; }
    if (!me()) {
      body.append(el('p', 'hint', T('سجّل الدخول أولاً حتى تنشئ ختمة أو تنضم إلى واحدة.')),
        button('btn btn-primary', T('تسجيل الدخول'), () => { history.back(); setTimeout(() => window.noonSettings.open('account'), 200); }));
      return;
    }
    // Join with a code.
    const join = el('section', 'st-group');
    join.append(el('h3', 'st-group-name', T('انضم بالرمز')));
    const jb = el('div', 'st-list st-pad');
    const [jcF, jc] = field('رمز الختمة', code || '', 'AB12CD34');
    const [jnF, jn] = field('اسمك كما يراه الآخرون', myName());
    jb.append(jcF, jnF, button('btn btn-primary', T('انضم'), async () => {
      if (!jc.value.trim() || !jn.value.trim()) { toast(T('اكتب الرمز واسمك.')); return; }
      keepName(jn.value.trim());
      const { data, error } = await db().rpc('khatma_join', { p_code: jc.value, p_name: jn.value.trim() });
      if (error) return fail(error);
      if (!data) { toast(T('لا توجد ختمة بهذا الرمز. تأكد منه.')); return; }
      wait('');
      detail(data);
    }));
    join.append(jb);
    // Start one.
    const make = el('section', 'st-group');
    make.append(el('h3', 'st-group-name', T('ابدأ ختمة جديدة')));
    const mb = el('div', 'st-list st-pad');
    const [mtF, mt] = field('اسم الختمة', T('ختمة العائلة'));
    const [mnF, mn] = field('اسمك', myName());
    mb.append(mtF, mnF, button('btn btn-primary', T('ابدأ'), async () => {
      if (!mt.value.trim() || !mn.value.trim()) { toast(T('اكتب اسم الختمة واسمك.')); return; }
      keepName(mn.value.trim());
      const { data, error } = await db().rpc('khatma_create', { p_title: mt.value.trim(), p_name: mn.value.trim() });
      if (error) return fail(error);
      const row = Array.isArray(data) ? data[0] : data;
      if (row) detail(row.id);
    }));
    make.append(mb);
    // Yours.
    const mine = el('section', 'st-group');
    mine.append(el('h3', 'st-group-name', T('ختماتي')));
    const list = el('div', 'st-list');
    list.append(el('p', 'hint st-pad', T('جارٍ التحميل…')));
    mine.append(list);
    body.append(...(code ? [join, mine, make] : [mine, join, make]));
    const { data, error } = await db().from('khatma_member').select('khatma(id,title,code,created_at)').eq('user_id', me().id);
    list.replaceChildren();
    if (error) { list.append(el('p', 'hint st-pad', T('تعذّر التحميل.'))); return; }
    const ks = (data || []).map((r) => r.khatma).filter(Boolean);
    if (!ks.length) list.append(el('p', 'hint st-pad', T('لم تنضم إلى ختمة بعد.')));
    ks.forEach((k) => {
      const r = button('st-row', '', () => detail(k.id));
      const t = el('span', 'st-row-text'); t.append(el('b', '', k.title), el('small', '', `${T('الرمز')}: ${k.code}`));
      r.append(t);
      list.append(r);
    });
  }

  // ---- one khatma: the 30 parts ----
  async function detail(id) {
    current = id;
    body.replaceChildren(el('p', 'hint', T('جارٍ التحميل…')));
    await draw();
    clearInterval(timer);
    timer = setInterval(() => { if (open && current === id && !document.hidden) draw(); }, 20000);
  }
  async function draw() {
    const id = current;
    const [k, parts] = await Promise.all([
      db().from('khatma').select('id,title,code,owner').eq('id', id).single(),
      db().from('khatma_part').select('juz,user_id,name,done').eq('khatma', id).order('juz')
    ]);
    if (current !== id) return;
    if (k.error || parts.error) { body.replaceChildren(el('p', 'hint', T('تعذّر التحميل.'))); return; }
    const K = k.data, P = parts.data || [], uid = me().id;
    title.textContent = K.title;
    const done = P.filter((p) => p.done).length, taken = P.filter((p) => p.user_id).length;
    const head = el('div', 'kh-head');
    const prog = el('span', 'td-bar'); const pi = el('i'); pi.style.width = `${Math.round((done / 30) * 100)}%`; prog.append(pi);
    head.append(el('b', '', `${I.num(done)} / ${I.num(30)} ${T('جزءاً قُرئ')}`), el('small', '', `${I.num(taken)} ${T('مأخوذ')} · ${I.num(30 - taken)} ${T('متاح')}`), prog);
    const share = el('div', 'kh-share');
    const link = `${SITE}?khatma=${K.code}`;
    share.append(el('span', '', `${T('الرمز')}: `), el('b', 'kh-code', K.code), button('btn btn-quiet', T('مشاركة'), () => shareLink(K, link)));
    const grid = el('div', 'kh-grid');
    P.forEach((p) => {
      const mineP = p.user_id === uid;
      const c = button(`kh-juz${p.done ? ' is-done' : ''}${mineP ? ' is-mine' : p.user_id ? ' is-taken' : ''}`, '', () => tap(p, mineP));
      c.append(el('b', '', I.num(p.juz)), el('small', '', p.done ? '✓' : p.user_id ? (mineP ? T('لك') : p.name || '') : T('متاح')));
      grid.append(c);
    });
    const mine = P.filter((p) => p.user_id === uid);
    const yours = el('section', 'st-group');
    yours.append(el('h3', 'st-group-name', T('أجزاؤك')));
    const yl = el('div', 'st-list');
    if (!mine.length) yl.append(el('p', 'hint st-pad', T('اضغط على جزء «متاح» لتأخذه.')));
    mine.forEach((p) => {
      const r = el('div', 'hz-row');
      const t = el('div', 'hz-text'); t.append(el('b', '', `${T('الجزء')} ${I.num(p.juz)}`), el('small', '', T(p.done ? 'قرأته، تقبّل الله' : 'لم يُقرأ بعد')));
      const acts = el('div', 'hz-acts');
      acts.append(
        button('hz-g', T('اقرأ'), () => { history.back(); setTimeout(() => window.noonQuran && window.noonQuran.open(M.juz[p.juz - 1]), 150); }),
        button(`hz-g ${p.done ? 'hz-shaky' : 'hz-well'}`, T(p.done ? 'لم أقرأه' : 'قرأته'), () => setPart(p, { done: !p.done })),
        button('hz-g hz-forgot', T('تخلَّ عنه'), () => setPart(p, { user_id: null, name: null, done: false }))
      );
      r.append(t, acts);
      yl.append(r);
    });
    yours.append(yl);
    const foot = el('div', 'kh-foot');
    foot.append(button('btn btn-quiet', T('تحديث'), () => draw()), button('link-btn', T('كل الختمات'), () => { current = null; clearInterval(timer); home(); }));
    if (K.owner === uid) foot.append(button('link-btn danger', T('حذف الختمة'), async () => {
      if (!confirm(T('حذف هذه الختمة لكل أعضائها؟'))) return;
      const { error } = await db().from('khatma').delete().eq('id', K.id);
      if (error) return fail(error);
      current = null; home();
    }));
    else foot.append(button('link-btn danger', T('غادر الختمة'), async () => {
      const { error } = await db().from('khatma_member').delete().eq('khatma', K.id).eq('user_id', uid);
      if (error) return fail(error);
      current = null; home();
    }));
    body.replaceChildren(head, share, grid, yours, foot);
  }
  async function tap(p, mineP) {
    if (mineP) return setPart(p, { done: !p.done });
    if (p.user_id) { toast(`${T('هذا الجزء مع')} ${p.name || T('عضو آخر')}`); return; }
    const name = myName() || (me().email || '').split('@')[0];
    // Only if it is still free: someone may have taken it a moment ago.
    const { data, error } = await db().from('khatma_part').update({ user_id: me().id, name, updated_at: new Date().toISOString() })
      .eq('khatma', current).eq('juz', p.juz).is('user_id', null).select();
    if (error) return fail(error);
    if (!data || !data.length) toast(T('أخذه غيرك للتو. اختر جزءاً آخر.'));
    draw();
  }
  async function setPart(p, change) {
    const { error } = await db().from('khatma_part').update(Object.assign({ updated_at: new Date().toISOString() }, change))
      .eq('khatma', current).eq('juz', p.juz);
    if (error) return fail(error);
    draw();
  }
  async function shareLink(K, link) {
    const text = `${T('شاركنا ختمة')} «${K.title}». ${T('الرمز')}: ${K.code}\n${link}`;
    const S = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Share;
    try {
      if (S) await S.share({ title: K.title, text });
      else if (navigator.share) await navigator.share({ title: K.title, text });
      else { await navigator.clipboard.writeText(text); toast(T('نُسخ الرابط والرمز.')); }
    } catch (_) { /* closed */ }
  }

  // A shared link opens the join form with its code.
  const code = new URLSearchParams(location.search).get('khatma');
  if (code && /^[A-Za-z0-9]{8}$/.test(code)) {
    const p = new URLSearchParams(location.search); p.delete('khatma');
    history.replaceState(null, '', location.pathname + (p.toString() ? '?' + p : '') + location.hash);
    setTimeout(() => show(code.toUpperCase()), 1500);
  }
  window.noonKhatma = { open: (c) => show(c) };
})();
