import test from 'node:test';
import assert from 'node:assert/strict';

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
  process.env.CENTER_SHIPPING_VALIDATED='true';
  const unmeasured=makeRes();
  await freight(validRequest(),unmeasured);
  assert.equal(unmeasured.body.calibration,true);
  assert.equal(unmeasured.body.weight_basis,'peso_volumetrico_conservador');
});

test('approved measured packaging uses physical gross weight; one estimated package keeps shipping provisional', async (t) => {
  t.after(restore);
  process.env.CENTER_CUPULAS_ORIGIN_CEP = '08265220';
  process.env.FRENET_TOKEN = 'test-token';
  process.env.CENTER_SHIPPING_VALIDATED = 'true';
  const {default: freight} = await import('../api/frete.js?test=measured');
  const measured={dimensions_cm:{width:40,length:40,height:50},validation:'measured',weight_kg:1.45,requires_manual_review:false};
  let calls=0;
  globalThis.fetch=async (_url,opts)=>{
    calls++;
    const request=JSON.parse(opts.body);
    assert.equal(request.ShippingItemArray[0].Weight,1.45);
    assert.equal(request.ShippingItemArray[0]._verifiedWeight,undefined);
    return Response.json({ShippingSevicesArray:[{ServiceCode:'3',ShippingPrice:41,Carrier:'Carrier'}]});
  };
  const first=makeRes();
  await freight(validRequest({body:{recipientCep:'13421548',shipmentValue:150,packages:[measured]}}),first);
  assert.equal(first.statusCode,200);
  assert.equal(first.body.calibration,false);
  assert.equal(first.body.weight_basis,'peso_real_medido');
  assert.equal(calls,1);
});
