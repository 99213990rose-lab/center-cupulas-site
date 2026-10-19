(() => {
 'use strict';
 // Curadoria de referências cujas dimensões foram conferidas com a base.
 // Nenhum preço é hard-coded: a API comercial calcula o preço em tempo real.
 const API='https://nygjkojgvbdhemvfsqug.supabase.co/functions/v1/public-pricing-quote';
 const products=[
  {id:'conica-20-35-25',ref:'12',name:'Cúpula cônica bege',format:'conica',label:'Cônica / Empire',top:20,bottom:35,height:25,material:'Tricoline',color:'Bege',image:'conica-tricoline-bege.webp'},
  {id:'drum-25-25-15',ref:'36',name:'Cúpula cilíndrica off-white',format:'drum',label:'Drum / Cilíndrica',top:25,bottom:25,height:15,material:'Tricoline',color:'Off White',image:'drum-tricoline-offwhite.webp'},
  {id:'piramidal-15-30-20',ref:'28',name:'Cúpula piramidal quadrada branca',format:'piramidal-quadrada',label:'Piramidal quadrada',top:15,bottom:30,height:20,material:'Tricoline',color:'Branco',image:'piramidal-quadrada-tricoline-branco.webp'},
  {id:'drum-40-40-25',ref:'38',name:'Cúpula cilíndrica bege',format:'drum',label:'Drum / Cilíndrica',top:40,bottom:40,height:25,material:'Tricoline',color:'Bege',image:'drum-tricoline-bege.webp'},
  {id:'conica-10-35-23',ref:'14',name:'Cúpula cônica off-white',format:'conica',label:'Cônica / Empire',top:10,bottom:35,height:23,material:'Tricoline',color:'Off White',image:'conica-tricoline-offwhite.webp'},
  {id:'drum-45-45-30',ref:'39',name:'Cúpula cilíndrica preta',format:'drum',label:'Drum / Cilíndrica',top:45,bottom:45,height:30,material:'Tricoline',color:'Preto',image:'drum-tricoline-preto.webp'},
  {id:'conica-27-35-26',ref:'33',name:'Cúpula cônica branca',format:'conica',label:'Cônica / Empire',top:27,bottom:35,height:26,material:'Tricoline',color:'Branco',image:'conica-tricoline-branco.webp'},
  {id:'bell-18-45-31',ref:'06',name:'Cúpula estilo sino gelo',format:'bell',label:'Bell / Sino',top:18,bottom:45,height:31,material:'Tricoline',color:'Gelo',image:'bell-tricoline-gelo.webp'}
 ];
 const cash=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
 const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const custom=p=>'modelos.html?formato='+encodeURIComponent(p.format)+'#monte';
 function createCard(p) {
  const el=document.createElement('article');
  el.className='store-card'; el.id=p.id;
  const size=p.top+' × '+p.bottom+' × '+p.height+' cm';
  el.innerHTML=
   '<a class="store-card__image" href="'+custom(p)+'" aria-label="Personalizar '+escape(p.name)+'">'+
     '<img src="assets/catalogo/variants/'+p.image+'" width="600" height="600" loading="lazy" decoding="async" alt="Referência visual de '+escape(p.name)+'"><span>Referência visual</span></a>'+
   '<div class="store-card__body"><p class="store-card__type">'+escape(p.label)+' · REF. '+p.ref+'</p>'+
     '<h3>'+escape(p.name)+'</h3><p class="store-card__size">'+size+'</p>'+
     '<p class="store-card__fabric">'+escape(p.material+' · '+p.color)+'</p>'+
     '<p class="store-card__price" data-price role="status" aria-live="polite">Consultando preço…</p>'+
     '<p class="store-card__explain">Valor para 1 unidade · Frete no carrinho</p>'+
     '<button class="button button--dark store-card__buy" type="button" disabled data-buy>Verificando preço…</button>'+
     '<a class="store-card__custom" href="'+custom(p)+'">Personalizar medidas ou tecido ↗</a></div>';
  return el;
 }
 async function quoteOne(p,el) {
  const price=el.querySelector('[data-price]'),button=el.querySelector('[data-buy]');
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),8500);
  try{
    const res=await fetch(API,{method:'POST',credentials:'omit',signal:controller.signal,
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({format:p.format,material:p.material,top:p.top,bottom:p.bottom,height:p.height,quantity:1})});
    const q=res.ok?await res.json():null;
    // Do not sell with uncertain estimates. Cart/checkout recalculates server-side.
    if(q?.status!=='estimate'||q?.confidence!=='high'||q?.exact_reference!==true||
       Number(q.quantity)!==1||!Number.isFinite(Number(q.total))||Number(q.total)<=0||
       !Number.isFinite(Number(q.unit_price))||Number(q.unit_price)<=0)throw Error('consult');
    price.textContent=cash.format(Number(q.total));
    button.disabled=false;button.textContent='Adicionar ao carrinho →';
    button.addEventListener('click',()=>{
      const cart=window.CenterCupulasCart;
      if(!cart){price.textContent='Atualize a página para comprar';button.disabled=true;return;}
      cart.add({format:p.format,format_label:p.label,material:p.material,color:p.color,
        top:p.top,bottom:p.bottom,height:p.height,quantity:1,reference:p.ref,
        observations:'',preview_image:'assets/catalogo/variants/'+p.image,
        quote_snapshot:{unit_price:q.unit_price,total:q.total,confidence:q.confidence,
          exact_reference:q.exact_reference,engine_version:q.engine_version}});
      window.CenterCupulas?.sendWebEvent?.('cart_add',{placement:'storefront',ctaText:'curated_product'});
      window.location.assign('carrinho.html');
    },{once:true});
  }catch{
    price.textContent='Preço sob consulta';
    button.disabled=true;button.textContent='Cotação personalizada';
    el.classList.add('store-card--consult');
  }finally{clearTimeout(timeout);}
 }
 for(const host of document.querySelectorAll('[data-store-products]')){
  const limit=Math.min(products.length,Math.max(1,Number(host.dataset.limit)||products.length));
  const selected=products.slice(0,limit);
  const cards=selected.map(createCard);
  host.replaceChildren(...cards);
  (async()=>{for(let i=0;i<cards.length;i+=3)
    await Promise.all(cards.slice(i,i+3).map((c,j)=>quoteOne(selected[i+j],c)));
  })();
 }
})();