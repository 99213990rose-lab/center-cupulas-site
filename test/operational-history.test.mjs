import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import operations from '../api/operations/record-tracking.js';

const previousFetch=globalThis.fetch;
const names=['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','SUPABASE_SERVICE_ROLE_KEY'];
const saved=Object.fromEntries(names.map(n=>[n,process.env[n]]));
const token='t'.repeat(48);
const userId='11111111-1111-4111-8111-111111111111';
function setup(t) {
  t.after(()=>{
    globalThis.fetch=previousFetch;
    for(const n of names){
      if(saved[n]===undefined)delete process.env[n];
      else process.env[n]=saved[n];
    }
  });
  Object.assign(process.env,{SUPABASE_URL:'https://example.supabase.co',
    SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',
    SUPABASE_SERVICE_ROLE_KEY:'sb_secret_test'});
}
const req=(overrides={})=>({method:'GET',query:{operation:'operations_health'},
  headers:{origin:'https://www.centercupulas.com.br',
    authorization:'Bearer '+token},...overrides});
const res=()=>({statusCode:200,headers:{},body:null,
  status(n){this.statusCode=n;return this;},
  setHeader(name,v){this.headers[name]=v;return this;},
  json(value){this.body=value;return this;}});
const health={
  last_audit:{
    checked_day:'2026-11-13',status:'attention',scan_count:1,
    metrics:{paid_quotes_without_orders:0,pending_email_notifications:4,
      active_online_orders_missing_fitting:8}
  },
  incidents:[
    {key:'email_delivery',status:'open',count:4},
    {key:'unconfirmed_fittings',status:'open',count:8}
  ]
};
function mock({role='owner',summary=health,unavailable=false}={}){
  const calls=[];
  globalThis.fetch=async(url,options)=>{
    calls.push([url,options]);
    if(url.endsWith('/auth/v1/user'))
      return Response.json({id:userId,email_confirmed_at:'2026-11-01T10:00:00Z'});
    if(url.endsWith('/rpc/wa_org_role')) {
      assert.equal(options.headers.Authorization,'Bearer '+token);
      return Response.json(role);
    }
    if(url.endsWith('/rpc/center_operational_health_summary')){
      assert.equal(options.headers.apikey,'sb_secret_test');
      assert.equal(options.headers.Authorization,undefined);
      if(unavailable)return Response.json({error:'private database failure'},{status:503});
      return Response.json(summary);
    }
    throw Error('unexpected call');
  };
  return calls;
}
test('operational health rejects unauthenticated calls before privileged database access',async t=>{
  setup(t);
  globalThis.fetch=()=>{throw Error('must not reach network')};
  const response=res();
  await operations(req({headers:{origin:'https://www.centercupulas.com.br'}}),response);
  assert.equal(response.statusCode,401);
  assert.equal(response.body.error,'login_required');
});
test('operational health cannot be mutated by POST or accessed cross-origin',async t=>{
  setup(t);
  globalThis.fetch=()=>{throw Error('must not reach network')};
  let response=res();
  await operations(req({method:'POST'}),response);
  assert.equal(response.statusCode,405);
  response=res();
  await operations(req({headers:{origin:'https://evil.example',authorization:'Bearer '+token}}),response);
  assert.equal(response.statusCode,403);
});
test('only a verified owner or admin can inspect incident counts',async t=>{
  setup(t);
  const calls=mock({role:'viewer'});
  const response=res();
  await operations(req(),response);
  assert.equal(response.statusCode,403);
  assert.equal(calls.length,2);
});
test('owner sees persisted incidents, no customer information or credentials',async t=>{
  setup(t);
  const calls=mock();
  const response=res();
  await operations(req(),response);
  assert.equal(response.statusCode,200);
  assert.deepEqual(response.body,{health});
  assert.equal(calls.length,3);
  assert.equal(calls[2][0],'https://example.supabase.co/rest/v1/rpc/center_operational_health_summary');
  assert.equal(response.headers['Cache-Control'],'private, no-store');
});
test('malformed or failing database response never produces a false healthy result',async t=>{
  setup(t);
  mock({summary:{incidents:'invalid',last_audit:{}}});
  const malformed=res();
  await operations(req(),malformed);
  assert.equal(malformed.statusCode,503);
  assert.equal(malformed.body.error,'temporarily_unavailable');
  mock({unavailable:true});
  const unavailable=res();
  await operations(req(),unavailable);
  assert.equal(unavailable.statusCode,503);
});
test('operation data and functions remain private and no new serverless routes are added',()=>{
  const sql=readFileSync(new URL('../supabase/migrations/20261113_center_operational_incidents.sql',import.meta.url),'utf8');
  const route=readFileSync(new URL('../api/operations/record-tracking.js',import.meta.url),'utf8');
  assert.match(sql,/alter table public\.center_ops_audit_runs enable row level security/);
  assert.match(sql,/alter table public\.center_ops_incidents enable row level security/);
  assert.match(sql,/security invoker/g);
  assert.match(sql,/revoke all on function public\.center_operational_health_summary\(\)/);
  assert.match(sql,/revoke all on function public\.center_record_operational_audit\(\)/);
  assert.match(sql,/to service_role/);
  assert.match(sql,/pg_advisory_xact_lock/);
  assert.match(sql,/on conflict \(checked_day\)/);
  assert.match(sql,/status='resolved'/);
  assert.doesNotMatch(sql,/update public\.(orders|quotes|production_jobs)/);
  assert.match(route,/operations_health/);
});
