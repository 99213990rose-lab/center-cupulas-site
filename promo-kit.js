(() => {
  'use strict';
  const button = document.querySelector('[data-kit-buy]');
  if (!button) return;
  button.addEventListener('click',()=>{
    const cart=window.CenterCupulasCart;
    if(!cart){window.location.assign('carrinho.html');return;}
    const match=cart.read().find(item => item.kind === 'promo_kit' &&
      Number(item.top)===12 && Number(item.bottom)===20 && Number(item.height)===20 &&
      String(item.material).toLowerCase()==='algodão' && String(item.color).toLowerCase()==='bege');
    if (!match) {
      cart.add({
        kind:'promo_kit',format:'conica',format_label:'Kit 2 cúpulas cônicas',
        material:'Algodão',color:'Bege',top:12,bottom:20,height:20,
        quantity:2,reference:null,observations:'',
        preview_image:'assets/catalogo/variants/conica-tricoline-bege.webp'
      });
    }
    window.CenterCupulas?.sendWebEvent?.('cart_add',{placement:'home_kit_99_90',ctaText:'aproveitar_agora'});
    window.location.assign('carrinho.html#pedido');
  });
})();
