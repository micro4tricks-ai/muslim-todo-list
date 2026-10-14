// ---------- Group challenges: a shared goal of dhikr or Quran pages among family and friends ----------
// One person sets the goal and shares the code; each member adds what they did, and everyone sees
// the total and each one's share. Stored in Supabase behind the rules in supabase/challenge.sql:
// only members see a challenge, and each changes only their own count. Needs the account.
(() => {
  'use strict';
  const { T, I, el, button, toast, skeleton } = window.noonUI;
  const SITE = 'https://micro4tricks-ai.github.io/muslim-todo-list/';
  const NAME_KEY = 'noon-khatma-name'; // the same name as in the group khatma
  const CODE_KEY = 'noon-challenge-code';
  const db = () => window.noonSync && window.noonSync.client();
  const me = () => window.noonSync && window.noonSync.user();
  const myName = () => { try { return localStorage.getItem(NAME_KEY) || ''; } catch (_) { return ''; } };
  const keepName = (n) => { try { localStorage.setItem(NAME_KEY, n); } catch (_) {} };
  const waiting = () => { try { return localStorage.getItem(CODE_KEY) || ''; } catch (_) { return ''; } };
  const wait = (c) => { try { if (c) localStorage.setItem(CODE_KEY, c); else localStorage.removeItem(CODE_KEY); } catch (_) {} };
  // What can be counted, with the steps offered to add.
  const KINDS = {
    tasbih: { name: 'تسبيح', unit: 'تسبيحة', steps: [33, 100], goal: 10000 },
    salawat: { name: 'الصلاة على النبي ﷺ', unit: 'صلاة', steps: [10, 100], goal: 10000 },
    istighfar: { name: 'استغفار', unit: 'استغفار', steps: [33, 100], goal: 10000 },
    pages: { name: 'صفحات القرآن', unit: 'صفحة', steps: [1, 5], goal: 604 },
  };

  // ---- the screen, closed by the back key like Settings ----
  const root = el('div', 'st kh ch');
  root.hidden = true;
  root.dir = I.isEn ? 'ltr' : 'rtl';
  root.setAttribute('role', 'dialog');
  const title = el('h2', 'st-title', T('التحدي الجماعي'));
  const bar = el('header', 'st-bar');
  bar.append(button('st-back', I.isEn ? '←' : '→', () => history.back(), T('رجوع')), title);
  const body = el('div', 'st-body');
  root.append(bar, body);
  document.body.append(root);
  let open = false, current = null, timer = 0, busy = false;
  function show(code) {
    if (!open) {
      open = true;
      root.hidden = false;
      document.body.classList.add('st-open');
      history.pushState({ ch: 1 }, '');
    }
    current = null;
    home(code);
  }
  function hide() { open = false; current = null; clearInterval(timer); root.hidden = true; document.body.classList.remove('st-open'); }
  addEventListener('popstate', () => { if (open) hide(); });

  const field = (label, input) => {
    const w = el('label', 'kh-field');
    w.append(el('span', '', T(label)), input);
    return w;
  };
  const textInput = (value, placeholder) => { const i = el('input', 'ls-search'); i.value = value || ''; i.placeholder = placeholder || ''; return i; };
  const fail = (e) => toast(e && /too many tries/.test(e.message || '')
    ? T('محاولات كثيرة برموز غير صحيحة. انتظر ساعة ثم حاول مرة أخرى.')
    : e && /too many challenges/.test(e.message || '')
      ? T('لديك ٣٠ تحدياً. احذف واحداً منها قبل أن تبدأ غيره.')
      : T('تعذّر الاتصال. تأكد من الإنترنت وحاول مرة أخرى.') + (e && e.message ? ` (${e.message})` : ''));

  // ---- the first page: your challenges, start one, join one ----
  async function home(code) {
    if (code) wait(code);
    code = code || waiting();
    title.textContent = T('التحدي الجماعي');
    body.replaceChildren(el('p', 'st-note', T('ضعوا هدفاً مشتركاً من التسبيح أو الاستغفار أو الصلاة على النبي ﷺ أو صفحات القرآن، ويضيف كل واحد ما أنجزه، فيرى الجميع المجموع ونصيب كل عضو.')));
    if (!db()) { body.append(el('p', 'hint', T('التحدي الجماعي يحتاج خدمة المزامنة، وهي غير متاحة الآن.'))); return; }
    if (!me()) {
      body.append(el('p', 'hint', T('سجّل الدخول أولاً حتى تنشئ تحدياً أو تنضم إلى واحد.')),
        button('btn btn-primary', T('تسجيل الدخول'), () => { history.back(); setTimeout(() => window.noonSettings.open('account'), 200); }));
      return;
    }
    // Join with a code.
    const join = el('section', 'st-group');
    join.append(el('h3', 'st-group-name', T('انضم بالرمز')));
    const jb = el('div', 'st-list st-pad');
    const jc = textInput(code || '', 'AB12CD34'), jn = textInput(myName());
    jc.setAttribute('autocapitalize', 'characters');
    jb.append(field('رمز التحدي', jc), field('اسمك كما يراه الآخرون', jn), button('btn btn-primary', T('انضم'), async (ev) => {
      const btn = ev.currentTarget;
      if (!jc.value.trim() || !jn.value.trim()) { toast(T('اكتب الرمز واسمك.')); return; }
      if (busy) return;
      busy = true; btn.disabled = true;
      keepName(jn.value.trim());
      const { data, error } = await db().rpc('challenge_join', { p_code: jc.value, p_name: jn.value.trim() });
      busy = false; btn.disabled = false;
      if (error) return fail(error);
      if (!data) { toast(T('لا يوجد تحدٍّ بهذا الرمز. تأكد منه.')); return; }
      wait('');
      detail(data);
    }));
    join.append(jb);
    // Start one.
    const make = el('section', 'st-group');
    make.append(el('h3', 'st-group-name', T('ابدأ تحدياً جديداً')));
    const mb = el('div', 'st-list st-pad');
    const kind = el('select', 'ls-search');
    Object.entries(KINDS).forEach(([k, x]) => kind.append(new Option(T(x.name), k)));
    const goal = el('input', 'ls-search'); goal.type = 'number'; goal.min = '1'; goal.max = '10000000'; goal.inputMode = 'numeric'; goal.value = String(KINDS.tasbih.goal);
    kind.addEventListener('change', () => { goal.value = String(KINDS[kind.value].goal); if (!mt.dataset.edited) mt.value = defaultTitle(); });
    const days = el('select', 'ls-search');
    [[7, 'أسبوع'], [10, 'عشرة أيام'], [30, 'شهر'], [0, 'بلا موعد']].forEach(([v, l]) => days.append(new Option(T(l), String(v))));
    const defaultTitle = () => `${T('تحدي')} ${T(KINDS[kind.value].name)}`;
    const mt = textInput(defaultTitle());
    mt.addEventListener('input', () => { mt.dataset.edited = '1'; });
    const mn = textInput(myName());
    mb.append(field('نوع التحدي', kind), field('الهدف للمجموعة كلها', goal), field('المدة', days), field('اسم التحدي', mt), field('اسمك', mn),
      button('btn btn-primary', T('ابدأ'), async (ev) => {
        const btn = ev.currentTarget;
        const g = Math.round(Number(goal.value));
        if (!mt.value.trim() || !mn.value.trim()) { toast(T('اكتب اسم التحدي واسمك.')); return; }
        if (!(g >= 1 && g <= 10000000)) { toast(T('اكتب هدفاً بين ١ و١٠ ملايين.')); return; }
        if (busy) return;
        busy = true; btn.disabled = true;
        keepName(mn.value.trim());
        const { data, error } = await db().rpc('challenge_create', { p_title: mt.value.trim(), p_kind: kind.value, p_goal: g, p_days: Number(days.value), p_name: mn.value.trim() });
        busy = false; btn.disabled = false;
        if (error) return fail(error);
        const row = Array.isArray(data) ? data[0] : data;
        if (row) detail(row.id);
      }));
    make.append(mb);
    // Yours.
    const mine = el('section', 'st-group');
    mine.append(el('h3', 'st-group-name', T('تحدياتي')));
    const list = el('div', 'st-list');
    list.append(skeleton(T('جارٍ التحميل…'), 2));
    mine.append(list);
    body.append(...(code ? [join, mine, make] : [mine, join, make]));
    const { data, error } = await db().from('challenge_member').select('progress, challenge(id,title,code,kind,goal)').eq('user_id', me().id);
    list.replaceChildren();
    if (error) { list.append(el('p', 'hint st-pad', T('تعذّر التحميل.'))); return; }
    const cs = (data || []).filter((r) => r.challenge);
    if (!cs.length) list.append(el('p', 'hint st-pad', T('لم تنضم إلى تحدٍّ بعد.')));
    cs.forEach(({ challenge: c, progress }) => {
      const r = button('st-row', '', () => detail(c.id));
      const t = el('span', 'st-row-text');
      t.append(el('b', '', c.title), el('small', '', `${T(KINDS[c.kind] ? KINDS[c.kind].name : '')} · ${T('نصيبك')}: ${I.num(progress)} · ${T('الرمز')}: ${c.code}`));
      r.append(t);
      list.append(r);
    });
  }

  // ---- one challenge: the total, each member, and your count ----
  async function detail(id) {
    current = id;
    body.replaceChildren(skeleton(T('جارٍ التحميل…'), 4));
    await draw();
    clearInterval(timer);
    timer = setInterval(() => { if (open && current === id && !document.hidden) draw(); }, 20000);
  }
  let last = null; // the latest rows, so a tap adds at once and the server follows
  async function draw() {
    const id = current;
    const [c, m] = await Promise.all([
      db().from('challenge').select('id,title,code,kind,goal,ends_on,owner').eq('id', id).single(),
      db().from('challenge_member').select('user_id,name,progress').eq('challenge', id).order('progress', { ascending: false })
    ]);
    if (current !== id) return;
    if (c.error || m.error) { body.replaceChildren(el('p', 'hint', T('تعذّر التحميل.'))); return; }
    last = { C: c.data, M: m.data || [] };
    paint();
  }
  function paint() {
    const { C, M } = last, uid = me().id, K = KINDS[C.kind] || KINDS.tasbih;
    title.textContent = C.title;
    const total = M.reduce((a, x) => a + x.progress, 0);
    const pct = Math.min(100, Math.round((total / C.goal) * 100));
    const head = el('div', 'kh-head');
    const prog = el('span', 'td-bar'); const pi = el('i'); pi.style.width = `${pct}%`; prog.append(pi);
    let left = '';
    if (C.ends_on) {
      // Whole days from today to the last day (the server's ends_on).
      const t = new Date(), [y, mo, da] = C.ends_on.split('-').map(Number);
      const d = Math.round((new Date(y, mo - 1, da) - new Date(t.getFullYear(), t.getMonth(), t.getDate())) / 864e5);
      left = d > 0 ? ` · ${T('باقي')} ${I.days(d)}` : d === 0 ? ` · ${T('اليوم الأخير')}` : ` · ${T('انتهت المدة')}`;
    }
    head.append(el('b', '', `${I.num(total)} / ${I.num(C.goal)} ${T(K.unit)}`),
      el('small', '', `${T(K.name)} · ${I.num(M.length)} ${T('مشاركاً')}${left}${total >= C.goal ? ` · ${T('بلغتم الهدف، تقبّل الله')}` : ''}`), prog);
    const share = el('div', 'kh-share');
    share.append(el('span', '', `${T('الرمز')}: `), el('b', 'kh-code', C.code), button('btn btn-quiet', T('مشاركة'), () => shareLink(C)));
    // Your count: quick steps, or a number typed in.
    const meRow = M.find((x) => x.user_id === uid);
    const yours = el('section', 'st-group');
    yours.append(el('h3', 'st-group-name', `${T('نصيبك')}: ${I.num(meRow ? meRow.progress : 0)}`));
    const add = el('div', 'ch-add');
    K.steps.forEach((n) => add.append(button('btn btn-primary ch-step', `+${I.num(n)}`, () => bump(n))));
    const num = el('input', 'ls-search ch-num'); num.type = 'number'; num.min = '1'; num.inputMode = 'numeric'; num.placeholder = T('عدد آخر');
    num.setAttribute('aria-label', T('عدد آخر'));
    add.append(num, button('btn btn-quiet', T('أضف'), () => { const n = Math.round(Number(num.value)); if (n > 0) { bump(n); num.value = ''; } }));
    if (C.kind === 'pages' && window.noonQuran) {
      const p = window.noonQuran.progress().today;
      if (p > 0) add.append(button('link-btn', `${T('صفحات وردك اليوم')} (${I.num(p)})`, () => bump(p)));
    }
    if (meRow && meRow.progress > 0) add.append(button('link-btn', T('تراجع عن آخر إضافة'), () => undo()));
    yours.append(add);
    // Everyone, most first.
    const board = el('section', 'st-group');
    board.append(el('h3', 'st-group-name', T('المشاركون')));
    const ul = el('ul', 'habit-bars ch-board');
    const top = Math.max(1, ...M.map((x) => x.progress));
    M.forEach((x) => {
      const li = el('li', x.user_id === uid ? 'is-me' : '');
      const b = el('span', 'habit-bar'); const f = el('i'); f.style.width = `${(x.progress / top) * 100}%`; b.append(f);
      li.append(el('span', 'habit-bar-name', x.user_id === uid ? `${x.name} (${T('أنت')})` : x.name), b, el('span', 'habit-bar-val', I.num(x.progress)));
      ul.append(li);
    });
    board.append(ul);
    const foot = el('div', 'kh-foot');
    foot.append(button('btn btn-quiet', T('تحديث'), () => draw()), button('link-btn', T('كل التحديات'), () => { current = null; clearInterval(timer); home(); }));
    if (C.owner === uid) foot.append(button('link-btn danger', T('حذف التحدي'), async () => {
      if (!confirm(T('حذف هذا التحدي لكل المشاركين؟'))) return;
      const { error } = await db().from('challenge').delete().eq('id', C.id);
      if (error) return fail(error);
      current = null; home();
    }));
    else foot.append(button('link-btn danger', T('غادر التحدي'), async () => {
      if (!confirm(T('مغادرة هذا التحدي؟ سيُحذف نصيبك منه.'))) return;
      const { error } = await db().from('challenge_member').delete().eq('challenge', C.id).eq('user_id', uid);
      if (error) return fail(error);
      current = null; home();
    }));
    body.replaceChildren(head, share, yours, board, foot);
  }
  let undoStack = [];
  async function setMine(value, note) {
    const uid = me().id, row = last.M.find((x) => x.user_id === uid);
    if (!row) return;
    const before = row.progress;
    row.progress = Math.max(0, Math.min(10000000, value));
    last.M.sort((a, b) => b.progress - a.progress);
    paint();
    const { error } = await db().from('challenge_member').update({ progress: row.progress, updated_at: new Date().toISOString() })
      .eq('challenge', last.C.id).eq('user_id', uid);
    if (error) { row.progress = before; paint(); return fail(error); }
    if (note) window.noonBuzz && window.noonBuzz(12);
  }
  function bump(n) {
    const row = last.M.find((x) => x.user_id === me().id);
    if (!row) return;
    undoStack.push(row.progress);
    setMine(row.progress + n, true);
  }
  function undo() {
    const row = last.M.find((x) => x.user_id === me().id);
    if (!row) return;
    setMine(undoStack.length ? undoStack.pop() : 0);
  }
  async function shareLink(C) {
    const K = KINDS[C.kind] || KINDS.tasbih;
    const text = `${T('شاركنا تحدي')} «${C.title}»: ${I.num(C.goal)} ${T(K.unit)}. ${T('الرمز')}: ${C.code}\n${SITE}?challenge=${C.code}`;
    const S = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Share;
    try {
      if (S) await S.share({ title: C.title, text });
      else if (navigator.share) await navigator.share({ title: C.title, text });
      else { await navigator.clipboard.writeText(text); toast(T('نُسخ الرابط والرمز.')); }
    } catch (_) { /* closed */ }
  }

  // A shared link opens the join form with its code.
  const code = new URLSearchParams(location.search).get('challenge');
  if (code && /^[A-Za-z0-9]{8}$/.test(code)) {
    const p = new URLSearchParams(location.search); p.delete('challenge');
    history.replaceState(null, '', location.pathname + (p.toString() ? '?' + p : '') + location.hash);
    setTimeout(() => show(code.toUpperCase()), 1500);
  }
  window.noonChallenge = { open: (c) => show(c), waiting };
})();
