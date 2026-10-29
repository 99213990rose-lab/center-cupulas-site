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

  const isLegacyPromotion = item => !item.kind && !item.reference && !String(item.observations||'').trim() &&
    ['conica','conica_redonda'].includes(String(item.format)) &&
    String(item.material||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()==='algodao' &&
    String(item.color||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()==='bege' &&
    Number(item.top)===12 && Number(item.bottom)===20 && Number(item.height)===20;

  const read = () => {
    const current = safeParse(localStorage.getItem(KEY));
    let needsMigration = false;
    const normalized = current.map(item => {
      if (!isLegacyPromotion(item)) return item;
      needsMigration = true;
      const units = Math.min(500,Math.max(2,Math.ceil(Number(item.quantity||2)/2)*2));
      return {...item,kind:'promo_kit',quantity:units,quote_snapshot:null};
    });
    if (needsMigration) localStorage.setItem(KEY,JSON.stringify(normalized));
    return normalized;
  };

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
      quantity: item.kind==='promo_kit'
        ? Math.min(500,Math.max(2,Math.ceil(Number(item.quantity||2)/2)*2))
        : Math.max(1,Math.floor(Number(item.quantity||1))),
      kind: item.kind==='promo_kit'?'promo_kit':null,
      reference: item.reference || null,
      observations: String(item.observations || ''),
      quote_snapshot: item.quote_snapshot || null,
      // Local cart presentation only; reject external URLs and arbitrary file paths.
      preview_image: /^assets\/catalogo\/variants\/[a-z0-9-]+\.webp$/.test(String(item.preview_image || '')) ? String(item.preview_image) : '',
      added_at: new Date().toISOString()
    };

    const same = items.find((x) =>
      (x.kind||null) === normalized.kind &&
      x.format === normalized.format &&
      x.material === normalized.material &&
      x.color === normalized.color &&
      Number(x.top) === normalized.top &&
      Number(x.bottom) === normalized.bottom &&
      Number(x.height) === normalized.height &&
      String(x.reference || '') === String(normalized.reference || '') &&
      String(x.observations || '') === normalized.observations
    );

    if (same) {
      same.quantity = Math.min(500, Math.max(1, Number(same.quantity || 1) + normalized.quantity));
      if (normalized.preview_image) same.preview_image = normalized.preview_image;
    } else items.push(normalized);

    return write(items);
  };

  const remove = (id) => write(read().filter((item) => item.id !== id));

  const setQuantity = (id, quantity) => {
    return write(read().map(item => {
      if (item.id !== id) return item;
      const isKit = item.kind === 'promo_kit';
      const count = Math.min(isKit?250:500,Math.max(1,Math.floor(Number(quantity)||1)));
      return {...item,quantity:isKit?2*count:count,quote_snapshot:null};
    }));
  };

  const clear = () => write([]);

  // Show retail units in the header: one promotional pair is one kit, not two independent products.
  const count = (items = read()) => items.reduce((sum, item) => {
    const pieces = Math.max(1, Math.floor(Number(item.quantity || 1)));
    return sum + (item.kind === 'promo_kit' ? Math.max(1, Math.floor(pieces / 2)) : pieces);
  }, 0);

  const updateBadges = (items = read()) => {
    const total = count(items);
    document.querySelectorAll('[data-cart-count]').forEach((el) => {
      el.textContent = String(total);
      el.hidden = total === 0;
    });
    document.querySelectorAll('[data-cart-label]').forEach((el) => {
      el.textContent = total ? 'Pedido (' + total + ')' : (el.dataset.cartEmptyLabel || 'Pedido');
    });
    // On the catalogue, an empty cart should invite configuration, not send shoppers to an empty page.
    document.querySelectorAll('a[data-cart-target-when-empty]').forEach((link) => {
      link.setAttribute('href', total ? (link.dataset.cartTargetWithItems || 'carrinho.html') : link.dataset.cartTargetWhenEmpty);
    });
  };

  window.CenterCupulasCart = { read, write, add, remove, setQuantity, clear, count, updateBadges };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => updateBadges());
  else updateBadges();

  window.addEventListener('storage', (event) => {
    if (event.key === KEY) updateBadges();
  });
})();