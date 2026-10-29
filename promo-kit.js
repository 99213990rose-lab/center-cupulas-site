(() => {
  'use strict';
  const END_AT = Date.parse('2026-11-01T00:00:00-03:00'); // 31/10, 23:59:59 em Brasília
  const area = document.querySelector('[data-home-kit-promo]');
  const button = document.querySelector('[data-kit-buy]');
  const countdown = document.querySelector('[data-kit-countdown]');
  if (!area || !button || !countdown) return;
  const clock = () => {
    const seconds = Math.max(0, Math.ceil((END_AT - Date.now()) / 1000));
    if (seconds <= 0) {
      area.hidden = true;
      button.disabled = true;
      return false;
    }
    area.hidden = false;
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const rest = seconds % 60;
    const pair = value => String(value).padStart(2,'0');
    countdown.textContent = pair(days) + 'd ' + pair(hours) + 'h ' + pair(minutes) + 'm ' + pair(rest) + 's';
    return true;
  };
  clock();
  window.setInterval(clock, 1000); // data real de encerramento, não reinicia em visitas.
  button.addEventListener('click', () => {
    if (!clock()) return;
    const cart = window.CenterCupulasCart;
    if (!cart) { window.location.assign('carrinho.html'); return; }
    const match = (cart.read() || []).find(item =>
      ['conica','conica_redonda'].includes(item.format) &&
      String(item.material).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()==='algodao' &&
      String(item.color).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()==='bege' &&
      Number(item.top)===12 && Number(item.bottom)===20 && Number(item.height)===20 &&
      !String(item.observations||'').trim()
    );
    if (match) {
      if (Number(match.quantity) < 2) cart.setQuantity(match.id,2);
    } else {
      cart.add({
        format:'conica',format_label:'Cônica / Empire',material:'Algodão',color:'Bege',
        top:12,bottom:20,height:20,quantity:2,reference:null,observations:'',
        preview_image:'assets/catalogo/variants/conica-tricoline-bege.webp'
      });
    }
    window.CenterCupulas?.sendWebEvent?.('cart_add',{placement:'home_kit_99_90',ctaText:'calculate_shipping'});
    window.location.assign('carrinho.html#pedido');
  });
})();