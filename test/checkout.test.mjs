import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {readFileSync} from 'node:fs';
import webhook from '../api/mercadopago/webhook.js';
import createCheckout from '../api/mercadopago/create-checkout.js';
import orderStatus from '../api/mercadopago/order-status.js';
import status from '../api/mercadopago/status.js';
import mpTransport from '../api/mercadopago/transport.cjs';

const keys = [
  'CENTER_CHECKOUT_ENABLED','MERCADO_PAGO_ACCESS_TOKEN','MERCADO_PAGO_WEBHOOK_SECRET',
  'SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','FRENET_TOKEN','CENTER_CUPULAS_ORIGIN_CEP','CENTER_USE_LIVE_FRENET_RATES','CENTER_PICKUP_ENABLED'
];
const baseline = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
const originalFetch = globalThis.fetch;
function reset() {
  for (const key of keys) {
    if (baseline[key] === undefined) delete process.env[key];
    else process.env[key] = baseline[key];
  }
  globalThis.fetch = originalFetch;
}
function response() {
  return {
    statusCode: 200, headers: {}, body: null,
    setHeader(key, value) { this.headers[key] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end() { return this; }
  };
}
function configure() {
  process.env.CENTER_CHECKOUT_ENABLED = 'true';
  process.env.MERCADO_PAGO_ACCESS_TOKEN = 'APP_USR_fake';
  process.env.MERCADO_PAGO_WEBHOOK_SECRET = 'test_signature_secret';
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_test_placeholder';
  process.env.FRENET_TOKEN = 'frenet_test';
  process.env.CENTER_USE_LIVE_FRENET_RATES = 'true';
  process.env.CENTER_CUPULAS_ORIGIN_CEP = '13421548';
}
function signedRequest(id='1234') {
  const ts = '1760583600';
  const requestId = 'unit-test-request';
  const signature = createHmac('sha256', process.env.MERCADO_PAGO_WEBHOOK_SECRET)
    .update(`id:${id};request-id:${requestId};ts:${ts};`).digest('hex');
  return {
    method:'POST', query:{'data.id':id}, body:{type:'payment',data:{id}},
    headers:{'x-request-id':requestId,'x-signature':`ts=${ts},v1=${signature}`}
  };
}

test('checkout feature remains disabled unless every required setting exists', async (t) => {
  t.after(reset); configure();
  let res = response();
  status({method:'GET'}, res);
  assert.equal(res.body.checkout_enabled,true);
  delete process.env.FRENET_TOKEN;
  res=response();
  status({method:'GET'},res);
  assert.equal(res.body.checkout_enabled,false);
  process.env.FRENET_TOKEN='frenet_test';
  process.env.CENTER_CUPULAS_ORIGIN_CEP='invalid';
  res=response();
  status({method:'GET'},res);
  assert.equal(res.body.checkout_enabled,false);
});

test('unsigned or tampered Mercado Pago webhooks never query payment data', async (t) => {
  t.after(reset); configure();
  globalThis.fetch=()=>{throw Error('must not fetch')};
  const req=signedRequest();
  req.headers['x-signature']='ts=1760583600,v1='+'0'.repeat(64);
  const res=response();
  await webhook(req,res);
  assert.equal(res.statusCode,401);
});

test('approved signed payment is atomically reconciled with apikey-only secret', async (t) => {
  t.after(reset); configure();
  const uuid='11111111-1111-4111-8111-111111111111';
  const calls=[];
  globalThis.fetch=async (url,options={})=>{
    calls.push({url,options});
    if (calls.length===1) return Response.json({
      id:1234, external_reference:'CENTER_CUPULAS:'+uuid,
      status:'approved',currency_id:'BRL',transaction_amount:125.5
    });
    return Response.json({status:'applied',idempotent:false});
  };
  const res=response();
  await webhook(signedRequest(),res);
  assert.equal(res.statusCode,200);
  assert.equal(res.body.reconciliation,'applied');
  assert.equal(calls.length,2);
  assert.ok(calls[1].url.endsWith('/rest/v1/rpc/confirm_center_checkout_payment'));
  assert.equal(calls[1].options.headers.apikey,'sb_secret_test_placeholder');
  assert.equal(calls[1].options.headers.Authorization,undefined);
  assert.deepEqual(JSON.parse(calls[1].options.body),{
    p_quote_id:uuid,p_payment_id:'1234',p_amount_cents:12550,p_currency:'BRL'
  });
});

test('payment preference uses server-repriced quote and explicit payable action', async (t) => {
  t.after(reset); configure();
  const calls=[];
  globalThis.fetch=async (url,options={})=>{
    calls.push({url,options});
    if (calls.length===1) return Response.json({
      status:'ok',submitted:true,quote_id:'11111111-1111-4111-8111-111111111111',
      quote_code:'WEB-TEST',total:102.5,shipping:{status:'quoted',freight:12.5},
      packaging:{status:'estimated'}
    });
    return Response.json({init_point:'https://www.mercadopago.com.br/checkout/example'});
  };
  const res=response();
  await createCheckout({
    method:'POST',headers:{origin:'https://www.centercupulas.com.br'},
    body:{items:[{format:'drum',quantity:1,top:25,bottom:25,height:20}],
      customer:{name:'Cliente de Teste'},shippingSelection:{code:'FRENET-1',price:12.5,productTotal:90}}
  },res);
  assert.equal(res.statusCode,200);
  assert.equal(calls.length,2);
  assert.equal(JSON.parse(calls[0].options.body).action,'payment');
  assert.equal(JSON.parse(calls[1].options.body).items[0].unit_price,102.5);
  assert.ok(res.body.checkout_url.startsWith('https://'));
});

test('checkout refuses missing freight settings or foreign origins', async (t) => {
  t.after(reset); configure();
  let res=response();
  await createCheckout({method:'POST',headers:{origin:'https://evil.example'},body:{}},res);
  assert.equal(res.statusCode,403);
  delete process.env.FRENET_TOKEN;
  res=response();
  await createCheckout({method:'POST',headers:{origin:'https://www.centercupulas.com.br'},body:{}},res);
  assert.equal(res.statusCode,503);
});

test('online payment stays disabled with freight settings but without shipping calibration', async (t) => {
  t.after(reset); configure();
  delete process.env.CENTER_USE_LIVE_FRENET_RATES;
  const res = response();
  status({method:'GET'},res);
  assert.equal(res.body.checkout_enabled,false);
  const result = response();
  await createCheckout({method:'POST',headers:{origin:'https://www.centercupulas.com.br'},body:{}},result);
  assert.equal(result.statusCode,503);
  assert.equal(result.body.error,'carrier_rates_not_enabled');
});

test('if live freight changed, the customer never goes to Mercado Pago with a higher total',async(t)=>{
 t.after(reset);configure();let calls=0;
 globalThis.fetch=async()=>{calls++;return Response.json({status:'ok',submitted:true,
   quote_id:'11111111-1111-4111-8111-111111111111',
   quote_code:'WEB-TEST',total:107,shipping:{status:'quoted',freight:17},packaging:{status:'estimated'}});};
 const res=response();
 await createCheckout({method:'POST',headers:{origin:'https://www.centercupulas.com.br'},body:{
 items:[{format:'drum',quantity:1,top:25,bottom:25,height:20}],
 customer:{name:'Teste'},shippingSelection:{code:'FRENET-1',price:12.5,productTotal:90}}},res);
 assert.equal(res.statusCode,409);assert.equal(res.body.error,'price_changed');assert.equal(calls,1);
});
test('the legacy shipping flag is not required after the seller enables live Frenet rates',async(t)=>{
 t.after(reset);configure();delete process.env.CENTER_SHIPPING_VALIDATED;
 const res=response();status({method:'GET'},res);assert.equal(res.body.checkout_enabled,true);
 delete process.env.CENTER_USE_LIVE_FRENET_RATES;
 const disabled=response();status({method:'GET'},disabled);assert.equal(disabled.body.checkout_enabled,false);
});

test('read-only Mercado Pago connection probe distinguishes authorized and unauthorized credentials',async(t)=>{
 t.after(reset);configure();
 let calls=0;
 globalThis.fetch=async(url,options)=>{
   calls++;assert.equal(url,'https://api.mercadopago.com/v1/payment_methods');
   assert.equal(options.method,'GET');
   assert.ok(options.headers.Authorization.startsWith('Bearer '));
   return {ok:calls===1,status:calls===1?200:401};
 };
 let res=response();
 await status({method:'GET',query:{diagnose:'connection'}},res);
 assert.equal(res.body.provider_connection,'authorized');
 assert.equal(Object.hasOwn(res.body,'token'),false);
 res=response();await status({method:'GET',query:{diagnose:'connection'}},res);
 assert.equal(res.body.provider_connection,'unauthorized');
});

test('Mercado Pago identity-approval issue is classified safely without leaking raw payload',async(t)=>{
 t.after(reset);configure();
 let calls=0;
 globalThis.fetch=async(url)=>{
   calls++;
   if(calls===1)return Response.json({
     status:'ok',submitted:true,quote_id:'11111111-1111-4111-8111-111111111111',
     quote_code:'WEB-TEST',total:102.5,shipping:{status:'quoted',freight:12.5},
     packaging:{status:'estimated'}
   });
   return Response.json({error:'collector_does_not_comply_with_current_regulation',
     message:'hidden personal account details'}, {status:400});
 };
 const res=response();
 await createCheckout({method:'POST',headers:{origin:'https://www.centercupulas.com.br'},body:{
  items:[{format:'drum',quantity:1,top:25,bottom:25,height:20}],customer:{name:'Teste'},
  shippingSelection:{code:'FRENET-1',price:12.5,productTotal:90}
 }},res);
 assert.equal(res.statusCode,503);
 assert.equal(res.body.error,'payment_account_verification_required');
 assert.equal(res.body.provider_code,'collector_does_not_comply_with_current_regulation');
 assert.equal(JSON.stringify(res.body).includes('hidden personal'),false);
});

test('Mercado Pago unauthorized response gives actionable error without a redirect',async(t)=>{
 t.after(reset);configure();let calls=0;
 globalThis.fetch=async()=>{
   calls++;
   if(calls===1)return Response.json({
     status:'ok',submitted:true,quote_id:'11111111-1111-4111-8111-111111111111',
     quote_code:'WEB-TEST',total:102.5,shipping:{status:'quoted',freight:12.5},
     packaging:{status:'estimated'}});
   return Response.json({error:'unauthorized'},{status:401});
 };
 const res=response();
 await createCheckout({method:'POST',headers:{origin:'https://www.centercupulas.com.br'},body:{
  items:[{format:'drum',quantity:1,top:25,bottom:25,height:20}],customer:{name:'Teste'},
  shippingSelection:{code:'FRENET-1',price:12.5,productTotal:90}
 }},res);
 assert.equal(res.statusCode,503);
 assert.equal(res.body.error,'payment_account_authentication_failed');
 assert.equal(calls,2);
});


test('diagnostic classification distinguishes a network timeout without disclosing exception internals',async(t)=>{
 t.after(reset);configure();
 const originalTransport=mpTransport.requestJson;
 t.after(()=>{mpTransport.requestJson=originalTransport;});
 mpTransport.requestJson=async()=>{const failure=new TypeError('native_https_failed');failure.cause={code:'UND_ERR_CONNECT_TIMEOUT'};throw failure;};
 globalThis.fetch=async()=>{const failure=new TypeError('secret-network-message');failure.cause={code:'UND_ERR_CONNECT_TIMEOUT'};throw failure};
 const res=response();
 await status({method:'GET',query:{diagnose:'connection'}},res);
 assert.equal(res.body.provider_connection,'unavailable');
 assert.equal(res.body.connection_issue,'connect_timeout');
 assert.equal(JSON.stringify(res.body).includes('secret-network-message'),false);
});


test('read-only native HTTPS probe succeeds when Undici is failing',async(t)=>{
 t.after(reset);configure();
 const original=mpTransport.requestJson;
 t.after(()=>{mpTransport.requestJson=original;});
 globalThis.fetch=()=>{throw Error('should never use fetch for native-only diagnostic')};
 mpTransport.requestJson=async(url,opts)=>{
   assert.equal(url,'https://api.mercadopago.com/v1/payment_methods');
   assert.ok(opts.headers.Authorization.startsWith('Bearer '));
   return {ok:true,status:200};
 };
 const res=response();
 await status({method:'GET',query:{diagnose:'native'}},res);
 assert.equal(res.body.provider_connection,'authorized');
 assert.equal(res.body.transport,'node_https');
});

test('a provider network failure uses native HTTPS before rejecting checkout',async(t)=>{
 t.after(reset);configure();let calls=0;
 const original=mpTransport.requestJson;
 t.after(()=>{mpTransport.requestJson=original;});
 globalThis.fetch=async()=>{
   calls++;
   if(calls===1)return Response.json({
     status:'ok',submitted:true,quote_id:'11111111-1111-4111-8111-111111111111',
     quote_code:'WEB-TEST',total:102.5,shipping:{status:'quoted',freight:12.5},
     packaging:{status:'estimated'}});
   throw TypeError('Undici unavailable');
 };
 mpTransport.requestJson=async(url,options)=>{
   assert.equal(url,'https://api.mercadopago.com/checkout/preferences');
   assert.equal(options.method,'POST');
   return Response.json({init_point:'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=test'});
 };
 const res=response();
 await createCheckout({method:'POST',headers:{origin:'https://www.centercupulas.com.br'},body:{
   items:[{format:'drum',quantity:1,top:25,bottom:25,height:20}],
   customer:{name:'Teste'},shippingSelection:{code:'FRENET-1',price:12.5,productTotal:90}
 }},res);
 assert.equal(res.statusCode,200);
 assert.ok(res.body.checkout_url.startsWith('https://'));
 assert.equal(calls,2);
});

test('native provider transport refuses accidental external hosts',async()=>{
 assert.throws(()=>mpTransport.requestJson('https://example.invalid/payments'),/provider_host_not_allowed/);
});


test('provider access token copied with whitespace uses a valid Authorization header',async(t)=>{
 t.after(reset);configure();
 process.env.MERCADO_PAGO_ACCESS_TOKEN='  Bearer APP_USR_test-token-123\n';
 const original=mpTransport.requestJson;
 t.after(()=>{mpTransport.requestJson=original;});
 mpTransport.requestJson=async(url,opts)=>{
   assert.equal(opts.headers.Authorization,'Bearer APP_USR_test-token-123');
   return {ok:true,status:200};
 };
 const statusResult=response();
 await status({method:'GET',query:{diagnose:'native'}},statusResult);
 assert.equal(statusResult.body.provider_connection,'authorized');
});

const quoteIdForReceipt='11111111-1111-4111-8111-111111111111';
function statusProofForReceipt(id=quoteIdForReceipt){
 return createHmac('sha256',process.env.SUPABASE_SERVICE_ROLE_KEY)
  .update('center-status-v1:'+id).digest('hex');
}
function receiptRequest(overrides={}){
 return {method:'POST',headers:{origin:'https://www.centercupulas.com.br'},
  body:{reference:quoteIdForReceipt,proof:statusProofForReceipt()},...overrides};
}
test('status receipt cannot be used without valid proof or from a foreign origin',async(t)=>{
 t.after(reset);configure();
 globalThis.fetch=()=>{throw Error('must not read private database without proof');};
 let res=response();
 await orderStatus(receiptRequest({body:{reference:quoteIdForReceipt,proof:'0'.repeat(64)}}),res);
 assert.equal(res.statusCode,403);
 res=response();await orderStatus(receiptRequest({headers:{origin:'https://untrusted.example'}}),res);
 assert.equal(res.statusCode,403);
 res=response();await orderStatus({method:'GET',headers:{}},res);
 assert.equal(res.statusCode,405);
});
test('payment return page cannot manufacture approval; draft quotes remain pending',async(t)=>{
 t.after(reset);configure();
 let calls=0;
 globalThis.fetch=async(url,opts)=>{
   calls++;assert.ok(url.includes('quotes?'));assert.ok(url.includes('organization_id=eq.'));
   assert.ok(opts.headers.apikey);
   return Response.json([{id:quoteIdForReceipt,status:'draft',code:'WEB-TEST'}]);
 };
 const res=response();await orderStatus(receiptRequest(),res);
 assert.equal(res.statusCode,200);
 assert.equal(res.body.state,'pending');
 assert.equal(calls,1);
});
test('paid quote only appears confirmed after paid order AND queued production registration',async(t)=>{
 t.after(reset);configure();
 const calls=[];
 globalThis.fetch=async(url,opts)=>{
  calls.push(url);
  assert.equal(opts.headers.apikey,'sb_secret_test_placeholder');
  if(url.includes('/quotes?'))return Response.json([{id:quoteIdForReceipt,status:'paid',code:'WEB-TEST'}]);
  if(url.includes('/orders?'))return Response.json([{id:'22222222-2222-4222-8222-222222222222',
    code:'PED-WEB-TEST',payment_status:'paid'}]);
  if(url.includes('/production_jobs?'))return Response.json([{id:'33333333-3333-4333-8333-333333333333',status:'queued'}]);
  throw Error('wrong table');
 };
 const res=response();await orderStatus(receiptRequest(),res);
 assert.equal(res.statusCode,200);assert.equal(res.body.state,'confirmed');
 assert.equal(res.body.order_code,'PED-WEB-TEST');
 assert.equal(res.body.production_status,'registered');
 assert.equal(calls.length,3);
});
test('paid quote without a production order is never called confirmed',async(t)=>{
 t.after(reset);configure();
 globalThis.fetch=async(url)=>url.includes('/quotes?')
    ? Response.json([{id:quoteIdForReceipt,status:'paid',code:'WEB-TEST'}])
    : Response.json([]);
 const res=response();await orderStatus(receiptRequest(),res);
 assert.equal(res.body.state,'processing');
});
test('checkout receipt proof is generated only after a successful provider preference',async(t)=>{
 t.after(reset);configure();
 let calls=0;
 globalThis.fetch=async()=>{
  calls++;
  if(calls===1)return Response.json({status:'ok',submitted:true,quote_id:quoteIdForReceipt,
   quote_code:'WEB-TEST',total:102.5,shipping:{status:'quoted',freight:12.5},
   packaging:{status:'estimated'}});
  return Response.json({init_point:'https://www.mercadopago.com.br/checkout/mock'});
 };
 const res=response();
 await createCheckout({method:'POST',headers:{origin:'https://www.centercupulas.com.br'},
  body:{items:[{format:'drum',quantity:1,top:25,bottom:25,height:20}],customer:{name:'Teste'},
   shippingSelection:{code:'FRENET-1',price:12.5,productTotal:90}}},res);
 assert.equal(res.statusCode,200);
 assert.equal(res.body.status_reference,quoteIdForReceipt);
 assert.equal(res.body.status_proof,statusProofForReceipt());
 assert.equal(calls,2);
});
test('paid return UX checks secure status, never treats query parameters as payment confirmation',()=>{
 const html=readFileSync(new URL('../carrinho.js',import.meta.url),'utf8');
 assert.ok(html.includes("sessionStorage.setItem('center-cupulas-payment-receipt'"));
 assert.ok(html.includes("fetch('/api/mercadopago/order-status'"));
 assert.ok(html.includes("result.state==='confirmed'"));
 assert.ok(html.includes("cart.clear();"));
 assert.ok(html.includes('Aguardando confirmação do Mercado Pago.'));
 assert.ok(!html.includes("paymentReturn === 'return') {\n    cart.clear"));
});


test('store pickup stays hidden and blocked until the seller opts in', async (t) => {
  t.after(reset); configure();
  let state = response();
  await status({method:'GET'}, state);
  assert.equal(state.body.checkout_enabled, true);
  assert.equal(state.body.pickup_enabled, false);

  let gateway = response();
  await createCheckout({method:'POST', headers:{origin:'https://www.centercupulas.com.br'},
    body:{items:[{format:'drum',quantity:1,top:25,bottom:25,height:20}],
      customer:{name:'Cliente'},shippingSelection:{code:'STORE_PICKUP',price:0,productTotal:90}}
  },gateway);
  assert.equal(gateway.statusCode,503);
  assert.equal(gateway.body.error,'pickup_not_enabled');

  process.env.CENTER_PICKUP_ENABLED='true';
  state=response();
  await status({method:'GET'},state);
  assert.equal(state.body.pickup_enabled,true);
});

test('store pickup uses the server total and does not add freight', async (t) => {
  t.after(reset); configure();
  process.env.CENTER_PICKUP_ENABLED='true';
  const calls=[];
  globalThis.fetch=async (url, options={}) => {
    calls.push({url,options});
    if (calls.length===1) return Response.json({
      status:'ok',submitted:true,quote_id:'11111111-1111-4111-8111-111111111111',
      quote_code:'WEB-PICKUP',total:90,shipping:{status:'pickup',freight:0},
      packaging:{status:'estimated'}
    });
    return Response.json({init_point:'https://www.mercadopago.com.br/checkout/mock'});
  };
  const req={method:'POST',headers:{origin:'https://www.centercupulas.com.br'},
    body:{items:[{format:'drum',quantity:1,top:25,bottom:25,height:20}],
      customer:{name:'Cliente',phone:'11999999999'},
      shippingSelection:{code:'STORE_PICKUP',price:0,productTotal:90}}};
  const res=response();
  await createCheckout(req,res);
  assert.equal(res.statusCode,200);
  assert.equal(calls.length,2);
  assert.equal(JSON.parse(calls[0].options.body).shippingSelection.code,'STORE_PICKUP');
  assert.equal(JSON.parse(calls[1].options.body).items[0].unit_price,90);
  assert.equal(res.body.quote_code,'WEB-PICKUP');

  const malicious=response();
  await createCheckout({...req,body:{...req.body,shippingSelection:{code:'STORE_PICKUP',price:5,productTotal:90}}},malicious);
  assert.equal(malicious.statusCode,400);
  assert.equal(calls.length,2,'do not create any quote for a forged pickup rate');
});

test('cart pickup switch is gated and shipping address is optional only for pickup', () => {
  const cart = readFileSync(new URL('../carrinho.js',import.meta.url),'utf8');
  const page = readFileSync(new URL('../carrinho.html',import.meta.url),'utf8');
  const edge = readFileSync(new URL('../supabase/functions/public-cart-checkout/index.ts',import.meta.url),'utf8');
  assert.ok(page.includes('data-fulfillment-picker hidden'));
  assert.ok(page.includes('data-delivery-address'));
  assert.ok(cart.includes('pickupEnabled = checkoutProEnabled && data.pickup_enabled === true'));
  assert.ok(cart.includes("code: 'STORE_PICKUP', price: 0"));
  assert.ok(edge.includes('const pickup=body.shippingSelection?.code==="STORE_PICKUP"'));
  assert.ok(edge.includes('const shippingAddress=pickup?null:'));
  assert.ok(edge.includes('status:pickup?"pickup"'));
});
