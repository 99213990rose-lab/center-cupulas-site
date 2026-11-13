import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {checkoutPayloadDigest,verifyCheckoutAttestation} from '../supabase/functions/public-cart-checkout/checkout-attestation.mjs';
import createCheckout from '../api/mercadopago/create-checkout.js';

const existingFetch=globalThis.fetch;
const names=['CENTER_CHECKOUT_ENABLED','MERCADO_PAGO_ACCESS_TOKEN','MERCADO_PAGO_WEBHOOK_SECRET',
  'SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','FRENET_TOKEN','CENTER_CUPULAS_ORIGIN_CEP',
  'CENTER_USE_LIVE_FRENET_RATES'];
const initial=Object.fromEntries(names.map(n=>[n,process.env[n]]));
const token='33333333-3333-4333-8333-333333333333';
const attempt='11111111-1111-4111-8111-111111111111';
const quoteId='22222222-2222-4222-8222-222222222222';
function setup(t){
  t.after(()=>{
    globalThis.fetch=existingFetch;
    for(const n of names)initial[n]===undefined?delete process.env[n]:process.env[n]=initial[n];
  });
  Object.assign(process.env,{
    CENTER_CHECKOUT_ENABLED:'true',MERCADO_PAGO_ACCESS_TOKEN:'APP_USR_fake',
    MERCADO_PAGO_WEBHOOK_SECRET:'test_secret',
    SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'sb_secret_fake',
    FRENET_TOKEN:'frenet_fake',CENTER_CUPULAS_ORIGIN_CEP:'13421548',
    CENTER_USE_LIVE_FRENET_RATES:'true'
  });
}
function req(){
  return {method:'POST',headers:{origin:'https://www.centercupulas.com.br'},body:{
    items:[{format:'conica',quantity:1,material:'algodao',top:12,bottom:20,height:20}],
    customer:{name:'Teste de homologação',phone:'11999999999'},
    shippingSelection:{code:'FRENET-1',price:17,productTotal:90},
    checkout_attempt_id:attempt
  }};
}
function res(){
  return {statusCode:200,body:null,headers:{},
    status(code){this.statusCode=code;return this;},
    setHeader(k,v){this.headers[k]=v;return this;},
    json(x){this.body=x;return this;}};
}
test('the one-use proof hashes the exact UTF-8 HTTP payload',async()=>{
  for(const raw of ['{"action":"payment"}','{"action":"payment", "items":[{"color":"é"}]}']){
    const expected=createHash('sha256').update(raw,'utf8').digest('hex');
    assert.equal(await checkoutPayloadDigest(raw),expected);
  }
  await assert.rejects(checkoutPayloadDigest(''),/invalid_checkout_payload_length/);
  await assert.rejects(checkoutPayloadDigest('x'.repeat(64001)),/invalid_checkout_payload_length/);
});
test('Edge rejects missing, malformed, replayed or unconsumable attestations',async()=>{
  let calls=0;
  const consume=async(id,digest)=>{
    calls++;
    assert.equal(id,token);
    assert.match(digest,/^[a-f0-9]{64}$/);
    return false;
  };
  assert.equal(await verifyCheckoutAttestation({rawBody:'{}',token:null,consume}),false);
  assert.equal(await verifyCheckoutAttestation({rawBody:'{}',token:'fake',consume}),false);
  assert.equal(calls,0);
  assert.equal(await verifyCheckoutAttestation({rawBody:'{}',token,consume}),false);
  assert.equal(calls,1);
  assert.equal(await verifyCheckoutAttestation({rawBody:'{}',token,consume:async()=>true}),true);
});
test('checkout mints one private proof and binds it to exact forwarded payload before MP',async t=>{
  setup(t);
  const events=[];
  globalThis.fetch=async(url,opts)=>{
    events.push({url,opts});
    if(url.endsWith('/rpc/center_issue_checkout_attestation')){
      assert.equal(opts.headers.apikey,'sb_secret_fake');
      assert.equal(opts.headers.Authorization,undefined);
      const digest=JSON.parse(opts.body).p_payload_sha256;
      assert.match(digest,/^[a-f0-9]{64}$/);
      return Response.json(token);
    }
    if(url.includes('/functions/v1/public-cart-checkout')){
      assert.equal(opts.headers['x-center-checkout-attestation'],token);
      const digest=createHash('sha256').update(opts.body).digest('hex');
      assert.equal(digest,JSON.parse(events[0].opts.body).p_payload_sha256);
      return Response.json({submitted:true,quote_id:quoteId,quote_code:'WEB-TEST',
        total:107,shipping:{status:'quoted',freight:17},packaging:{status:'estimated'}});
    }
    if(url.endsWith('/checkout/preferences')){
      assert.equal(opts.headers['X-Idempotency-Key'],quoteId);
      return Response.json({init_point:'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=test'});
    }
    throw Error('unexpected network call: '+url);
  };
  const out=res();
  await createCheckout(req(),out);
  assert.equal(out.statusCode,200);
  assert.equal(events.length,3);
  assert.ok(out.body.checkout_url.startsWith('https://'));
});
test('a failed proof issuance stops before quote and payment provider calls',async t=>{
  setup(t);
  const urls=[];
  globalThis.fetch=async url=>{
    urls.push(url);
    if(url.endsWith('/rpc/center_issue_checkout_attestation'))
      return Response.json({error:'not available'},{status:503});
    throw Error('must not reach quote or Mercado Pago');
  };
  const out=res();
  await createCheckout(req(),out);
  assert.equal(out.statusCode,503);
  assert.equal(out.body.error,'checkout_attestation_unavailable');
  assert.equal(urls.length,1);
});
test('the database prevents replay and public access to issued tokens',()=>{
  const sql=readFileSync(new URL('../supabase/migrations/20261113_checkout_server_attestation.sql',import.meta.url),'utf8');
  const edge=readFileSync(new URL('../supabase/functions/public-cart-checkout/index.ts',import.meta.url),'utf8');
  assert.match(sql,/enable row level security/);
  assert.match(sql,/revoke all on table public\.center_checkout_attestations from public, anon, authenticated/);
  assert.match(sql,/security invoker/g);
  assert.match(sql,/grant execute on function public\.center_issue_checkout_attestation\(text\)[\s\S]*?to service_role/);
  assert.match(sql,/grant execute on function public\.center_consume_checkout_attestation\(uuid,text\)[\s\S]*?to service_role/);
  assert.match(sql,/consumed_at is null/);
  assert.match(sql,/expires_at > now\(\)/);
  const index=edge.indexOf('if(action==="payment"){');
  assert.ok(index>0);
  assert.ok(edge.indexOf('verifyCheckoutAttestation',index) < edge.indexOf('loadData()',index),
    'verify proof before pricing data or CRM writes');
  assert.match(edge,/center_consume_checkout_attestation/);
  assert.match(edge,/error:"payment_request_unauthorized"/);
});
