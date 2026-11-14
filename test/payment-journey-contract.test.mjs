import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import createCheckout from '../api/mercadopago/create-checkout.js';
import webhook from '../api/mercadopago/webhook.js';
import orderStatus from '../api/mercadopago/order-status.js';

// A cross-handler contract test, not a mock of individual handlers:
// it drives the actual checkout, signed webhook and buyer status handlers
// through one controlled, in-memory ledger, with every network call intercepted.
// No external network access, customer records, or real charges.
const originalFetch = globalThis.fetch;
const keys = [
  'CENTER_CHECKOUT_ENABLED','MERCADO_PAGO_ACCESS_TOKEN','MERCADO_PAGO_WEBHOOK_SECRET',
  'SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','FRENET_TOKEN',
  'CENTER_CUPULAS_ORIGIN_CEP','CENTER_USE_LIVE_FRENET_RATES'
];
const prior = Object.fromEntries(keys.map(k => [k,process.env[k]]));
const quoteId = '11111111-1111-4111-8111-111111111111';
const orderId = '22222222-2222-4222-8222-222222222222';
const paymentId = '12345678901234';
const attemptId = '33333333-3333-4333-8333-333333333333';
const site = 'https://www.centercupulas.com.br';
const validRedirect = 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=fake-integration';

function setup(t) {
  t.after(() => {
    globalThis.fetch = originalFetch;
    for (const key of keys) {
      if (prior[key] === undefined) delete process.env[key];
      else process.env[key] = prior[key];
    }
  });
  Object.assign(process.env,{
    CENTER_CHECKOUT_ENABLED:'true',
    MERCADO_PAGO_ACCESS_TOKEN:'APP_USR_test_only',
    MERCADO_PAGO_WEBHOOK_SECRET:'fake_signed_webhook_key',
    SUPABASE_URL:'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY:'sb_secret_not_real',
    FRENET_TOKEN:'fake_frenet_key',
    CENTER_CUPULAS_ORIGIN_CEP:'13421548',
    CENTER_USE_LIVE_FRENET_RATES:'true'
  });
}
function response() {
  return {statusCode:200,body:null,headers:{},
    status(n){this.statusCode=n;return this;},
    setHeader(k,v){this.headers[k]=v;return this;},
    json(body){this.body=body;return this;}
  };
}
function cartRequest() {
  return {method:'POST',headers:{origin:site},body:{
    items:[{format:'conica',material:'algodao',color:'bege',top:12,bottom:20,height:20,quantity:1}],
    customer:{name:'Compra fictícia',phone:'11999999999',email:'ficticio@example.invalid'},
    shippingSelection:{code:'FRENET-1',price:17,productTotal:90},
    checkout_attempt_id:attemptId
  }};
}
function paidNotification(id=paymentId) {
  const ts = '1763000000';
  const requestId = 'integration-contract-test';
  const sig = createHmac('sha256',process.env.MERCADO_PAGO_WEBHOOK_SECRET)
    .update('id:'+id+';request-id:'+requestId+';ts:'+ts+';').digest('hex');
  return {method:'POST',headers:{
    'x-request-id':requestId,'x-signature':'ts='+ts+',v1='+sig
  },query:{'data.id':id},body:{type:'payment',data:{id}}};
}
function receiptRequest(receipt) {
  return {method:'POST',headers:{origin:site},
    body:{reference:receipt.status_reference,proof:receipt.status_proof}};
}

function fakeCommerce({
  paidAmount=107,
  paidReference='CENTER_CUPULAS:'+quoteId,
  paymentLookupStatus='approved',
  redirect=validRedirect,
  rejectDatabase=false
}={}) {
  const state={quoteStatus:'draft',applied:0,preferences:[],calls:[],
    paymentLookups:0,quoteRequests:0,confirmedOrders:0};
  globalThis.fetch=async (rawUrl,opts={})=>{
    const url=new URL(rawUrl);
    const method=String(opts.method||'GET');
    state.calls.push({url:url.toString(),method});
    if(url.pathname==='/functions/v1/public-cart-checkout'){
      assert.equal(method,'POST');
      const request=JSON.parse(opts.body);
      assert.equal(request.action,'payment');
      assert.equal(request.checkout_attempt_id,attemptId);
      assert.equal(request.shippingSelection.code,'FRENET-1');
      state.quoteRequests++;
      return Response.json({
        submitted:true,quote_id:quoteId,quote_code:'WEB-CONTRACT',
        total:107,shipping:{status:'quoted',freight:17},packaging:{status:'estimated'}
      });
    }
    // Prepared for PR #81 server-side authorization without changing this
    // no-network integration contract.
    if(url.pathname==='/rest/v1/rpc/center_issue_checkout_attestation'){
      assert.equal(method,'POST');
      return Response.json('44444444-4444-4444-8444-444444444444');
    }
    if(url.pathname==='/checkout/preferences' && url.hostname==='api.mercadopago.com'){
      assert.equal(method,'POST');
      assert.equal(opts.headers['X-Idempotency-Key'],quoteId);
      const body=JSON.parse(opts.body);
      assert.equal(body.external_reference,'CENTER_CUPULAS:'+quoteId);
      assert.equal(body.items[0].unit_price,107);
      assert.equal(body.items[0].currency_id,'BRL');
      state.preferences.push({key:opts.headers['X-Idempotency-Key'],amount:body.items[0].unit_price});
      return Response.json({init_point:redirect});
    }
    if(url.pathname==='/v1/payments/'+paymentId && url.hostname==='api.mercadopago.com'){
      state.paymentLookups++;
      assert.equal(method,'GET');
      return Response.json({id:Number(paymentId),status:paymentLookupStatus,
        external_reference:paidReference,transaction_amount:paidAmount,currency_id:'BRL'});
    }
    if(url.pathname==='/rest/v1/rpc/confirm_center_checkout_payment'){
      assert.equal(method,'POST');
      assert.equal(opts.headers.apikey,'sb_secret_not_real');
      assert.equal(opts.headers.Authorization,undefined);
      const data=JSON.parse(opts.body);
      assert.equal(data.p_quote_id,quoteId);
      assert.equal(data.p_currency,'BRL');
      assert.equal(data.p_payment_id,paymentId);
      if(rejectDatabase)return Response.json({error:'db temporarily unavailable'},{status:503});
      if(data.p_amount_cents!==10700)return Response.json({error:'amount_mismatch'},{status:409});
      const duplicate=state.quoteStatus==='paid';
      state.quoteStatus='paid';
      if(!duplicate){state.applied++;state.confirmedOrders++;}
      return Response.json({status:'applied',idempotent:duplicate});
    }
    if(url.pathname==='/rest/v1/quotes'){
      assert.equal(url.searchParams.get('id'),'eq.'+quoteId);
      return Response.json([{id:quoteId,code:'WEB-CONTRACT',status:state.quoteStatus}]);
    }
    if(url.pathname==='/rest/v1/orders'){
      return Response.json(state.confirmedOrders?[{
        id:orderId,code:'PED-CONTRACT',payment_status:'paid'
      }]:[]);
    }
    if(url.pathname==='/rest/v1/production_jobs'){
      return Response.json(state.confirmedOrders?[{id:attemptId,status:'queued'}]:[]);
    }
    throw Error('Unexpected unmocked HTTP request: '+method+' '+url);
  };
  return state;
}

test('full fake checkout: draft → valid MP preference → signed webhook → paid job',async t=>{
  setup(t);
  const state=fakeCommerce();
  const checkout=response();
  await createCheckout(cartRequest(),checkout);
  assert.equal(checkout.statusCode,200);
  assert.equal(state.preferences.length,1);
  assert.ok(checkout.body.checkout_url.startsWith('https://www.mercadopago.com.br/checkout/'));

  const before=response();
  await orderStatus(receiptRequest(checkout.body),before);
  assert.equal(before.statusCode,200);
  assert.equal(before.body.state,'pending');
  assert.equal(state.confirmedOrders,0);

  const callback=response();
  await webhook(paidNotification(),callback);
  assert.equal(callback.statusCode,200);
  assert.equal(callback.body.reconciliation,'applied');
  assert.equal(state.applied,1);

  const after=response();
  await orderStatus(receiptRequest(checkout.body),after);
  assert.equal(after.body.state,'confirmed');
  assert.equal(after.body.order_code,'PED-CONTRACT');
  assert.equal(after.body.production_status,'registered');

  const repeated=response();
  await webhook(paidNotification(),repeated);
  assert.equal(repeated.statusCode,200);
  assert.equal(repeated.body.idempotent,true);
  assert.equal(state.applied,1,'retries must not register a second payment/order');

  const retryCheckout=response();
  await createCheckout(cartRequest(),retryCheckout);
  assert.equal(retryCheckout.statusCode,200);
  assert.equal(state.quoteRequests,2);
  assert.equal(new Set(state.preferences.map(x=>x.key)).size,1,
    'all preference retries must share one provider idempotency key');
});

test('a signed payment with a different amount is not acknowledged or fulfilled',async t=>{
  setup(t);
  const state=fakeCommerce({paidAmount:106.99});
  const checkout=response();await createCheckout(cartRequest(),checkout);
  assert.equal(checkout.statusCode,200);
  const callback=response();await webhook(paidNotification(),callback);
  assert.equal(callback.statusCode,409);
  assert.equal(callback.body.error,'reconciliation_failed');
  assert.equal(state.applied,0);
  const status=response();await orderStatus(receiptRequest(checkout.body),status);
  assert.equal(status.body.state,'pending');
});

test('a failed ledger write causes webhook retry, never a fake paid status',async t=>{
  setup(t);
  const state=fakeCommerce({rejectDatabase:true});
  const checkout=response();await createCheckout(cartRequest(),checkout);
  assert.equal(checkout.statusCode,200);
  const callback=response();await webhook(paidNotification(),callback);
  assert.equal(callback.statusCode,503);
  assert.equal(state.applied,0);
  const status=response();await orderStatus(receiptRequest(checkout.body),status);
  assert.equal(status.body.state,'pending');
});

test('unrelated signed provider payments never create Center orders',async t=>{
  setup(t);
  const state=fakeCommerce({paidReference:'OTHER_STORE:'+quoteId});
  const callback=response();await webhook(paidNotification(),callback);
  assert.equal(callback.statusCode,200);
  assert.equal(callback.body.ignored,true);
  assert.equal(state.applied,0);
  assert.equal(state.confirmedOrders,0);
});

test('a provider HTTP 200 may not inject a phishing checkout destination',async t=>{
  setup(t);
  for(const redirect of [
    'https://checkout.example.invalid/checkout/pref',
    'https://www.mercadopago.com.br.evil.invalid/checkout/pref',
    'https://www.mercadopago.com.br@evil.invalid/checkout/pref',
    'http://www.mercadopago.com.br/checkout/pref',
    'https://www.mercadopago.com.br/account/login',
    'javascript:alert(1)'
  ]){
    const state=fakeCommerce({redirect});
    const checkout=response();
    await createCheckout(cartRequest(),checkout);
    assert.equal(checkout.statusCode,502,redirect);
    assert.equal(checkout.body.error,'payment_provider_unavailable');
    assert.equal(checkout.body.checkout_url,undefined);
    assert.equal(state.preferences.length,1);
  }
});

test('malformed, oversized, and structurally invalid requests cause no provider calls',async t=>{
  setup(t);
  const cases=[
    null,[], 'not JSON',
    {...cartRequest().body,customer:{notes:'x'.repeat(61000)}},
    {...cartRequest().body,items:[null]},
    {...cartRequest().body,items:['invalid']},
    {...cartRequest().body,shippingSelection:{code:12345,price:17,productTotal:90}}
  ];
  for(const body of cases){
    let calls=0;
    globalThis.fetch=()=>{calls++;throw Error('input must be rejected before any fetch');};
    const checkout=response();
    await createCheckout({...cartRequest(),body},checkout);
    assert.ok([400,413].includes(checkout.statusCode),JSON.stringify(body)?.slice(0,65));
    assert.equal(calls,0);
  }
  assert.equal(cases.length,7);
});
