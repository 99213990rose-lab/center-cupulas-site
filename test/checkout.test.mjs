import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import webhook from '../api/mercadopago/webhook.js';
import createCheckout from '../api/mercadopago/create-checkout.js';
import status from '../api/mercadopago/status.js';

const keys = [
  'CENTER_CHECKOUT_ENABLED','MERCADO_PAGO_ACCESS_TOKEN','MERCADO_PAGO_WEBHOOK_SECRET',
  'SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','FRENET_TOKEN','CENTER_CUPULAS_ORIGIN_CEP'
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
      customer:{name:'Cliente de Teste'},shippingSelection:{code:'FRENET-1'}}
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
