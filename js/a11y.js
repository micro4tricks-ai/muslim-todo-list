// ---------- Ease of use: stronger contrast, less motion, vibration ----------
// Kept on this device only (not synced): what suits one screen or one hand may not suit another.
// Loaded early, so the page draws the right way from the start. Settings › «سهولة الاستخدام».
(() => {
  'use strict';
  const KEY = 'noon-a11y';
  const DEF = { contrast: false, motion: false, haptics: true };
  let A = { ...DEF };
  try {
    const v = JSON.parse(localStorage.getItem(KEY));
    if (v && typeof v === 'object') ['contrast', 'motion', 'haptics'].forEach((k) => { if (typeof v[k] === 'boolean') A[k] = v[k]; });
  } catch (_) {}
  function apply() {
    const r = document.documentElement;
    r.toggleAttribute('data-contrast', A.contrast);
    r.toggleAttribute('data-calm', A.motion);
    // The vibration helper (js/views.js) reads this key.
    try { localStorage.setItem('noon-haptics', A.haptics ? '1' : '0'); } catch (_) {}
  }
  apply();
  window.noonA11y = {
    get: () => ({ ...A }),
    set(k, v) {
      if (!(k in DEF)) return;
      A[k] = !!v;
      try { localStorage.setItem(KEY, JSON.stringify(A)); } catch (_) {}
      apply();
    },
  };
})();
