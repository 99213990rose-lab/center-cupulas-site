(() => {
  'use strict';
  const button = document.querySelector('[data-kit-buy]');
  if (!button) return;
  button.addEventListener('click',()=>{
    const cart=window.CenterCupulasCart;
    if(!cart){window.location.assign('carrinho.html');return;}
    const match=cart.read().find(item =>
      ['conica','conica_redonda'].includes(item.format) &&
      String(item.material).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()==='algodao' &&
      String(item.color).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()==='bege' &&
      Number(item.top)===12 && Number(item.bottom)===20 && Number(item.height)===20 &&
      !String(item.observations||'').trim()
    );
    if(match){
      if(Number(match.quantity)<2)cart.setQuantity(match.id,2);
    } else {
      cart.add({format:'conica',format_label:'Cônica / Empire',material:'Algodão',color:'Bege',
        top:12,bottom:20,height:20,quantity:2,reference:null,observations:'',
        preview_image:'assets/catalogo/variants/conica-tricoline-bege.webp'});
    }
    window.CenterCupulas?.sendWebEvent?.('cart_add',{placement:'home_kit_99_90',ctaText:'aproveitar_agora'});
    window.location.assign('carrinho.html#pedido');
  });
})();
