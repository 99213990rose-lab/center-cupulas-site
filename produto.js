(() => {
 'use strict';
 const raw=document.getElementById('product-config')?.textContent;
 let p;try{p=JSON.parse(raw||'null')}catch{return}
 if(!p||!['conica','drum','piramidal-quadrada','bell'].includes(p.format))return;
 const price=document.querySelector('[data-pdp-price]'),status=document.querySelector('[data-pdp-status]');
 const buy=document.querySelector('[data-pdp-buy]'),quantity=document.querySelector('[data-pdp-qty]');
 if(!price||!status||!buy||!quantity)return;
 const API='https://nygjkojgvbdhemvfsqug.supabase.co/functions/v1/public-pricing-quote';
 const money=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
 let seq=0,request=null,timer=null,current=null;
 const qty=()=>{const n=Number(quantity.value);return Number.isSafeInteger(n)&&n>=1&&n<=500?n:null};
 const quote=async()=>{
   const id=++seq;if(request)request.abort();request=new AbortController();
   current=null;buy.disabled=true;buy.textContent='Consultando preço…';
   const count=qty();
   if(!count){price.textContent='Quantidade inválida';status.textContent='Escolha de 1 a 500 unidades.';return}
   price.textContent='Calculando…';status.textContent='Calculando valor atualizado…';
   const controller=request,timeout=setTimeout(()=>controller.abort(),9000);
   try{
     const r=await fetch(API,{method:'POST',credentials:'omit',signal:controller.signal,
       headers:{'Content-Type':'application/json'},
       body:JSON.stringify({format:p.format,material:p.material,top:p.top,bottom:p.bottom,height:p.height,quantity:count})});
     const q=r.ok?await r.json():null;
     if(id!==seq)return;
     if(q?.status!=='estimate'||q?.confidence!=='high'||q?.exact_reference!==true||
        Number(q.quantity)!==count||!Number.isFinite(Number(q.total))||Number(q.total)<=0||
        !Number.isFinite(Number(q.unit_price))||Number(q.unit_price)<=0)throw Error('quote_unavailable');
     current={data:q,count};
     price.textContent=money.format(Number(q.total));
     status.textContent=(count===1?'Total de 1 unidade':'Total de '+count+' unidades')+' · frete no carrinho.';
     buy.disabled=false;buy.textContent='Adicionar ao carrinho →';
   }catch{
     if(id!==seq)return;
     current=null;buy.disabled=true;buy.textContent='Preço sob consulta';
     price.textContent='Preço sob consulta';
     status.textContent='Para esta configuração ou quantidade, utilize a cotação personalizada.';
   }finally{clearTimeout(timeout)}
 };
 quantity.addEventListener('input',()=>{
   ++seq;if(request)request.abort();clearTimeout(timer);
   current=null;buy.disabled=true;price.textContent='Calculando…';buy.textContent='Atualizando preço…';
   timer=setTimeout(quote,300);
 });
 buy.addEventListener('click',()=>{
   const cart=window.CenterCupulasCart;if(!cart||!current||qty()!==current.count)return;
   const q=current.data;
   cart.add({format:p.format,format_label:p.label,material:p.material,color:p.color,
     top:p.top,bottom:p.bottom,height:p.height,quantity:current.count,reference:p.ref,
     observations:'',preview_image:'assets/catalogo/variants/'+p.image,
     quote_snapshot:{unit_price:q.unit_price,total:q.total,confidence:q.confidence,
       exact_reference:q.exact_reference,engine_version:q.engine_version}});
   window.CenterCupulas?.sendWebEvent?.('cart_add',{placement:'product_detail',ctaText:p.id});
   window.location.assign('carrinho.html');
 });
 void quote();
})();
