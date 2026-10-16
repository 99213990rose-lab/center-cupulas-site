// Support contact, not live tracking. No customer data sent before user opens WhatsApp.
const BASE = 'https://wa.me/5512983216069';
const TOPICS = {
 andamento: 'Andamento da produção',
 entrega: 'Entrega ou frete',
 alteracao: 'Conferência ou alteração do pedido',
 pos_venda: 'Pós-venda, troca ou divergência',
 outros: 'Outra dúvida sobre um pedido'
};
export function createOrderSupportMessage(data) {
  const topic=String(data?.topic||'');
  const rawCode=String(data?.code??'').trim();
  if (!Object.hasOwn(TOPICS,topic)) return {ok:false,error:'Escolha o assunto da consulta.',field:'topic'};
  if (rawCode && !/^[a-zA-Z0-9_-]{4,50}$/.test(rawCode)) {
    return {ok:false,error:'Confira o código: use apenas letras, números, traços ou sublinhados.',field:'code'};
  }
  const code=rawCode?rawCode.toUpperCase():'ainda não tenho o código';
  const message=[
    'Olá! Gostaria de consultar a Center Cúpulas sobre meu pedido.',
    'Assunto: '+TOPICS[topic],
    'Código do pedido ou orçamento: '+code,
    'Podem me orientar sobre os próximos passos? Obrigado!'
  ].join('\n');
  return {ok:true,message,url:BASE+'?text='+encodeURIComponent(message)};
}

function setupOrderHelp(){
  const form=document.querySelector('[data-order-help-form]');
  if(!form)return;
  const feedback=form.querySelector('[data-order-help-feedback]');
  const link=form.querySelector('[data-order-help-link]');
  form.addEventListener('submit',(event)=>{
    event.preventDefault();
    if(!form.reportValidity())return;
    const raw=Object.fromEntries(new FormData(form).entries());
    const result=createOrderSupportMessage(raw);
    if(!result.ok){
      feedback.textContent=result.error;
      feedback.dataset.state='error';
      form.elements.namedItem(result.field)?.focus();
      return;
    }
    link.href=result.url;
    link.hidden=false;
    feedback.dataset.state='ready';
    feedback.textContent='Mensagem preparada. Confira os detalhes e envie no WhatsApp para receber atendimento da equipe.';
    window.open(result.url,'_blank','noopener,noreferrer');
  });
}
if(typeof document!=='undefined'){
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setupOrderHelp,{once:true});
  else setupOrderHelp();
}
