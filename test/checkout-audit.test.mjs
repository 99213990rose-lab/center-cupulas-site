import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import checkoutAudit from '../api/internal/checkout-audit.js';

const originalFetch=globalThis.fetch;
const vars=['CRON_SECRET','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'];
const originalEnv=Object.fromEntries(vars.map(k=>[k,process.env[k]]));
const reset=()=>{
  globalThis.fetch=originalFetch;
  for(const key of vars){
    if(originalEnv[key]===undefined)delete process.env[key];
    else process.env[key]=originalEnv[key];
  }
};
const configure=()=>{
  process.env.CRON_SECRET='only-for-test-a-long-random-secret-012345';
  process.env.SUPABASE_URL='https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY='sb_secret_test_placeholder';
};
function response(){
  return {statusCode:200,headers:{},body:null,
    status(code){this.statusCode=code;return this;},
    setHeader(name,value){this.headers[name]=value;return this;},
    json(data){this.body=data;return this;}};
}
function request(authorized=true){
  return {method:'GET',headers:authorized
    ?{authorization:'Bearer '+process.env.CRON_SECRET}
    :{authorization:'Bearer invalid'}};
}
test('audit cron rejects unauthenticated callers and does not query the database',async(t)=>{
  t.after(reset);configure();
  globalThis.fetch=()=>{throw Error('no database call expected')};
  let res=response();
  await checkoutAudit(request(false),res);
  assert.equal(res.statusCode,401);
  assert.equal(res.body.error,'unauthorized');
  res=response();
  await checkoutAudit({method:'POST',headers:{}},res);
  assert.equal(res.statusCode,405);
});
test('daily audit detects pending emails without falsely flagging complete paid orders',async(t)=>{
  t.after(reset);configure();
  const urls=[];
  globalThis.fetch=async(url,options)=>{
    urls.push(url);
    assert.ok(options.signal instanceof AbortSignal);
    assert.ok(options.headers.apikey);
    if(url.includes('/quotes?'))return Response.json([{id:'quote-1'}]);
    if(url.includes('/orders?'))return Response.json([{id:'order-1',quote_id:'quote-1'},
      {id:'manual-1',quote_id:null}]);
    if(url.includes('/production_jobs?'))return Response.json([{order_id:'order-1'}]);
    if(url.includes('/center_order_email_outbox?'))return Response.json([{order_id:'mail-1',attempts:0,created_at:new Date(Date.now()-48*3600_000).toISOString()}]);
    if(url.includes('/center_checkout_payments?'))return Response.json([{quote_id:'quote-1',reconciliation_status:'applied'}]);
    throw Error('unexpected table');
  };
  const res=response();
  await checkoutAudit(request(),res);
  assert.equal(res.statusCode,200);
  assert.equal(res.body.status,'attention');
  assert.equal(res.body.paid_quotes_without_orders,0);
  assert.equal(res.body.paid_checkout_orders_without_jobs,0);
  assert.equal(res.body.pending_email_notifications,1);
  assert.equal(res.body.stale_email_notifications,1);
  assert.equal(res.body.pending_emails_never_attempted,1);
  assert.equal(res.body.applied_payments_without_paid_order,0);
  assert.equal(res.body.duplicate_approved_charges,0);
  assert.equal(urls.length,5);
});
test('daily audit fails closed when a paid quote has no corresponding order',async(t)=>{
  t.after(reset);configure();
  globalThis.fetch=async(url)=>{
    if(url.includes('/quotes?'))return Response.json([{id:'quote-orphan'}]);
    return Response.json([]);
  };
  const res=response();
  await checkoutAudit(request(),res);
  assert.equal(res.statusCode,503);
  assert.equal(res.body.status,'critical');
  assert.equal(res.body.paid_quotes_without_orders,1);
});
test('daily audit does not present partial database results as healthy',async(t)=>{
  t.after(reset);configure();
  globalThis.fetch=async(url)=>{
    if(url.includes('/quotes?'))return Response.json({error:'partial response'});
    return Response.json([]);
  };
  const res=response();
  await checkoutAudit(request(),res);
  assert.equal(res.statusCode,503);
  assert.equal(res.body.status,'unavailable');
});
test('daily audit detects a duplicate approved payment requiring financial review',async(t)=>{
  t.after(reset);configure();
  globalThis.fetch=async(url)=>{
    if(url.includes('/quotes?'))return Response.json([{id:'quote-1'}]);
    if(url.includes('/orders?'))return Response.json([{id:'order-1',quote_id:'quote-1'}]);
    if(url.includes('/production_jobs?'))return Response.json([{order_id:'order-1'}]);
    if(url.includes('/center_checkout_payments?'))return Response.json([
      {quote_id:'quote-1',reconciliation_status:'applied'},
      {quote_id:'quote-1',reconciliation_status:'duplicate_charge'}
    ]);
    return Response.json([]);
  };
  const res=response();
  await checkoutAudit(request(),res);
  assert.equal(res.statusCode,503);
  assert.equal(res.body.duplicate_approved_charges,1);
  assert.equal(res.body.status,'critical');
});
test('daily audit detects an applied payment missing a paid order',async(t)=>{
  t.after(reset);configure();
  globalThis.fetch=async(url)=>{
    if(url.includes('/center_checkout_payments?'))return Response.json([
      {quote_id:'quote-not-paid',reconciliation_status:'applied'}
    ]);
    return Response.json([]);
  };
  const res=response();
  await checkoutAudit(request(),res);
  assert.equal(res.statusCode,503);
  assert.equal(res.body.applied_payments_without_paid_order,1);
});
test('daily checkout health is scheduled once per day using an authenticated route',()=>{
  const config=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
  assert.deepEqual(config.crons,[{
    path:'/api/internal/checkout-audit',schedule:'15 12 * * *'
  }]);
});
