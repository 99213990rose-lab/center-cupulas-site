import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const originals = {
  FRENET_TOKEN: process.env.FRENET_TOKEN,
  CENTER_CUPULAS_ORIGIN_CEP: process.env.CENTER_CUPULAS_ORIGIN_CEP,
  CENTER_SHIPPING_VALIDATED: process.env.CENTER_SHIPPING_VALIDATED,
  fetch: globalThis.fetch
};
function restore() {
  for (const key of ['FRENET_TOKEN', 'CENTER_CUPULAS_ORIGIN_CEP', 'CENTER_SHIPPING_VALIDATED']) {
    if (originals[key] === undefined) delete process.env[key];
    else process.env[key] = originals[key];
  }
  globalThis.fetch = originals.fetch;
}
const makeRes = () => ({
  statusCode: 200, headers: {}, body: null,
  setHeader(key, value) { this.headers[key] = value; return this; },
  status(statusCode) { this.statusCode = statusCode; return this; },
  json(body) { this.body = body; return this; },
  end() { return this; }
});
const validPackage = [{ dimensions_cm: { width: 38, length: 38, height: 48 }}];
const validRequest = (overrides = {}) => ({
  method: 'POST',
  headers: { origin: 'https://www.centercupulas.com.br' },
  body: { recipientCep: '13421548', shipmentValue: 180, packages: validPackage },
  ...overrides
});

test('freight rejects invalid CEP, amounts and dimensions before calling the provider', async (t) => {
  t.after(restore);
  process.env.CENTER_CUPULAS_ORIGIN_CEP = '08265220';
  process.env.FRENET_TOKEN = 'test-token';
  const {default: freight} = await import('../api/frete.js?test=validation');
  globalThis.fetch = () => { throw Error('no provider call expected'); };
  for (const [body, expected] of [
    [{recipientCep: '134215489', shipmentValue: 180, packages: validPackage}, 'invalid_recipient_cep'],
    [{recipientCep: '13421548', shipmentValue: -100, packages: validPackage}, 'invalid_shipment_value'],
    [{recipientCep: '13421548', shipmentValue: 180, packages: [{dimensions_cm:{width:0,length:5,height:5}}]}, 'invalid_packages']
  ]) {
    const res = makeRes();
    await freight(validRequest({body}), res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, expected);
  }
});

test('freight rejects untrusted browser origins', async (t) => {
  t.after(restore);
  process.env.CENTER_CUPULAS_ORIGIN_CEP = '08265220';
  process.env.FRENET_TOKEN = 'test-token';
  const {default: freight} = await import('../api/frete.js?test=origin');
  const res = makeRes();
  await freight(validRequest({headers:{origin:'https://other-store.example'}}), res);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.error, 'invalid_origin');
});

test('freight filters negative carrier prices and returns normalized valid options', async (t) => {
  t.after(restore);
  process.env.CENTER_CUPULAS_ORIGIN_CEP = '08265220';
  process.env.FRENET_TOKEN = 'test-token';
  const {default: freight} = await import('../api/frete.js?test=carrier');
  let calls=0;
  globalThis.fetch = async (url, options) => {
    calls += 1;
    assert.equal(url, 'https://api.frenet.com.br/shipping/quote');
    assert.equal(JSON.parse(options.body).SellerCEP, '08265220');
    return Response.json({ShippingSevicesArray: [
      {ServiceCode:'INVALID',ShippingPrice:-20,Carrier:'Bad'},
      {ServiceCode:'VALID',ShippingPrice:48.35,Carrier:'Transportadora',ServiceDescription:'Entrega'},
      {ServiceCode:'',ShippingPrice:0,Carrier:'Unnamed'}
    ]});
  };
  const res = makeRes();
  await freight(validRequest(), res);
  assert.equal(calls,1);
  assert.equal(res.statusCode,200);
  assert.equal(res.body.options.length,1);
  assert.equal(res.body.options[0].price,48.35);
  assert.equal(res.body.origin_cep,'08265220');
  assert.equal(res.body.calibration,true);
  assert.deepEqual(res.body.indicative_estimate,{
    count:1,mean_price:48.35,min_price:48.35,max_price:48.35,
    basis:'live_frenet_carrier_quotes',payable:false
  });
  process.env.CENTER_SHIPPING_VALIDATED='true';
  const reviewed=makeRes();
  await freight(validRequest(),reviewed);
  assert.equal(reviewed.body.calibration,false);
  assert.equal(reviewed.body.indicative_estimate,null);
});


test('Frenet HTTP 200 with malformed response fails closed instead of suggesting no-options', async (t) => {
  t.after(restore);
  process.env.CENTER_CUPULAS_ORIGIN_CEP='08265220';
  process.env.FRENET_TOKEN='test-token';
  const {default: freight}=await import('../api/frete.js?test=malformed');
  globalThis.fetch=async()=>Response.json({unexpected:'payload'});
  const result=makeRes();
  await freight(validRequest(),result);
  assert.equal(result.statusCode,502);
  assert.equal(result.body.error,'invalid_freight_provider_response');
});

test('manual-review volumes are never quoted automatically to Frenet',async(t)=>{
  t.after(restore);
  process.env.CENTER_CUPULAS_ORIGIN_CEP='08265220';
  process.env.FRENET_TOKEN='test-token';
  const {default: freight}=await import('../api/frete.js?test=manual');
  globalThis.fetch=()=>{throw Error('must not contact carrier for manual-review package');};
  const result=makeRes();
  await freight(validRequest({body:{
    recipientCep:'13421548',shipmentValue:180,
    packages:[{dimensions_cm:{width:40,length:40,height:40},requires_manual_review:true}]
  }}),result);
  assert.equal(result.statusCode,400);
  assert.equal(result.body.error,'invalid_packages');
});

test('pending calibration is explicitly marked as preliminary in Frenet response',async(t)=>{
  t.after(restore);
  process.env.CENTER_CUPULAS_ORIGIN_CEP='08265220';
  process.env.FRENET_TOKEN='test-token';
  delete process.env.CENTER_SHIPPING_VALIDATED;
  const {default: freight}=await import('../api/frete.js?test=preliminary');
  globalThis.fetch=async()=>Response.json({ShippingSevicesArray:[
    {ServiceCode:'PAC',Carrier:'Correios',ServiceDescription:'PAC',ShippingPrice:'28.50',DeliveryTime:'7',Error:'false'}
  ]});
  const result=makeRes();
  await freight(validRequest(),result);
  assert.equal(result.statusCode,200);
  assert.equal(result.body.options.length,1);
  assert.equal(result.body.calibration,true);
  assert.equal(result.body.quote_status,'pending_validation');
});

test('customer cart does not display preliminary Frenet price as selectable shipping',()=>{
  const src=readFileSync(new URL('../carrinho.js',import.meta.url),'utf8');
  assert.ok(src.includes('freightOptions.length && data?.calibration !== false'));
  assert.ok(src.includes('Nenhuma tarifa'));
  assert.ok(src.includes('freightOptions = []'));
  assert.ok(src.includes('selectedShipping = null'));
});


test('average is based on quoted carrier prices for the given CEP, not a fixed guess', async(t)=>{
 t.after(restore);
 process.env.CENTER_CUPULAS_ORIGIN_CEP='08265220';
 process.env.FRENET_TOKEN='test-token';
 delete process.env.CENTER_SHIPPING_VALIDATED;
 const {default: freight}=await import('../api/frete.js?test=indicative-mean');
 globalThis.fetch=async()=>Response.json({ShippingSevicesArray:[
  {ServiceCode:'A',ShippingPrice:30.00,Carrier:'Correios'},
  {ServiceCode:'B',ShippingPrice:48.00,Carrier:'Jadlog'},
  {ServiceCode:'C',ShippingPrice:33.00,Carrier:'Correios'}
 ]});
 const res=makeRes();
 await freight(validRequest(),res);
 assert.equal(res.statusCode,200);
 assert.equal(res.body.calibration,true);
 assert.equal(res.body.indicative_estimate.mean_price,37.00);
 assert.equal(res.body.indicative_estimate.min_price,30);
 assert.equal(res.body.indicative_estimate.max_price,48);
 assert.equal(res.body.indicative_estimate.count,3);
 assert.equal(res.body.indicative_estimate.payable,false);
});

test('unvalidated estimates cannot be selected or included as charged freight',()=>{
 const src=readFileSync(new URL('../carrinho.js',import.meta.url),'utf8');
 assert.ok(src.includes('indicative?.payable === false'));
 assert.ok(src.includes('Frete estimado: média'));
 assert.ok(src.includes('Esta média não é uma tarifa garantida'));
 assert.ok(src.includes('selectedShipping = null'));
 assert.ok(src.includes('freightOptions = []'));
 const status=readFileSync(new URL('../api/mercadopago/status.js',import.meta.url),'utf8');
 assert.ok(status.includes("process.env.CENTER_SHIPPING_VALIDATED === 'true'"));
});
