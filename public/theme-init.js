// Applies the saved theme before first paint to avoid a flash. Kept as a same-origin file so the CSP can stay script-src 'self'.
(function () {
  try {
    var s = JSON.parse(localStorage.getItem('relata:settings:v1') || '{}');
    var pref = s.theme === 'light' || s.theme === 'dark' ? s.theme : 'system';
    var dark = pref === 'dark' || (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    var el = document.documentElement;
    el.dataset.theme = dark ? 'dark' : 'light';
    if (s.reducedMotion) el.dataset.motion = 'reduce';
  } catch (e) {
    document.documentElement.dataset.theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
})();
