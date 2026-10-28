(() => {
  'use strict';
  const now = Date.now();
  const active = now >= Date.parse('2026-10-28T00:00:00-03:00') && now < Date.parse('2026-11-01T00:00:00-03:00');
  document.querySelectorAll('[data-promo-cupulas]').forEach(el => { el.hidden = !active; });
})();
