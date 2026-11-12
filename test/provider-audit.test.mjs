import test from 'node:test';
import assert from 'node:assert/strict';
import providerAudit from '../api/internal/provider-audit.js';

const oldFetch = globalThis.fetch;
const keys = ['CRON_SECRET','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','MERCADO_PAGO_ACCESS_TOKEN'];
const values = Object.fromEntries(keys.map(k => [k, process.env[k]]));
const quoteId = '11111111-1111-4111-8111-111111111111';
const record = { payment_id: '1234', quote_id: quoteId,
  amount_cents: 10500, currency: 'BRL', reconciliation_status: 'applied' };

function setup(t) {
  t.after(() => {
    globalThis.fetch = oldFetch;
    for (const k of keys) {
      if (values[k] === undefined) delete process.env[k];
      else process.env[k] = values[k];
    }
  });
  process.env.CRON_SECRET = 'testing-private-cron-secret-12345';
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_test';
  process.env.MERCADO_PAGO_ACCESS_TOKEN = 'APP_USR_test';
}
function req(auth='Bearer '+process.env.CRON_SECRET) { return { method: 'GET', headers:{authorization:auth} }; }
function res() {
  return {statusCode:200,body:null,headers:{},
    status(code){this.statusCode=code;return this;},
    setHeader(k,v){this.headers[k]=v;return this;},
    json(body){this.body=body;return this;}};
}
function providerPayment(overrides={}) {
  return { id:1234,status:'approved',currency_id:'BRL',transaction_amount:105,
    external_reference:'CENTER_CUPULAS:'+quoteId,...overrides };
}
test('private provider audit rejects requests without CRON_SECRET', async t => {
  setup(t);
  globalThis.fetch = () => { throw Error('must not fetch'); };
  let response=res();await providerAudit(req('Bearer invalid'),response);
  assert.equal(response.statusCode,401);
  response=res();await providerAudit({...req(),method:'POST'},response);
  assert.equal(response.statusCode,405);
});
test('provider audit reconciles ledger amount, reference and approved state',async t=>{
  setup(t);
  const calls=[];
  globalThis.fetch=async(url,options)=>{
    calls.push(url);
    assert.ok(options.signal instanceof AbortSignal);
    if(url.includes('/center_checkout_payments?')) {
      assert.ok(url.includes('confirmed_at=gte.'));
      assert.equal(options.headers.apikey,'sb_secret_test');
      return Response.json([record]);
    }
    if(url.endsWith('/v1/payment_methods'))return Response.json([{id:'pix'}]);
    if(url.endsWith('/v1/payments/1234'))return Response.json(providerPayment());
    throw Error('unexpected request');
  };
  const response=res();await providerAudit(req(),response);
  assert.equal(response.statusCode,200);
  assert.equal(response.body.status,'healthy');
  assert.equal(response.body.checked_payments,1);
  assert.equal(response.body.mismatched_payments,0);
  assert.equal(calls.length,3);
});
test('provider audit flags incorrect amounts without leaking payment identity',async t=>{
  setup(t);
  globalThis.fetch=async url=>{
    if(url.includes('/center_checkout_payments?'))return Response.json([record]);
    if(url.endsWith('/v1/payment_methods'))return Response.json([]);
    if(url.endsWith('/v1/payments/1234'))return Response.json(providerPayment({transaction_amount:100}));
    throw Error('unexpected');
  };
  const response=res();await providerAudit(req(),response);
  assert.equal(response.statusCode,503);
  assert.equal(response.body.status,'critical');
  assert.equal(response.body.mismatched_payments,1);
  assert.ok(!JSON.stringify(response.body).includes(quoteId));
  assert.ok(!JSON.stringify(response.body).includes('1234'));
});
test('provider audit fails closed when the ledger exceeds its audit window',async t=>{
  setup(t);
  let calls=0;
  globalThis.fetch=async()=>{calls++;return Response.json(Array.from({length:51},()=>record));};
  const response=res();await providerAudit(req(),response);
  assert.equal(response.statusCode,503);
  assert.equal(response.body.status,'unavailable');
  assert.equal(calls,1);
});
test('provider audit distinguishes external provider failure from healthy results',async t=>{
  setup(t);
  globalThis.fetch=async url=>{
    if(url.includes('/center_checkout_payments?'))return Response.json([record]);
    if(url.endsWith('/v1/payment_methods'))return Response.json({error:'blocked'},{status:401});
    throw Error('unexpected');
  };
  const response=res();await providerAudit(req(),response);
  assert.equal(response.statusCode,503);
  assert.equal(response.body.status,'provider_unavailable');
});
test('provider audit detects a second approved payment tied to one order',async t=>{
  setup(t);
  globalThis.fetch=async url=>{
    if(url.includes('/center_checkout_payments?'))return Response.json([
      {...record,reconciliation_status:'duplicate_charge'}
    ]);
    if(url.endsWith('/v1/payment_methods'))return Response.json([]);
    if(url.endsWith('/v1/payments/1234'))return Response.json(providerPayment());
    throw Error('unexpected');
  };
  const response=res();await providerAudit(req(),response);
  assert.equal(response.statusCode,503);
  assert.equal(response.body.duplicate_approved_charges,1);
});
