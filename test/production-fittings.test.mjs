import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import productionReview from '../api/operations/production-fittings.js';

const existingFetch=globalThis.fetch;
const envs=['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','SUPABASE_SERVICE_ROLE_KEY'];
const previous=Object.fromEntries(envs.map(k=>[k,process.env[k]]));
const sessionToken='t'.repeat(48);
const operatorId='11111111-1111-4111-8111-111111111111';
const orderCode='PED-WEB-010';
const request=(method='GET',overrides={})=>({
  method,headers:{origin:'https://www.centercupulas.com.br',
    authorization:'Bearer '+sessionToken},
  ...(method==='POST'?{body:{order_code:orderCode,fittings:['nacional','lira']}}:{}),
  ...overrides
});
const response=()=>({
  statusCode:200,headers:{},body:null,
  status(code){this.statusCode=code;return this;},
  setHeader(k,value){this.headers[k]=value;return this;},
  json(body){this.body=body;return this;}
});
function setup(t){
  t.after(()=>{
    globalThis.fetch=existingFetch;
    for(const name of envs){
      if(previous[name]===undefined)delete process.env[name];
      else process.env[name]=previous[name];
    }
  });
  process.env.SUPABASE_URL='https://example.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY='sb_publishable_test';
  process.env.SUPABASE_SERVICE_ROLE_KEY='sb_secret_test';
}
function mockOwner({role='owner',queue=[],confirmed=null,dbError=null}={}){
  const paths=[];
  globalThis.fetch=async(url,options)=>{
    paths.push({url,options});
    if(url.endsWith('/auth/v1/user')) {
      assert.equal(options.headers.Authorization,'Bearer '+sessionToken);
      return Response.json({id:operatorId,email_confirmed_at:'2026-11-01T10:00:00Z'});
    }
    if(url.endsWith('/rpc/wa_org_role')){
      assert.equal(options.headers.Authorization,'Bearer '+sessionToken);
      return Response.json(role);
    }
    if(url.includes('/rest/v1/rpc/center_')){
      assert.equal(options.headers.apikey,'sb_secret_test');
      assert.equal(options.headers.Authorization,undefined);
      if(dbError)return Response.json({message:dbError},{status:400});
      if(url.endsWith('center_pending_production_fitting_reviews'))return Response.json(queue);
      return Response.json(confirmed||{ok:true,reused:false,
        order_code:orderCode,fittings:['nacional','lira']});
    }
    throw Error('unapproved request');
  };
  return paths;
}
test('anonymous access and invalid user roles never reach the privileged RPC',async t=>{
  setup(t);
  let calls=0;
  globalThis.fetch=()=>{calls++;throw Error('no request expected')};
  const noAuth=response();
  await productionReview(request('GET',{headers:{}}),noAuth);
  assert.equal(noAuth.statusCode,401);
  assert.equal(calls,0);
  mockOwner({role:'viewer'});
  const forbidden=response();
  await productionReview(request(),forbidden);
  assert.equal(forbidden.statusCode,403);
  assert.equal(forbidden.body.error,'owner_access_required');
});
test('untrusted origins and malformed fitting lists are rejected before auth',async t=>{
  setup(t);
  globalThis.fetch=()=>{throw Error('must not make request')};
  const cross=response();
  await productionReview(request('POST',{headers:{
    origin:'https://untrusted.example',authorization:'Bearer '+sessionToken
  }}),cross);
  assert.equal(cross.statusCode,403);
  for(const fittings of [[],['national'],['nacional',''],['nacional',null],Array(26).fill('lira')]){
    const invalid=response();
    await productionReview(request('POST',{body:{order_code:orderCode,fittings}}),invalid);
    assert.equal(invalid.statusCode,400);
  }
});
test('owner reads a bounded queue without customer contact information',async t=>{
  setup(t);
  const queue=[{order_code:orderCode,job_status:'queued',items:[
    {index:0,format:'conica',material:'linho',color:'natural',
      dimensions:{top:12,bottom:20,height:20},quantity:1,encaixe:null}
  ]}];
  const calls=mockOwner({queue});
  const out=response();
  await productionReview(request(),out);
  assert.equal(out.statusCode,200);
  assert.deepEqual(out.body.reviews,queue);
  assert.equal(out.body.has_more,false);
  assert.equal(calls.length,3);
  assert.ok(calls[2].url.endsWith('/rpc/center_pending_production_fitting_reviews'));
  assert.deepEqual(JSON.parse(calls[2].options.body),{});
});
test('confirmed owner provides exact per-item fitting choices and immutable actor',async t=>{
  setup(t);
  const calls=mockOwner();
  const out=response();
  await productionReview(request('POST'),out);
  assert.equal(out.statusCode,200);
  assert.deepEqual(out.body,{ok:true,reused:false,
    order_code:orderCode,fittings:['nacional','lira']});
  assert.deepEqual(JSON.parse(calls[2].options.body),{
    p_order_code:orderCode,
    p_fittings:['nacional','lira'],
    p_actor_id:operatorId
  });
});
test('conflicting confirmations fail closed without leaking database error details',async t=>{
  setup(t);
  mockOwner({dbError:'fittings_already_confirmed private order details'});
  const out=response();
  await productionReview(request('POST'),out);
  assert.equal(out.statusCode,409);
  assert.deepEqual(out.body,{error:'fittings_already_confirmed'});
});
test('database migration keeps original paid quotes immutable and RLS/private RPC enforced',()=>{
  const sql=readFileSync(new URL('../supabase/migrations/20261113_center_production_fitting_confirmation.sql',import.meta.url),'utf8');
  const index=sql.indexOf('create or replace function public.center_record_production_fittings_once');
  const end=sql.indexOf('$fn$;',index);
  const mutation=sql.slice(index,end);
  assert.match(sql,/alter table public.center_production_fitting_reviews enable row level security/);
  assert.match(sql,/security invoker/g);
  assert.match(sql,/m\.role in \('owner', 'admin'\)/);
  assert.match(mutation,/for update of j/);
  assert.match(mutation,/update public\.production_jobs/);
  assert.doesNotMatch(mutation,/update public\.(orders|quotes)|set\s+payment_status|set\s+total|set\s+line_items/i);
  assert.match(mutation,/fittings_already_confirmed/);
  assert.match(sql,/grant execute on function public\.center_record_production_fittings_once[\s\S]*?to service_role/);
  assert.match(sql,/grant execute on function public\.center_pending_production_fitting_reviews[\s\S]*?to service_role/);
  assert.match(sql,/jsonb_array_elements\([\s\S]*?j\.specs->'line_items'/);
});
