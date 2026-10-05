(() => {
  'use strict';

  const KEY = 'centerCupulasCartV1';

  const safeParse = (value) => {
    try {
      const parsed = JSON.parse(value || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const read = () => safeParse(localStorage.getItem(KEY));

  const write = (items) => {
    const clean = Array.isArray(items) ? items.slice(0, 20) : [];
    localStorage.setItem(KEY, JSON.stringify(clean));
    updateBadges(clean);
    window.dispatchEvent(new CustomEvent('center-cart-change', { detail: clean }));
    return clean;
  };

  const makeId = () => (crypto.randomUUID ? crypto.randomUUID() : 'cart-' + Date.now() + '-' + Math.random().toString(16).slice(2));

  const add = (item) => {
    const items = read();
    const normalized = {
      id: item.id || makeId(),
      format: String(item.format || ''),
      format_label: String(item.format_label || item.format || ''),
      material: String(item.material || ''),
      color: String(item.color || ''),
      top: Number(item.top),
      bottom: Number(item.bottom),
      height: Number(item.height),
      quantity: Math.max(1, Math.floor(Number(item.quantity || 1))),
      reference: item.reference || null,
      observations: String(item.observations || ''),
      quote_snapshot: item.quote_snapshot || null,
      added_at: new Date().toISOString()
    };

    const same = items.find((x) =>
      x.format === normalized.format &&
      x.material === normalized.material &&
      x.color === normalized.color &&
      Number(x.top) === normalized.top &&
      Number(x.bottom) === normalized.bottom &&
      Number(x.height) === normalized.height &&
      String(x.reference || '') === String(normalized.reference || '') &&
      String(x.observations || '') === normalized.observations
    );

    if (same) same.quantity = Math.min(500, Math.max(1, Number(same.quantity || 1) + normalized.quantity));
    else items.push(normalized);

    return write(items);
  };

  const remove = (id) => write(read().filter((item) => item.id !== id));

  const setQuantity = (id, quantity) => {
    const q = Math.max(1, Math.min(500, Math.floor(Number(quantity || 1))));
    return write(read().map((item) => item.id === id ? { ...item, quantity: q } : item));
  };

  const clear = () => write([]);

  const count = (items = read()) => items.reduce((sum, item) => sum + Math.max(1, Number(item.quantity || 1)), 0);

  const updateBadges = (items = read()) => {
    const total = count(items);
    document.querySelectorAll('[data-cart-count]').forEach((el) => {
      el.textContent = String(total);
      el.hidden = total === 0;
    });
    document.querySelectorAll('[data-cart-label]').forEach((el) => {
      el.textContent = total ? 'Pedido (' + total + ')' : 'Pedido';
    });
  };

  window.CenterCupulasCart = { read, write, add, remove, setQuantity, clear, count, updateBadges };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => updateBadges());
  else updateBadges();

  window.addEventListener('storage', (event) => {
    if (event.key === KEY) updateBadges();
  });
})();