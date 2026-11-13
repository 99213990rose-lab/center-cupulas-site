import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import checkoutWithAttestation from '../api/mercadopago/create-checkout.js';

// Existing payment-mock fixtures focus on the financial contract and never
// contact a real database. The dedicated attestation tests exercise issuance,
// cryptographic payload binding and replay resistance independently.
async function createCheckout(req,res) {
  const priorFetch=globalThis.fetch;
  globalThis.fetch=(url,options)=>{
    if(String(url).endsWith('/rest/v1/rpc/center_issue_checkout_attestation'))
      return Promise.resolve(Response.json('33333333-3333-4333-8333-333333333333'));
    return priorFetch(url,options);
  };
  try{return await checkoutWithAttestation(req,res);}
  finally{globalThis.fetch=priorFetch;}
}


const edge = readFileSync(new URL('../supabase/functions/public-cart-checkout/index.ts',import.meta.url),'utf8');
const cart = readFileSync(new URL('../carrinho.js',import.meta.url),'utf8');
const sql = readFileSync(new URL('../supabase/migrations/20261113_center_checkout_attempt_idempotency.sql',import.meta.url),'utf8');
const keys = ['CENTER_CHECKOUT_ENABLED','MERCADO_PAGO_ACCESS_TOKEN','MERCADO_PAGO_WEBHOOK_SECRET',
  'SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','FRENET_TOKEN','CENTER_CUPULAS_ORIGIN_CEP','CENTER_USE_LIVE_FRENET_RATES'];
const prior=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
const savedFetch=globalThis.fetch;
const attempt='11111111-1111-4111-8111-111111111111';
const quoteId='22222222-2222-4222-8222-222222222222';
const quoteResponse=()=>({submitted:true,quote_id:quoteId,quote_code:'WEB-TEST',
  total:107,shipping:{status:'quoted',freight:17},packaging:{status:'estimated'}});
function setup(t){
  t.after(()=>{
    globalThis.fetch=savedFetch;
    for(const k of keys)prior[k]===undefined?delete process.env[k]:process.env[k]=prior[k];
  });
  Object.assign(process.env,{
    CENTER_CHECKOUT_ENABLED:'true',MERCADO_PAGO_ACCESS_TOKEN:'APP_USR_test',
    MERCADO_PAGO_WEBHOOK_SECRET:'test',SUPABASE_URL:'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY:'sb_secret_test',FRENET_TOKEN:'test',
    CENTER_CUPULAS_ORIGIN_CEP:'13421548',CENTER_USE_LIVE_FRENET_RATES:'true'
  });
}
function req(id=attempt){
  return {method:'POST',headers:{origin:'https://www.centercupulas.com.br'},body:{
    items:[{format:'conica',quantity:1,material:'algodao',top:12,bottom:20,height:20}],
    customer:{name:'Teste',phone:'11999999999'},
    shippingSelection:{code:'FRENET-1',price:17,productTotal:90},
    checkout_attempt_id:id
  }};
}
function res(){return {statusCode:200,body:null,headers:{},
  status(x){this.statusCode=x;return this;},
  setHeader(k,v){this.headers[k]=v;return this;},
  json(v){this.body=v;return this;}};}

test('Vercel forwards stable idempotency UUID to the quote service',async t=>{
  setup(t);
  const calls=[];
  globalThis.fetch=async(url,opts)=>{
    calls.push({url,opts});
    if(url.includes('public-cart-checkout'))return Response.json(quoteResponse());
    if(url.endsWith('/checkout/preferences'))return Response.json({init_point:'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=test'});
    throw Error('unexpected');
  };
  const out=res();await createCheckout(req(),out);
  assert.equal(out.statusCode,200);
  assert.equal(JSON.parse(calls[0].opts.body).checkout_attempt_id,attempt);
  assert.equal(calls[1].opts.headers['X-Idempotency-Key'],quoteId);
  assert.equal(calls.length,2);
});
test('a conflicting retry never opens a new Mercado Pago payment preference',async t=>{
  setup(t);
  const calls=[];
  globalThis.fetch=async(url,opts)=>{
    calls.push(url);
    if(url.includes('public-cart-checkout'))return Response.json({error:'checkout_attempt_conflict'},{status:409});
    throw Error('must not call payment provider');
  };
  const out=res();await createCheckout(req(),out);
  assert.equal(out.statusCode,409);
  assert.equal(out.body.error,'checkout_attempt_conflict');
  assert.equal(calls.length,1);
});
test('an already-paid retry cannot generate another payment preference',async t=>{
  setup(t);
  globalThis.fetch=async(url)=>{
    if(url.includes('public-cart-checkout'))return Response.json({error:'checkout_already_paid'},{status:409});
    throw Error('provider must not be called');
  };
  const out=res();await createCheckout(req(),out);
  assert.equal(out.statusCode,409);
  assert.equal(out.body.error,'checkout_already_paid');
});
test('fallback UUID generation uses the imported crypto primitive',()=>{
  const source=readFileSync(new URL('../api/mercadopago/create-checkout.js',import.meta.url),'utf8');
  assert.match(source,/import \{createHmac,randomUUID\} from 'node:crypto'/);
  assert.match(source,/\?clientAttempt:randomUUID\(\)/);
  assert.doesNotMatch(source,/crypto\.randomUUID\(\)/);
});

test('legacy browsers get a generated server UUID rather than being broken',async t=>{
  setup(t);
  globalThis.fetch=async(url,opts)=>{
    if(url.includes('public-cart-checkout')){
      const id=JSON.parse(opts.body).checkout_attempt_id;
      assert.match(id,/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i);
      return Response.json(quoteResponse());
    }
    return Response.json({init_point:'https://www.mercadopago.com.br/checkout/v1/redirect'});
  };
  const out=res();await createCheckout(req(null),out);
  assert.equal(out.statusCode,200);
});
test('Edge quote creation uses atomic reuse only for paid checkout; manual quotes unchanged',()=>{
  assert.match(edge,/action==="payment"\)\{[\s\S]*?\.rpc\("center_create_checkout_quote_once"/);
  assert.match(edge,/if\(result\.status!=="draft"\)/);
  assert.match(edge,/Manual WhatsApp quotes preserve their original workflow/);
  assert.match(edge,/\.from\("quotes"\)\.insert/);
});
test('idempotency table and function are private, RLS protected and serialize retries',()=>{
  assert.match(sql,/primary key/);
  assert.match(sql,/enable row level security/);
  assert.match(sql,/pg_advisory_xact_lock/);
  assert.match(sql,/checkout_attempt_conflict/);
  assert.match(sql,/security invoker/);
  assert.match(sql,/revoke all on function public\.center_create_checkout_quote_once/);
  assert.match(sql,/grant execute on function public\.center_create_checkout_quote_once[\s\S]*?to service_role/);
});
test('browser persists only hashed retry fingerprint and no personal fields',()=>{
  assert.match(cart,/crypto\.subtle\.digest\('SHA-256'/);
  assert.match(cart,/CHECKOUT_ATTEMPT_KEY/);
  assert.match(cart,/checkout_attempt_id/);
  assert.match(cart,/sessionStorage\.setItem\(CHECKOUT_ATTEMPT_KEY,[\s\S]*?JSON\.stringify\(\{id:uuid,fingerprint,at:Date\.now\(\)\}\)/);
  assert.doesNotMatch(cart,/sessionStorage\.setItem\(CHECKOUT_ATTEMPT_KEY,\s*JSON\.stringify\(\{[^}]*customer/);
});
