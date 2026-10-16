// Commercial wholesale inquiry — client-side only, no database write or charge.
const WA_NUMBER = '5512983216069';
const ALLOWED_SECTORS = ['loja', 'decoracao', 'iluminacao', 'arquitetura', 'outros'];
const ALLOWED_FORMATS = ['conica', 'cilindrica', 'quadrada', 'variados', 'especial'];
const ALLOWED_MATERIALS = ['a_definir', 'tricoline', 'juta', 'outro'];
const SECTORS = { loja: 'Loja / revenda', decoracao: 'Decoração / interiores', iluminacao: 'Iluminação', arquitetura: 'Arquitetura / projetos', outros: 'Outro' };
const FORMATS = { conica: 'Cônicas', cilindrica: 'Cilíndricas / Drum', quadrada: 'Quadradas / piramidais', variados: 'Vários formatos', especial: 'Modelo especial' };
const MATERIALS = { a_definir: 'A definir', tricoline: 'Tricoline', juta: 'Juta', outro: 'Outro / sob consulta' };

function clean(value, limit=160, multiline=false) {
  const text=String(value??'').replace(/[^\P{C}\n\t]/gu,'').replace(/\r/g,'');
  return (multiline ? text.replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n') : text.replace(/\s+/g,' ')).trim().slice(0,limit);
}
export function validateWholesaleInquiry(raw) {
  const contact=clean(raw?.contact,90);
  const business=clean(raw?.business,100);
  const sector=clean(raw?.sector,30);
  const format=clean(raw?.format,30);
  const material=clean(raw?.material,30);
  const quantityNumber=Number(raw?.quantity);
  const quantity=Number.isSafeInteger(quantityNumber)&&quantityNumber>=1&&quantityNumber<=10000?quantityNumber:null;
  const dimensions=clean(raw?.dimensions,120);
  const cepRaw=clean(raw?.cep,12);
  const cep=cepRaw.replace(/\D/g,'');
  const notes=clean(raw?.notes,750,true);
  if (contact.length<2) return {ok:false,error:'Informe seu nome para a equipe identificar a solicitação.',field:'contact'};
  if (!ALLOWED_SECTORS.includes(sector)) return {ok:false,error:'Selecione a área do seu projeto.',field:'sector'};
  if (!ALLOWED_FORMATS.includes(format)) return {ok:false,error:'Selecione um formato de cúpula.',field:'format'};
  if (!quantity) return {ok:false,error:'Informe uma quantidade de 1 a 10.000 peças.',field:'quantity'};
  if (!ALLOWED_MATERIALS.includes(material)) return {ok:false,error:'Selecione uma opção de material.',field:'material'};
  if (cepRaw && !/^\d{5}-?\d{3}$/.test(cepRaw)) return {ok:false,error:'Confira o CEP: são 8 números, com ou sem hífen.',field:'cep'};
  return {ok:true,value:{contact,business,sector,format,quantity,material,dimensions,cep,notes}};
}

export function createWhatsAppInquiry(raw) {
  const checked=validateWholesaleInquiry(raw);
  if (!checked.ok) return checked;
  const v=checked.value;
  const lines=[
    'Olá! Gostaria de solicitar uma avaliação comercial de cúpulas em quantidade.',
    '',
    'Contato: '+v.contact,
    ...(v.business?['Empresa / projeto: '+v.business]:[]),
    'Área: '+SECTORS[v.sector],
    'Formato: '+FORMATS[v.format],
    'Quantidade aproximada: '+v.quantity+' peça(s)',
    'Material: '+MATERIALS[v.material],
    'Medidas: '+(v.dimensions||'A confirmar com a equipe'),
    'CEP de destino: '+(v.cep?v.cep.slice(0,5)+'-'+v.cep.slice(5):'A informar'),
    ...(v.notes?['','Detalhes: '+v.notes]:[]),
    '',
    'Se possível, orientem sobre viabilidade, condições comerciais, prazo e entrega. Obrigado!'
  ];
  const message=lines.join('\n');
  return {ok:true,message,url:'https://wa.me/'+WA_NUMBER+'?text='+encodeURIComponent(message)};
}

function initializeWholesaleForm() {
  const form=document.querySelector('[data-wholesale-form]');
  if(!form) return;
  const feedback=form.querySelector('[data-wholesale-feedback]');
  const fallback=form.querySelector('[data-wholesale-fallback]');
  form.addEventListener('submit',(event)=>{
    event.preventDefault();
    if (!form.reportValidity()) return;
    const data=Object.fromEntries(new FormData(form).entries());
    const result=createWhatsAppInquiry(data);
    if (!result.ok) {
      feedback.textContent=result.error;
      feedback.dataset.state='error';
      const control=form.elements.namedItem(result.field);
      control?.focus();
      return;
    }
    fallback.href=result.url;
    fallback.hidden=false;
    feedback.textContent='Sua mensagem foi preparada. Confira os dados no WhatsApp e toque em enviar para falar com a equipe.';
    feedback.dataset.state='ready';
    // Called only in the user's submit interaction; never opens messaging on load.
    window.open(result.url,'_blank','noopener,noreferrer');
  });
}
if (typeof document!=='undefined') {
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initializeWholesaleForm,{once:true});
  else initializeWholesaleForm();
}
