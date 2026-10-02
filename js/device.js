// ---------- In the Android app: keeping the adhan on time, and updating from inside the app ----------
// Many phones (Xiaomi, Oppo, Realme, Vivo, Huawei…) stop apps in the background to save battery, and the
// adhan with them. The adhan page shows what is allowed and leads to each setting (DevicePlugin), with the
// steps for the phone's maker; a short notice on opening asks once every few days until it is done.
(() => {
  'use strict';
  const D = window.noonNative && window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Device;
  if (!D) return;
  const { T, I, $, el, button, toast } = window.noonUI;

  const STEPS = [
    [/xiaomi|redmi|poco/, 'شاومي: افتح «التشغيل التلقائي» وفعّله للتطبيق، ومن «توفير البطارية» اختر «بلا قيود».'],
    [/oppo|realme|oneplus/, 'أوبو وريلمي وون بلس: فعّل «السماح بالتشغيل التلقائي» و«السماح بالنشاط في الخلفية»، ومن «استخدام البطارية» اسمح بالعمل في الخلفية.'],
    [/vivo|iqoo/, 'فيفو: فعّل «التشغيل التلقائي» و«السماح باستهلاك عالٍ للبطارية في الخلفية».'],
    [/huawei|honor/, 'هواوي وهونر: من «تشغيل التطبيقات» أوقف «الإدارة التلقائية» للتطبيق، وفعّل التشغيل التلقائي والتشغيل الثانوي والتشغيل في الخلفية.'],
    [/samsung/, 'سامسونج: من «البطارية» اختر «غير مقيّد»، وتأكد أن التطبيق ليس ضمن «التطبيقات النائمة».'],
    [/.*/, 'من إعدادات بطارية التطبيق اختر «غير مقيّد» أو «بلا قيود».']
  ];
  let st = null;
  const ok = () => st && st.batteryExempt && st.notifications && st.exactAlarms;
  async function refresh() {
    try { st = await D.status(); } catch (_) { st = null; }
    render();
    window.dispatchEvent(new CustomEvent('noon-device'));
    return st;
  }

  // ---- the card on the adhan page ----
  const box = el('div', 'rel');
  const pa = document.querySelector('.pa-box');
  if (pa) pa.prepend(box);
  function row(done, title, sub, label, run) {
    const r = el('div', `rel-row${done ? ' is-ok' : ''}`);
    const t = el('span', 'rel-text');
    t.append(el('b', '', T(title)), el('small', '', T(sub)));
    r.append(el('span', 'rel-mark', done ? '✓' : '!'), t);
    if (!done || label === 'افتح') r.append(button(done ? 'link-btn' : 'btn btn-primary rel-btn', T(label), async () => { await run(); }));
    return r;
  }
  function render() {
    if (!st) { box.replaceChildren(); return; }
    const head = el('div', 'rel-head');
    head.append(el('b', '', T(ok() ? 'الأذان سيصل في وقته' : 'اضبط هذه حتى يصل الأذان في وقته')),
      el('small', '', T('بعض الهواتف توقف التطبيقات في الخلفية لتوفير البطارية، فيتأخر الأذان أو لا يعمل.')));
    box.classList.toggle('is-ok', !!ok());
    const rows = [
      row(st.batteryExempt, 'العمل في الخلفية', st.batteryExempt ? 'مسموح: لا يوقفه توفير البطارية' : 'توفير البطارية قد يوقف الأذان', 'السماح', () => D.openBattery()),
      row(st.notifications, 'الإشعارات', st.notifications ? 'مسموحة' : 'متوقفة: لن يظهر الأذان ولا التذكيرات', 'السماح', () => D.openNotifications()),
      row(st.exactAlarms, 'المنبّه في الوقت بالضبط', st.exactAlarms ? 'مسموح' : 'غير مسموح: قد يتأخر الأذان دقائق', 'السماح', () => D.openExactAlarms())
    ];
    if (/xiaomi|redmi|poco|oppo|realme|oneplus|vivo|iqoo|huawei|honor|asus|letv|meizu/.test(st.maker)) {
      rows.push(row(false, 'التشغيل التلقائي', 'لا يستطيع التطبيق معرفته بنفسه؛ تأكد منه مرة واحدة', 'افتح', () => D.openAutostart()));
    }
    const steps = el('p', 'rel-steps', T((STEPS.find(([re]) => re.test(st.maker)) || STEPS[STEPS.length - 1])[1]));
    box.replaceChildren(head, ...rows, steps);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); }); // back from Android's settings

  // ---- a short notice on opening, at most every three days, until it is set ----
  const NUDGE = 'noon-device-nudge';
  refresh().then((s) => {
    if (!s || ok()) return;
    let last = 0;
    try { last = Number(localStorage.getItem(NUDGE)) || 0; } catch (_) {}
    if (Date.now() - last < 3 * 864e5) return;
    try { localStorage.setItem(NUDGE, String(Date.now())); } catch (_) {}
    setTimeout(() => toast(T('حتى يصل الأذان في وقته، اسمح للتطبيق بالعمل في الخلفية.'), {
      label: T('اضبط الآن'), sticky: true, run: () => window.noonSettings && window.noonSettings.open('adhan')
    }), 2500);
  });

  // ---- update from inside the app (Settings › About) ----
  let busy = false;
  async function update(msg) {
    if (busy) return;
    busy = true;
    const show = (t) => { if (msg) msg.textContent = t; };
    let sub = null;
    try {
      sub = await D.addListener('progress', (p) => show(p.percent >= 0 ? `${T('جارٍ التنزيل…')} ${I.num(p.percent)}${I.isEn ? '%' : '٪'}` : T('جارٍ التنزيل…')));
      show(T('جارٍ التنزيل…'));
      await D.update();
      show(T('اضغط «تثبيت» في الشاشة التي ظهرت.'));
    } catch (e) {
      show(T(e && e.code === 'PERMISSION'
        ? 'اسمح للتطبيق بتثبيت التحديثات من الشاشة التي فُتحت، ثم اضغط «تحديث الآن» مرة أخرى.'
        : 'تعذّر التحديث. تأكد من الاتصال بالإنترنت وحاول مرة أخرى.'));
    } finally {
      busy = false;
      if (sub && sub.remove) sub.remove();
    }
  }
  window.noonDevice = { refresh, status: () => st, ok, update };
})();
