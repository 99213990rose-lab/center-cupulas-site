import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import customerOrders from '../api/account/orders.js';

const initialFetch=globalThis.fetch;
const original=Object.fromEntries(['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_PUBLISHABLE_KEY'].map(key=>[key,process.env[key]]));
const userId='11111111-1111-4111-8111-111111111111';
function setup(){
  process.env.SUPABASE_URL='https://testing.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY='sb_secret_test_key';
  process.env.SUPABASE_PUBLISHABLE_KEY='sb_publishable_test';
}
function reset(){globalThis.fetch=initialFetch;for(const [k,v] of Object.entries(original)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
function res(){
 return {statusCode:200,headers:{},body:null,
  status(v){this.statusCode=v;return this;},
  setHeader(k,v){this.headers[k.toLowerCase()]=v;return this;},
  json(v){this.body=v;return this;}
 };
}
const req=(overrides={})=>({method:'GET',headers:{authorization:'Bearer abc.test.valid.jwt.token.with.overthirtychars'},...overrides});
test('optional accounts: anonymous visitors cannot read order history',async t=>{
 t.after(reset);setup();globalThis.fetch=()=>{throw Error('must not access database')};
 const out=res();await customerOrders(req({headers:{}}),out);
 assert.equal(out.statusCode,401);
 assert.equal(out.body.error,'login_required');
 const denied=res();await customerOrders(req({method:'POST'}),denied);
 assert.equal(denied.statusCode,405);
});
test('optional accounts: unverified identity does not expose any order',async t=>{
 t.after(reset);setup();let calls=0;
 globalThis.fetch=async url=>{calls++;assert.ok(String(url).includes('/auth/v1/user'));
   return Response.json({id:userId,email:'owner@example.com',email_confirmed_at:null});
 };
 const out=res();await customerOrders(req(),out);
 assert.equal(out.statusCode,403);assert.equal(calls,1);
});
test('optional accounts: verified email filters paid orders server-side and hides private costs',async t=>{
 t.after(reset);setup();const requests=[];
 globalThis.fetch=async(url,opts)=>{
  requests.push(String(url));
  if(String(url).includes('/auth/v1/user'))return Response.json({
   id:userId,email:'BUYER@Example.COM',email_confirmed_at:'2026-10-21T05:00:00Z'
  });
  if(String(url).includes('/rest/v1/orders?')) {
   const u=new URL(url);
   assert.equal(u.searchParams.get('shipping->>customer_email'),'eq.buyer@example.com');
   assert.equal(u.searchParams.get('payment_status'),'eq.paid');
   assert.equal(u.searchParams.get('organization_id'),'eq.e3cb8002-ebaa-4d3a-acd3-46a678815e7b');
   assert.ok(opts.headers.apikey.startsWith('sb_secret_'));
   return Response.json([{
    id:'22222222-2222-4222-8222-222222222222',
    code:'PED-WEB-TEST',status:'confirmed',total:39.99,payment_status:'paid',
    created_at:'2026-10-21T05:00:00Z',
    shipping:{fulfillment:'pickup',freight:0,customer_email:'buyer@example.com',
      box_purchase_budget:{internal_cost:999,margin:1}},
    metadata:{line_items:[{description:'Cúpula cilíndrica',material:'algodão',color:'bege',
      quantity:1,line_total:39.99,unit_price:39.99}],payment_id:'should-not-leak',
      profit:500}
   }]);
  }
  if(String(url).includes('/rest/v1/production_jobs?'))return Response.json([{
    order_id:'22222222-2222-4222-8222-222222222222',status:'queued'
  }]);
  throw Error('unexpected URL');
 };
 const out=res();await customerOrders(req({query:{email:'victim@example.com'}}),out);
 assert.equal(out.statusCode,200);
 assert.equal(out.body.orders.length,1);
 assert.equal(out.body.orders[0].production_status,'queued');
 assert.equal(out.body.orders[0].total,39.99);
 assert.equal(out.body.orders[0].items.length,1);
 assert.equal(out.body.orders[0].shipping.fulfillment,'pickup');
 const json=JSON.stringify(out.body);
 for(const secret of ['internal_cost','box_purchase_budget','customer_email','payment_id','profit','victim@example.com'])assert.ok(!json.includes(secret),secret);
 assert.equal(requests.length,3);
 assert.equal(out.headers['cache-control'],'private, no-store');
});
test('customer interface stays simple, with no administrative controls',()=>{
 const page=readFileSync(new URL('../meus-pedidos.html',import.meta.url),'utf8');
 const cart=readFileSync(new URL('../carrinho.html',import.meta.url),'utf8');
 const backend=readFileSync(new URL('../api/account/orders.js',import.meta.url),'utf8');
 const edge=readFileSync(new URL('../supabase/functions/public-cart-checkout/index.ts',import.meta.url),'utf8');
 assert.ok(page.includes('Minha conta') && page.includes('data-account-orders'));
 assert.ok(page.includes('Criar conta'));
 assert.ok(page.includes('Ir para a loja'));
 for(const word of ['SalesOps','SUPABASE_SERVICE_ROLE_KEY','Configuração Mercado Pago','Frenet Token'])assert.ok(!page.includes(word),word);
 assert.ok(cart.includes('E-mail (opcional)'));
 assert.ok(!cart.includes('email" type="email" autocomplete="email" maxlength="180" required'));
 assert.ok(edge.includes('customer_email:email||null'));
 assert.ok(backend.includes("shipping->>customer_email"));
 assert.ok(backend.includes("user.email_confirmed_at"));
 assert.ok(!backend.includes('req.query.email'));
});
