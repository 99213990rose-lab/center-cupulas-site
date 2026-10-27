import test from 'node:test';
import assert from 'node:assert/strict';
import {notifyCenterPaidSale,saleAlertIsConfigured} from '../api/mercadopago/sale-alert.js';

const names=['CENTER_SALE_ALERT_ENABLED','CENTER_SALE_ALERT_RECIPIENT',
  'CENTER_SALE_ALERT_TEMPLATE','META_WA_PHONE_NUMBER_ID','META_WA_ACCESS_TOKEN',
  'META_GRAPH_API_VERSION','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'];
const prev=Object.fromEntries(names.map(k=>[k,process.env[k]]));
const originalFetch=globalThis.fetch;
const id='11111111-1111-4111-8111-111111111111';
function reset(){for(const k of names){if(prev[k]===undefined)delete process.env[k];else process.env[k]=prev[k]}globalThis.fetch=originalFetch}
function configure(){
  process.env.CENTER_SALE_ALERT_ENABLED='true';
  process.env.CENTER_SALE_ALERT_RECIPIENT='5519999998888';
  process.env.CENTER_SALE_ALERT_TEMPLATE='center_venda_confirmada';
  process.env.META_WA_PHONE_NUMBER_ID='12345678';
  process.env.META_WA_ACCESS_TOKEN='fake_internal_token';
  process.env.META_GRAPH_API_VERSION='v25.0';
  process.env.SUPABASE_URL='https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY='sb_secret_for_test';
}
test('sale alerts default off, never require or affect payments',async t=>{
  t.after(reset);
  delete process.env.CENTER_SALE_ALERT_ENABLED;
  globalThis.fetch=()=>{throw Error('no calls expected')};
  assert.equal(saleAlertIsConfigured(),false);
  assert.deepEqual(await notifyCenterPaidSale(id),{status:'disabled'});
});
test('approved alert uses one claim, approved template and server secret',async t=>{
  t.after(reset);configure();
  const requests=[];
  globalThis.fetch=async(url,options={})=>{
    requests.push({url:String(url),options});
    if(requests.length===1)return Response.json({code:'PED-WEB-TEST',amount:168.93,quantity:2});
    if(requests.length===2)return Response.json({messages:[{id:'wamid.test123'}]});
    return new Response(null,{status:204});
  };
  assert.deepEqual(await notifyCenterPaidSale(id),{status:'sent'});
  assert.equal(requests.length,3);
  assert.match(requests[0].url,/rpc\/claim_center_sale_whatsapp_alert$/);
  assert.equal(requests[0].options.headers.apikey,'sb_secret_for_test');
  assert.equal(requests[0].options.headers.Authorization,undefined);
  const meta=JSON.parse(requests[1].options.body);
  assert.equal(meta.to,'5519999998888');
  assert.equal(meta.type,'template');
  assert.equal(meta.template.name,'center_venda_confirmada');
  assert.deepEqual(meta.template.components[0].parameters.map(p=>p.text),
    ['PED-WEB-TEST','R$ 168,93','2']);
  assert.match(requests[2].url,/status=eq.sending/);
  assert.equal(JSON.parse(requests[2].options.body).status,'sent');
});
test('already claimed sale cannot send another message',async t=>{
  t.after(reset);configure();
  let calls=0;
  globalThis.fetch=async()=>{calls++;return Response.json(null)};
  assert.deepEqual(await notifyCenterPaidSale(id),{status:'already_claimed'});
  assert.equal(calls,1);
});
test('definitive Meta rejection leaves an auditable retry',async t=>{
  t.after(reset);configure();
  let calls=0,updated;
  globalThis.fetch=async(url,options={})=>{
    calls++;
    if(calls===1)return Response.json({code:'PED-WEB-TEST',amount:100,quantity:1});
    if(calls===2)return Response.json({error:{code:131005}},{status:403});
    updated=JSON.parse(options.body);
    return new Response(null,{status:204});
  };
  assert.deepEqual(await notifyCenterPaidSale(id),{status:'retry'});
  assert.equal(updated.status,'retry');
  assert.equal(updated.last_error_code,'meta_131005');
});
