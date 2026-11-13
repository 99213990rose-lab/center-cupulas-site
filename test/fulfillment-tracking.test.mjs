import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import register from '../api/operations/record-tracking.js';

const original=globalThis.fetch;
const envKeys=['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','SUPABASE_SERVICE_ROLE_KEY'];
const env=Object.fromEntries(envKeys.map(k=>[k,process.env[k]]));
const token='a'.repeat(44);
const userId='11111111-1111-4111-8111-111111111111';
const code='PED-TEST-001';
function setup(t){
  t.after(()=>{
    globalThis.fetch=original;
    for(const k of envKeys) env[k]===undefined?delete process.env[k]:process.env[k]=env[k];
  });
  Object.assign(process.env,{
    SUPABASE_URL:'https://example.supabase.co',
    SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',
    SUPABASE_SERVICE_ROLE_KEY:'sb_secret_test'
  });
}
function req(overrides={}){
  return {method:'POST',
    headers:{origin:'https://www.centercupulas.com.br',authorization:'Bearer '+token},
    body:{order_code:code,tracking_codes:['AB123456789BR']},...overrides};
}
function res(){
 return {statusCode:200,headers:{},body:null,
   status(value){this.statusCode=value;return this;},
   setHeader(k,v){this.headers[k]=v;return this;},
   json(data){this.body=data;return this;}};
}
test('shipment update rejects anonymous requests and invalid codes without any writes',async t=>{
  setup(t);
  globalThis.fetch=()=>{throw Error('must not fetch');};
  const anon=res();await register(req({headers:{origin:'https://www.centercupulas.com.br'}}),anon);
  assert.equal(anon.statusCode,401);
  const cors=res();await register(req({headers:{origin:'https://evil.example',authorization:'Bearer '+token}}),cors);
  assert.equal(cors.statusCode,403);
  const invalid=res();await register(req({body:{order_code:code,tracking_codes:['https://attack.example?q=1']}}),invalid);
  assert.equal(invalid.statusCode,400);
});
test('only owner can write tracking; staff role is rejected before service credentials are used',async t=>{
  setup(t);let calls=0;
  globalThis.fetch=async url=>{
    calls++;
    if(url.endsWith('/auth/v1/user'))return Response.json({id:userId,email_confirmed_at:'2026-11-01T00:00:00Z'});
    if(url.endsWith('/rpc/wa_org_role'))return Response.json('viewer');
    throw Error('service role must not be called');
  };
  const out=res();await register(req(),out);
  assert.equal(out.statusCode,403);assert.equal(out.body.error,'owner_access_required');
  assert.equal(calls,2);
});
test('owner session updates one order with a private, authenticated DB RPC',async t=>{
  setup(t);let calls=0;
  globalThis.fetch=async(url,opts)=>{
    calls++;
    if(url.endsWith('/auth/v1/user')){
      assert.equal(opts.headers.Authorization,'Bearer '+token);
      assert.equal(opts.headers.apikey,'sb_publishable_test');
      return Response.json({id:userId,email_confirmed_at:'2026-11-01T00:00:00Z'});
    }
    if(url.endsWith('/rpc/wa_org_role')){
      assert.equal(opts.headers.apikey,'sb_publishable_test');
      assert.equal(opts.headers.Authorization,'Bearer '+token);
      return Response.json('owner');
    }
    if(url.endsWith('/rpc/center_record_order_tracking_once')){
      assert.equal(opts.headers.apikey,'sb_secret_test');
      assert.equal(opts.headers.Authorization,undefined);
      assert.deepEqual(JSON.parse(opts.body),{
        p_order_code:code,p_tracking_codes:['AB123456789BR'],p_actor_id:userId
      });
      return Response.json({ok:true,reused:false,order_code:code,tracking_codes:['AB123456789BR']});
    }
    throw Error('Unexpected route');
  };
  const out=res();await register(req(),out);
  assert.equal(calls,3);
  assert.equal(out.statusCode,200);
  assert.deepEqual(out.body,{ok:true,reused:false,order_code:code,tracking_codes:['AB123456789BR']});
});
test('a conflicting tracking replacement is rejected with a safe error code',async t=>{
  setup(t);
  globalThis.fetch=async url=>{
    if(url.endsWith('/auth/v1/user'))return Response.json({id:userId,email_confirmed_at:'2026-11-01T00:00:00Z'});
    if(url.endsWith('/rpc/wa_org_role'))return Response.json('owner');
    if(url.endsWith('/rpc/center_record_order_tracking_once'))
      return Response.json({message:'tracking_already_registered'}, {status:400});
    throw Error('unexpected call');
  };
  const out=res();await register(req(),out);
  assert.equal(out.statusCode,409);
  assert.deepEqual(out.body,{error:'tracking_already_registered'});
});
test('tracking SQL is service-only, idempotent, and preserves payment and line items',()=>{
  const sql=readFileSync(new URL('../supabase/migrations/20261113_center_fulfillment_tracking.sql',import.meta.url),'utf8');
  const api=readFileSync(new URL('../api/account/orders.js',import.meta.url),'utf8');
  assert.match(sql,/enable row level security/);
  assert.match(sql,/from public, anon, authenticated/);
  assert.match(sql,/security invoker/);
  assert.match(sql,/for update/);
  assert.match(sql,/tracking_already_registered/);
  assert.match(sql,/m\.role in \('owner', 'admin'\)/);
  assert.match(sql,/to service_role/);
  assert.doesNotMatch(sql,/set\s+payment_status|set\s+total|set\s+line_items/i);
  assert.match(api,/tracking_codes:Array\.isArray\(ship\.tracking_codes\)/);
});
