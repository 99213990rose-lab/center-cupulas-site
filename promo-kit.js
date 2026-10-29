import {initialSessionStart,sessionPhase} from './promo-session.mjs';
(() => {
  'use strict';
  const KEY = 'centerCupulasKitSessionV1';
  const area = document.querySelector('[data-home-kit-promo]');
  const button = document.querySelector('[data-kit-buy]');
  const countdown = document.querySelector('[data-kit-countdown]');
  const timerLabel = document.querySelector('[data-kit-timer-label]');
  const note = document.querySelector('[data-kit-session-note]');
  if (!area || !button || !countdown || !timerLabel || !note) return;
  area.hidden = false; // Campanha sem prazo de encerramento.
  let startedAt = null;
  try {
    const now=Date.now();
    startedAt = initialSessionStart(localStorage.getItem(KEY),now);
    localStorage.setItem(KEY,String(startedAt));
  } catch { /* Sem armazenamento confiável, não exibir uma contagem potencialmente enganosa. */ }
  const pair = value => String(value).padStart(2,'0');
  const clock = () => {
    if (startedAt === null) {
      timerLabel.textContent='Oferta permanente';
      countdown.hidden=true;
      note.textContent='Aproveite o kit diretamente no site.';
      return;
    }
    const data = sessionPhase(startedAt, Date.now());
    if (data.phase === 'active') {
      const h=Math.floor(data.seconds/3600),m=Math.floor((data.seconds%3600)/60),s=data.seconds%60;
      timerLabel.textContent='Tempo desta sessão:';
      countdown.textContent=pair(h)+':'+pair(m)+':'+pair(s);
      note.textContent='A promoção continua disponível após a sessão.';
    } else if (data.phase === 'cooldown') {
      timerLabel.textContent='Sessão concluída:';
      countdown.textContent='00:00:00';
      note.textContent='Nova sessão somente após 3 horas. O kit continua disponível.';
    } else {
      timerLabel.textContent='Sessão concluída';
      countdown.textContent='00:00:00';
      note.textContent='Uma nova sessão estará disponível quando você voltar à página.';
    }
  };
  clock();
  window.setInterval(clock,1000);
  window.addEventListener('storage',(event)=>{
    if(event.key!==KEY)return;
    const value=Number(event.newValue);
    if(Number.isFinite(value)&&value>0){startedAt=value;clock();}
  });
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
