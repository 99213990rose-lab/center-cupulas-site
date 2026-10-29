(() => {
  'use strict';
  const button=document.querySelector('[data-kit-buy]');
  const dialog=document.querySelector('[data-kit-dialog]');
  const form=dialog?.querySelector('[data-kit-form]');
  const material=dialog?.querySelector('[data-kit-material]');
  const color=dialog?.querySelector('[data-kit-color]');
  const colorWrap=dialog?.querySelector('[data-kit-cotton-color]');
  const naturalNote=dialog?.querySelector('[data-kit-natural-note]');
  const price=dialog?.querySelector('[data-kit-selected-price]');
  if(!button || !dialog || !form || !material || !color || !colorWrap || !naturalNote || !price) return;

  const choices={algodao:{label:'Algodão',price:99.90},linho:{label:'Linho',price:120},juta:{label:'Juta',price:120}};
  const colors=['Bege','Off-white','Branco','Preto','Marrom'];
  const images={
    'Bege':'assets/catalogo/variants/conica-tricoline-bege.webp',
    'Off-white':'assets/catalogo/variants/conica-tricoline-offwhite.webp',
    'Branco':'assets/catalogo/variants/conica-tricoline-branco.webp',
    'Preto':'assets/catalogo/variants/conica-tricoline-preto.webp'
  };
  const money=value=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(value);
  const updateSelection=()=>{
    const isCotton=material.value==='algodao';
    colorWrap.hidden=!isCotton;
    color.disabled=!isCotton;
    naturalNote.hidden=isCotton;
    price.textContent=money(choices[material.value]?.price??99.90);
  };
  material.addEventListener('change',updateSelection);
  button.addEventListener('click',()=>{updateSelection();dialog.showModal();});
  dialog.querySelector('[data-kit-close]')?.addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
  form.addEventListener('submit',event=>{
    event.preventDefault();
    const choice=choices[material.value];
    if(!choice || (material.value==='algodao' && !colors.includes(color.value)))return;
    const selectedColor=material.value==='algodao'?color.value:'Natural';
    const cart=window.CenterCupulasCart;
    if(!cart)return;
    const existing=cart.read().some(item=>
      item.kind==='promo_kit' && item.format==='conica' &&
      item.material===choice.label && item.color===selectedColor &&
      Number(item.top)===12 && Number(item.bottom)===20 && Number(item.height)===20
    );
    if(!existing){
      cart.add({
        kind:'promo_kit',format:'conica',format_label:'Kit 2 cúpulas cônicas',
        material:choice.label,color:selectedColor,
        top:12,bottom:20,height:20,quantity:2,reference:null,observations:'',
        // Fotos específicas de linho e algodão marrom ainda não estão no catálogo.
        preview_image:material.value==='juta'?'assets/catalogo/variants/conica-juta-natural.webp'
          :material.value==='algodao'?(images[selectedColor]||''):''
      });
    }
    dialog.close();
    window.CenterCupulas?.sendWebEvent?.('cart_add',{placement:'home_kit_99_90',ctaText:'escolher_tecido_e_comprar'});
    window.location.assign('carrinho.html#pedido');
  });
})();
