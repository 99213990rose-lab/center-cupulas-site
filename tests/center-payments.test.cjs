'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {evaluateCheckout,cents}=require('../lib/center-checkout-eligibility.cjs');
const {verifyMercadoPagoSignature,reconcileMercadoPagoPayment,shouldApplyStatus}=require('../lib/center-mp-security.cjs');

function approved(){
 return {
  quote:{
    status:'ok',calibration:false,pricing_approved:true,production_approved:true,
    items:[{quantity:1,approved_for_auto_checkout:true}],
    product_total:100,packaging_fee:6,subtotal_with_packaging:106,
    packaging:{status:'approved',calibration:false,cost_approved:true,
      packages:[{external_dimensions_cm:{width:32,length:32,height:32},gross_weight_kg:.55,measured:true}]}
  },
  shipping:{verified:true,calibration:false,provider:'Frenet',service_code:'123',recipient_cep:'08265220',price:15},
  customer:{name:'Cliente',email:'cliente@example.org',phone:'11999998888',cep:'08265220'}
 };
}
test('checkout aprovado tem valor de produto + caixa + frete em centavos',()=>{
 const e=evaluateCheckout(approved());
 assert.equal(e.eligible,true);assert.equal(e.amount_cents,12100);
});
test('checkout atual em calibracao recusa pagamento',()=>{
 const p=approved();p.quote.calibration=true;p.quote.pricing_approved=false;
 assert.equal(evaluateCheckout(p).eligible,false);
 assert.ok(evaluateCheckout(p).reasons.includes('pricing_not_calibrated'));
});
test('sem confirmacao do custo de caixa recusa pagamento',()=>{
 const p=approved();p.quote.packaging.cost_approved=false;
 assert.ok(evaluateCheckout(p).reasons.includes('packaging_not_approved'));
});
test('dimensoes externas e peso real obrigatorios',()=>{
 const p=approved();p.quote.packaging.packages[0].measured=false;
 assert.ok(evaluateCheckout(p).reasons.includes('package_dimensions_unverified'));
});
test('frete nao verificado bloqueia',()=>{
 const p=approved();p.shipping.verified=false;
 assert.ok(evaluateCheckout(p).reasons.includes('shipping_not_verified'));
});
test('cliente nao pode criar divergencia de soma',()=>{
 const p=approved();p.quote.subtotal_with_packaging=1;
 assert.ok(evaluateCheckout(p).reasons.includes('server_total_mismatch'));
});
test('precos com mais de dois decimais bloqueados',()=>{
 assert.equal(cents(4.567),null);assert.equal(cents('6.01'),601);
 assert.equal(cents(-1),null);
});
test('formato de dados do cliente obrigatorio',()=>{
 const p=approved();p.customer.email='invalido';
 assert.ok(evaluateCheckout(p).reasons.includes('invalid_customer'));
});
test('HMAC Mercado Pago com identificador e timestamp válidos',()=>{
 const id='998877665';const ts='1718000000';const reqId='request-one';const secret='segredo-do-webhook';
 const manifest='id:'+id+';request-id:'+reqId+';ts:'+ts+';';
 const v1=crypto.createHmac('sha256',secret).update(manifest).digest('hex');
 assert.equal(verifyMercadoPagoSignature({signature:'ts='+ts+',v1='+v1,requestId:reqId,paymentId:id,secret}),true);
 assert.equal(verifyMercadoPagoSignature({signature:'ts='+ts+',v1='+v1,requestId:reqId,paymentId:'111',secret}),false);
 assert.equal(verifyMercadoPagoSignature({signature:'ts='+ts+',v1='+v1,requestId:reqId,paymentId:id,secret:'outro'}),false);
});
test('concilia somente mesmo pedido, moeda e valor',()=>{
 const order={project:'center-cupulas',external_reference:'CENTER-abc',amount_cents:12100};
 const payment={id:998877665,status:'approved',currency_id:'BRL',transaction_amount:121,external_reference:'CENTER-abc'};
 assert.deepEqual(reconcileMercadoPagoPayment(order,payment),{valid:true,reasons:[],status:'paid'});
 assert.equal(reconcileMercadoPagoPayment(order,{...payment,transaction_amount:120}).valid,false);
 assert.equal(reconcileMercadoPagoPayment(order,{...payment,currency_id:'USD'}).valid,false);
 assert.equal(reconcileMercadoPagoPayment(order,{...payment,external_reference:'OUTRO'}).valid,false);
});
test('status pago nao regride e estorno não pode voltar a pago',()=>{
 assert.equal(shouldApplyStatus('paid','pending'),false);
 assert.equal(shouldApplyStatus('paid','refunded'),true);
 assert.equal(shouldApplyStatus('refunded','paid'),false);
 assert.equal(shouldApplyStatus('charged_back','paid'),false);
 assert.equal(shouldApplyStatus('checkout_created','paid'),true);
});
