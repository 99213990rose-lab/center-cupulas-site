import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {buildOrderConfirmationEmail,processOrderConfirmationEmails} from '../lib/order-confirmation-email.mjs';
import emailCron from '../api/internal/order-email-cron.js';
const originalFetch=globalThis.fetch;
const keys=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','RESEND_API_KEY','CENTER_ORDER_EMAIL_FROM',
  'CENTER_ORDER_EMAIL_ENABLED','CENTER_ORDER_EMAIL_NOT_BEFORE','CRON_SECRET'];
const env=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
const orderId='22222222-2222-4222-8222-222222222222';
const quoteId='11111111-1111-4111-8111-111111111111';
function setup(t){
  t.after(()=>{
    globalThis.fetch=originalFetch;
    for(const k of keys)env[k]===undefined?delete process.env[k]:process.env[k]=env[k];
  });
  Object.assign(process.env,{
    SUPABASE_URL:'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY:'sb_secret_testing',
    RESEND_API_KEY:'re_test_key',CENTER_ORDER_EMAIL_FROM:'Center Cúpulas <pedidos@centercupulas.com.br>',
    CENTER_ORDER_EMAIL_ENABLED:'true',
    CENTER_ORDER_EMAIL_NOT_BEFORE:new Date(Date.now()-5*60*1000).toISOString(),
    CRON_SECRET:'testing-secret-for-email-cron-123456'
  });
}
function res(){return {statusCode:200,headers:{},body:null,
  status(x){this.statusCode=x;return this;},
  setHeader(k,v){this.headers[k]=v;return this;},
  json(body){this.body=body;return this;}};}
const paidOrder={id:orderId,code:'PED-WEB-TEST',payment_status:'paid',customer_name:'Nome <script>',
  total:114.34,
  shipping:{customer_email:'example@company.com',carrier:'Jadlog'},
  metadata:{line_items:[{description:'Cúpula <img>',quantity:1,material:'Linho',color:'Natural'}]}};

test('paid order receipt escapes all injected HTML and explains manufacturing',()=>{
  const result=buildOrderConfirmationEmail(paidOrder);
  assert.match(result.subject,/PED-WEB-TEST/);
  assert.match(result.text,/prazo de fabricação será confirmado/);
  assert.match(result.text,/após a postagem, não inclui fabricação/);
  assert.match(result.html,/&lt;img&gt;/);
  assert.doesNotMatch(result.html,/<script>|<img>/);
});
test('delivery never starts without explicit activation, sender, token and timestamp',async t=>{
  setup(t);
  globalThis.fetch=()=>{throw Error('must not fetch');};
  delete process.env.RESEND_API_KEY;
  assert.deepEqual(await processOrderConfirmationEmails(),{configured:false,processed:0});
  process.env.RESEND_API_KEY='re_test_key';
  delete process.env.CENTER_ORDER_EMAIL_NOT_BEFORE;
  assert.deepEqual(await processOrderConfirmationEmails(),{configured:false,processed:0});
  process.env.CENTER_ORDER_EMAIL_NOT_BEFORE=new Date().toISOString();
  process.env.CENTER_ORDER_EMAIL_ENABLED='false';
  assert.deepEqual(await processOrderConfirmationEmails(),{configured:false,processed:0});
});
test('email cron blocks unknown callers before database requests',async t=>{
  setup(t);
  globalThis.fetch=()=>{throw Error('must not fetch');};
  const response=res();
  await emailCron({method:'GET',headers:{authorization:'Bearer invalid'}},response);
  assert.equal(response.statusCode,401);
  assert.equal(response.body.error,'unauthorized');
});
test('transactional email is sent only once with order-scoped provider idempotency',async t=>{
  setup(t);
  let status='pending',attempts=0,providerSends=0;
  globalThis.fetch=async(url,opts={})=>{
    const u=new URL(String(url));
    if(u.hostname==='api.resend.com'){
      providerSends++;
      assert.equal(opts.headers['Idempotency-Key'],'center-paid-order-'+orderId);
      assert.equal(JSON.parse(opts.body).to[0],'example@company.com');
      return Response.json({id:'email_test_123'});
    }
    const table=u.pathname.split('/').pop();
    if(table==='orders')return Response.json([paidOrder]);
    if(table!=='center_order_email_outbox')throw Error('unexpected '+url);
    if(opts.method==='PATCH'){
      const state=JSON.parse(opts.body);
      if(u.searchParams.get('status')==='eq.sending'&&u.searchParams.has('updated_at'))return Response.json([]);
      if(u.searchParams.get('status')!=='eq.'+status)return Response.json([]);
      status=state.status;
      attempts=state.attempts||attempts;
      return Response.json([{order_id:orderId,status,attempts}]);
    }
    if(u.searchParams.get('status')==='eq.pending'){
      assert.ok(u.searchParams.has('created_at'),'pending must exclude old historical messages');
      return Response.json(status==='pending'?[{order_id:orderId,status,attempts,created_at:new Date().toISOString()}]:[]);
    }
    if(u.searchParams.get('status')==='eq.retry'){
      assert.ok(u.searchParams.has('created_at'),'retries must stay within provider idempotency window');
      return Response.json([]);
    }
    throw Error('unexpected query');
  };
  const first=await processOrderConfirmationEmails({limit:1});
  assert.equal(first.sent,1);
  assert.equal(status,'sent');
  const second=await processOrderConfirmationEmails({limit:1});
  assert.equal(second.processed,0);
  assert.equal(providerSends,1);
});
test('missing or rejected provider receipt cannot be marked sent',async t=>{
  setup(t);
  let status='pending';
  globalThis.fetch=async(url,opts={})=>{
    const u=new URL(String(url));
    if(u.hostname==='api.resend.com')return Response.json({message:'invalid sender'},{status:403});
    const table=u.pathname.split('/').pop();
    if(table==='orders')return Response.json([paidOrder]);
    if(table==='center_order_email_outbox'&&opts.method==='PATCH'){
      const target=JSON.parse(opts.body);
      if(u.searchParams.get('status')==='eq.sending'&&u.searchParams.has('updated_at'))return Response.json([]);
      if(u.searchParams.get('status')!=='eq.'+status)return Response.json([]);
      status=target.status;
      return Response.json([{order_id:orderId,status,attempts:1}]);
    }
    if(table==='center_order_email_outbox'&&u.searchParams.get('status')==='eq.pending')
      return Response.json([{order_id:orderId,status,attempts:0,created_at:new Date().toISOString()}]);
    if(table==='center_order_email_outbox'&&u.searchParams.get('status')==='eq.retry')
      return Response.json([]);
    throw Error('unexpected');
  };
  const result=await processOrderConfirmationEmails({limit:1});
  assert.equal(result.sent,0);
  assert.equal(status,'retry');
});
test('recovery cron and provider settings remain private and independent of payments',()=>{
  const config=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
  const webhook=readFileSync(new URL('../api/mercadopago/webhook.js',import.meta.url),'utf8');
  const source=readFileSync(new URL('../lib/order-confirmation-email.mjs',import.meta.url),'utf8');
  assert.ok(config.crons.some(c=>c.path==='/api/internal/order-email-cron'));
  assert.doesNotMatch(webhook,/processOrderConfirmationEmails/);
  assert.match(source,/CENTER_ORDER_EMAIL_ENABLED/);
  assert.match(source,/CENTER_ORDER_EMAIL_NOT_BEFORE/);
  assert.match(source,/Date\.now\(\)-23\*60\*60\*1000/);
});
