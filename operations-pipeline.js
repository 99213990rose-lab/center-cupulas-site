(function(root){
  'use strict';
  // A read-only projection. Never treat "tracking recorded" as delivered.
  function hasTracking(shipping){
    if(!shipping||typeof shipping!=='object'||Array.isArray(shipping))return false;
    return typeof shipping.tracking_code==='string'&&shipping.tracking_code.trim().length>0||
      Array.isArray(shipping.tracking_codes)&&shipping.tracking_codes.some(x=>typeof x==='string'&&x.trim().length>0);
  }
  function buildPipeline(orders,jobs){
    const related=new Map();
    for(const job of Array.isArray(jobs)?jobs:[]){
      if(!job||typeof job.order_id!=='string')continue;
      if(!related.has(job.order_id))related.set(job.order_id,[]);
      related.get(job.order_id).push(job);
    }
    const counts={paid:0,missing_job:0,in_progress:0,ready:0,tracked:0};
    const rows=[];
    for(const order of Array.isArray(orders)?orders:[]){
      if(!order||typeof order.id!=='string')continue;
      const paid=order.payment_status==='paid';
      const matches=related.get(order.id)||[];
      const tracked=hasTracking(order.shipping);
      let stage='payment',productionLabel='—',nextAction='Conferir pagamento';
      let paymentLabel=paid?'Pago':order.payment_status==='partial'?'Parcial':'Pendente';
      if(paid){
        counts.paid++;
        if(!matches.length){
          stage='missing_job';productionLabel='Sem ficha';nextAction='Revisar criação da ficha';
          counts.missing_job++;
        }else if(matches.every(j=>['ready','completed'].includes(j.status))){
          stage='ready';productionLabel='Pronta / concluída';nextAction='Preparar expedição';
          counts.ready++;
        }else if(matches.some(j=>j.status==='in_progress')||
                 matches.some(j=>['ready','completed'].includes(j.status))){
          stage='in_progress';productionLabel='Em fabricação';nextAction='Acompanhar produção';
          counts.in_progress++;
        }else{
          stage='queued';productionLabel='Na fila';nextAction='Programar fabricação';
        }
      }
      if(paid&&tracked){stage='tracked';counts.tracked++;nextAction='Acompanhar transportadora';}
      rows.push({
        code:String(order.code||'Sem código').slice(0,85),
        stage,paymentLabel,productionLabel,
        shippingLabel:tracked?'Rastreio registrado':'Sem rastreio registrado',
        nextAction
      });
    }
    return {rows,counts};
  }
  root.CenterCupulasPipeline=Object.freeze({buildPipeline});
})(typeof window!=='undefined'?window:globalThis);
