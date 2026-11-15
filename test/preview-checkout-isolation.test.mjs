import test from 'node:test';
import assert from 'node:assert/strict';
import checkout from '../api/mercadopago/create-checkout.js';
import status from '../api/mercadopago/status.js';

const reply=()=>({statusCode:200,body:null,headers:{},
  status(n){this.statusCode=n;return this;},
  setHeader(k,v){this.headers[k]=v;return this;},
  json(data){this.body=data;return this;}});
test('preview environments never call pricing, freight or payment providers',async t=>{
  const saved=process.env.VERCEL_ENV,fetch0=globalThis.fetch;
  t.after(()=>{if(saved===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=saved;
    globalThis.fetch=fetch0;});
  process.env.VERCEL_ENV='preview';
  globalThis.fetch=()=>{throw Error('preview must not call provider')};
  const result=reply();
  await checkout({method:'POST',headers:{origin:'https://www.centercupulas.com.br'},body:{}},result);
  assert.equal(result.statusCode,503);
  assert.equal(result.body.error,'checkout_not_enabled');
  const read=reply();
  await status({method:'GET',query:{}},read);
  assert.equal(read.statusCode,200);
  assert.equal(read.body.checkout_enabled,false);
});
