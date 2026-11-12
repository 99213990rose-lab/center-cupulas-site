import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildOrderConfirmationEmail, processOrderConfirmationEmails} from '../lib/order-confirmation-email.mjs';
import cron from '../api/internal/order-email-cron.js';

const initialFetch=globalThis.fetch;
const envKeys=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','RESEND_API_KEY','CENTER_ORDER_EMAIL_FROM','CRON_SECRET'];
const original=Object.fromEntries(envKeys.map(key=>[key,process.env[key]]));
const restore=()=>{
  globalThis.fetch=initialFetch;
  for(const [key,value] of Object.entries(original)){
    if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
};
const makeRes=()=>({statusCode:200,headers:{},body:null,
  status(v){this.statusCode=v;return this;},
  setHeader(k,v){this.headers[k.toLowerCase()]=v;return this;},
  json(v){this.body=v;return this;}
});
const orderId='22222222-2222-4222-8222-222222222222';
const quoteId='11111111-1111-4111-8111-111111111111';
const order={id:orderId,code:'PED-WEB-TEST',payment_status:'paid',customer_name:'Cliente <script>',
  total:114.34,shipping:{customer_email:'cliente@example.com',carrier:'Jadlog'},
  metadata:{line_items:[{description:'Cúpula <img>',quantity:1,material:'Algodão',color:'Preto'}]}};

test('receipt contains actual order and explicitly separates manufacturing from shipping',()=>{
  const result=buildOrderConfirmationEmail(order);
  assert.match(result.text,/PED-WEB-TEST/);
  assert.match(result.text,/114,34/);
  assert.match(result.text,/prazo de fabricação será confirmado/);
  assert.match(result.text,/após a postagem, não inclui fabricação/);
  assert.match(result.html,/meus-pedidos.html/);
  assert.doesNotMatch(result.html,/<script>|<img>/);
  assert.match(result.html,/&lt;img&gt;/);
  assert.doesNotMatch(result.text,/prazo de entrega garantido/i);
});

test('unconfigured delivery does not query the database or send emails',async t=>{
  t.after(restore);
  delete process.env.RESEND_API_KEY;
  globalThis.fetch=()=>{throw Error('must not fetch')};
  const result=await processOrderConfirmationEmails({quoteId});
  assert.deepEqual(result,{configured:false,processed:0});
});

test('secure retry endpoint refuses unauthenticated requests',async t=>{
  t.after(restore);
  process.env.CRON_SECRET='a-test-cron-secret-of-at-least-16';
  globalThis.fetch=()=>{throw Error('must not fetch')};
  const res=makeRes();
  await cron({method:'GET',headers:{authorization:'Bearer invalid'}},res);
  assert.equal(res.statusCode,401);
});

test('paid receipt is sent once and saved as sent in the outbox',async t=>{
  t.after(restore);
  Object.assign(process.env,{SUPABASE_URL:'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY:'sb_secret_testing',
    RESEND_API_KEY:'re_testing',
    CENTER_ORDER_EMAIL_FROM:'Center Cúpulas <pedidos@centercupulas.com.br>'});
  const state={status:'pending',attempts:0,requests:0};
  globalThis.fetch=async(url,opts={})=>{
    const path=new URL(String(url));
    if(path.hostname==='api.resend.com'){
      state.requests++;
      assert.equal(opts.headers['Idempotency-Key'],'center-paid-order-'+orderId);
      const payload=JSON.parse(opts.body);
      assert.deepEqual(payload.to,['cliente@example.com']);
      assert.match(payload.text,/PED-WEB-TEST/);
      return Response.json({id:'email_123'});
    }
    const table=path.pathname.split('/').pop();
    const params=path.searchParams;
    if(table==='orders'){
      if(params.has('quote_id'))return Response.json([{id:orderId}]);
      assert.equal(params.get('organization_id'),'eq.e3cb8002-ebaa-4d3a-acd3-46a678815e7b');
      return Response.json([order]);
    }
    if(table==='center_order_email_outbox'){
      if(opts.method==='PATCH'){
        const payload=JSON.parse(opts.body);
        if(params.get('status')==='eq.sending'&&params.has('updated_at'))return Response.json([]);
        if(params.get('status')!=='eq.'+state.status)return Response.json([]);
        state.status=payload.status;state.attempts=payload.attempts||state.attempts;
        return Response.json([{order_id:orderId,status:state.status,attempts:state.attempts}]);
      }
      if(state.status==='pending'||state.status==='retry')
        return Response.json([{order_id:orderId,status:state.status,attempts:state.attempts}]);
      return Response.json([]);
    }
    throw Error('unexpected query '+url);
  };
  const first=await processOrderConfirmationEmails({quoteId,limit:1});
  assert.equal(first.sent,1);
  assert.equal(state.status,'sent');
  const second=await processOrderConfirmationEmails({quoteId,limit:1});
  assert.equal(second.processed,0);
  assert.equal(state.requests,1);
});

test('checkout remains independent of the receipt provider',()=>{
  const webhook=readFileSync(new URL('../api/mercadopago/webhook.js',import.meta.url),'utf8');
  const sql=readFileSync(new URL('../supabase/migrations/20261027_center_order_email_outbox.sql',import.meta.url),'utf8');
  const config=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
  assert.ok(webhook.includes("await processOrderConfirmationEmails({quoteId, limit:1})"));
  assert.ok(webhook.includes('catch { console.error'));
  assert.ok(sql.includes('on conflict (order_id) do nothing'));
  assert.ok(sql.includes('enable row level security'));
  assert.ok(config.crons.some(c=>c.path==='/api/internal/order-email-cron'));
});
