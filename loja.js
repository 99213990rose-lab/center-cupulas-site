(() => {
 'use strict';
 // Curadoria de referências cujas dimensões foram conferidas com a base.
 // Nenhum preço é hard-coded: a API comercial calcula o preço em tempo real.
 const API='https://nygjkojgvbdhemvfsqug.supabase.co/functions/v1/public-pricing-quote';
 const products=[
  {id:'conica-20-35-25',ref:'12',name:'Cúpula cônica bege',format:'conica',label:'Cônica / Empire',top:20,bottom:35,height:25,material:'Algodão',color:'Bege',image:'conica-tricoline-bege.webp'},
  {id:'drum-25-25-15',ref:'36',name:'Cúpula cilíndrica off-white',format:'drum',label:'Drum / Cilíndrica',top:25,bottom:25,height:15,material:'Algodão',color:'Off White',image:'drum-tricoline-offwhite.webp'},
  {id:'piramidal-15-30-20',ref:'28',name:'Cúpula piramidal quadrada branca',format:'piramidal-quadrada',label:'Piramidal quadrada',top:15,bottom:30,height:20,material:'Algodão',color:'Branco',image:'piramidal-quadrada-tricoline-branco.webp'},
  {id:'drum-40-40-25',ref:'38',name:'Cúpula cilíndrica bege',format:'drum',label:'Drum / Cilíndrica',top:40,bottom:40,height:25,material:'Algodão',color:'Bege',image:'drum-tricoline-bege.webp'},
  {id:'conica-10-35-23',ref:'14',name:'Cúpula cônica off-white',format:'conica',label:'Cônica / Empire',top:10,bottom:35,height:23,material:'Algodão',color:'Off White',image:'conica-tricoline-offwhite.webp'},
  {id:'drum-45-45-30',ref:'39',name:'Cúpula cilíndrica preta',format:'drum',label:'Drum / Cilíndrica',top:45,bottom:45,height:30,material:'Algodão',color:'Preto',image:'drum-tricoline-preto.webp'},
  {id:'conica-27-35-26',ref:'33',name:'Cúpula cônica branca',format:'conica',label:'Cônica / Empire',top:27,bottom:35,height:26,material:'Algodão',color:'Branco',image:'conica-tricoline-branco.webp'},
  {id:'bell-18-45-31',ref:'06',name:'Cúpula estilo sino off-white',format:'bell',label:'Bell / Sino',top:18,bottom:45,height:31,material:'Algodão',color:'Off White',image:'bell-tricoline-offwhite.webp'}
 ];
 const detailUrls={"conica-20-35-25":"cupula-conica-bege-20x35x25.html","drum-25-25-15":"cupula-cilindrica-off-white-25x25x15.html","piramidal-15-30-20":"cupula-piramidal-quadrada-branca-15x30x20.html","drum-40-40-25":"cupula-cilindrica-bege-40x40x25.html","conica-10-35-23":"cupula-conica-off-white-10x35x23.html","drum-45-45-30":"cupula-cilindrica-preta-45x45x30.html","conica-27-35-26":"cupula-conica-branca-27x35x26.html","bell-18-45-31":"cupula-sino-off-white-18x45x31.html"};
 const cash=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
 const searchQuery=(new URLSearchParams(window.location.search).get('q')||'').trim().slice(0,90);
 const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/×/g,'x').replace(/[^a-z0-9]+/g,' ').trim();
 const terms=normalize(searchQuery).split(/\s+/).filter(Boolean);
 const searchMatches=p=>{
   if(!terms.length)return true;
   const info=normalize([p.name,p.label,p.format,p.color,p.material,p.ref,
     p.top+'x'+p.bottom+'x'+p.height,p.top+' '+p.bottom+' '+p.height,'cupula abajur luminaria'].join(' '));
   return terms.every(term=>info.includes(term));
 };
 const shopInput=document.querySelector('[data-shop-search]');
 if(shopInput)shopInput.value=searchQuery;
 const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const custom=p=>'modelos.html?formato='+encodeURIComponent(p.format)+'#monte';
 function createCard(p) {
  const el=document.createElement('article');
  el.className='store-card'; el.id=p.id;
  const size=p.top+' × '+p.bottom+' × '+p.height+' cm';
  el.innerHTML=
   '<a class="store-card__image" href="'+detailUrls[p.id]+'" aria-label="Ver detalhes de '+escape(p.name)+'">'+
     '<img src="assets/catalogo/variants/'+p.image+'" width="600" height="600" loading="lazy" decoding="async" alt="Referência visual de '+escape(p.name)+'"><span>Referência visual</span></a>'+
   '<div class="store-card__body"><p class="store-card__type">'+escape(p.label)+' · REF. '+p.ref+'</p>'+
     '<h3><a href="'+detailUrls[p.id]+'">'+escape(p.name)+'</a></h3><p class="store-card__size">'+size+'</p>'+
     '<p class="store-card__fabric">'+escape(p.material+' · '+p.color)+'</p>'+
     '<p class="store-card__price" data-price role="status" aria-live="polite">Consultando preço…</p>'+
     '<p class="store-card__explain">Frete no carrinho</p>'+
     '<button class="button button--dark store-card__buy" type="button" disabled data-buy>Verificando preço…</button>'+(p.id==='conica-27-35-26'?'<button class="button button--gold store-card__buy" type="button" disabled data-buy-kit>Adicionar kit · 2 por R$ 120</button>':'')+
     '<a class="store-card__custom" href="'+custom(p)+'">Personalizar ↗</a></div>';
  return el;
 }
 async function quoteOne(p,el) {
  const price=el.querySelector('[data-price]'),button=el.querySelector('[data-buy]'),kitButton=el.querySelector('[data-buy-kit]');
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
    button.disabled=false;button.textContent='Adicionar →';
     if(kitButton){
       kitButton.disabled=false;
       kitButton.addEventListener('click',()=>{
         const cart=window.CenterCupulasCart;
         if(!cart)return;
         cart.add({format:p.format,format_label:p.label,material:p.material,color:p.color,
           top:p.top,bottom:p.bottom,height:p.height,quantity:2,reference:p.ref,
           observations:'',preview_image:'assets/catalogo/variants/'+p.image});
         window.location.assign('carrinho.html');
       },{once:true});
     }
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
  const selected=host.dataset.limit?products.slice(0,limit):products.filter(searchMatches);
  const resultText=document.querySelector('[data-store-results]');
  if(resultText&&searchQuery)resultText.textContent=selected.length+
    (selected.length===1?' resultado':' resultados')+' para “'+searchQuery+'”.';
  if(!selected.length){
    host.innerHTML='<div class="store-empty"><p>Nenhum produto encontrado.</p>'+
      '<a href="modelos.html#monte">Fazer sob medida</a> · <a href="loja.html">Limpar busca</a></div>';
    continue;
  }
  const cards=selected.map(createCard);
  host.replaceChildren(...cards);
  (async()=>{for(let i=0;i<cards.length;i+=3)
    await Promise.all(cards.slice(i,i+3).map((c,j)=>quoteOne(selected[i+j],c)));
  })();
 }
})();