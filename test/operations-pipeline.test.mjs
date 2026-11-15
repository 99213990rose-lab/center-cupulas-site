import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

function buildPipeline(orders,jobs){
  const context={window:{}};
  runInNewContext(readFileSync(new URL('../operations-pipeline.js',import.meta.url),'utf8'),context);
  return JSON.parse(JSON.stringify(context.window.CenterCupulasPipeline.buildPipeline(orders,jobs)));
}
const order=(id,payment_status='paid',shipping={})=>({id,code:'WEB-'+id,payment_status,shipping});
const job=(id,status)=>({order_id:id,status});

test('paid orders without production are clearly flagged for review',()=>{
  const data=buildPipeline([order('a')],[]);
  assert.equal(data.counts.paid,1);
  assert.equal(data.counts.missing_job,1);
  assert.equal(data.rows[0].stage,'missing_job');
  assert.equal(data.rows[0].nextAction,'Revisar criação da ficha');
});
test('partial or unpaid orders do not appear as paid production',()=>{
  const data=buildPipeline([order('a','partial'),order('b','unpaid')],[job('a','in_progress')]);
  assert.equal(data.counts.paid,0);
  assert.ok(data.rows.every(x=>x.stage==='payment'));
});
test('multiple jobs only show completed when every job is ready or completed',()=>{
  const data=buildPipeline([order('a'),order('b')],[job('a','completed'),job('a','queued'),job('b','completed')]);
  assert.equal(data.rows[0].stage,'in_progress');
  assert.equal(data.rows[1].stage,'ready');
  assert.equal(data.counts.ready,1);
});
test('tracking is not proof of delivery, and no customer details are returned',()=>{
  const data=buildPipeline([{...order('a','paid',{tracking_code:'BR123'}),customer_name:'Privado',customer_phone:'11999999999'}],[job('a','completed')]);
  assert.equal(data.rows[0].stage,'tracked');
  assert.equal(data.rows[0].shippingLabel,'Rastreio registrado');
  assert.doesNotMatch(JSON.stringify(data),/Privado|11999999999|Entregue/);
});
test('prototype-like, null and malformed inputs cannot crash the projection',()=>{
  const data=buildPipeline([null,{},order('__proto__')],[null,{},job('__proto__','queued')]);
  assert.equal(data.rows.length,1);
  assert.equal(data.rows[0].stage,'queued');
});
test('dashboard remains read-only and depends on existing authenticated SalesOps session',()=>{
  const html=readFileSync(new URL('../salesops.html',import.meta.url),'utf8');
  assert.match(html,/id="pipeline"/);
  assert.match(html,/window\.CenterCupulasPipeline\.buildPipeline\(orders,jobs\)/);
  assert.match(html,/sb\.auth\.getSession\(\)/);
  assert.match(html,/eq\('organization_id',org\.id\)/);
});
