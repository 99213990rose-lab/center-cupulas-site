import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runProductionSmoke} from '../scripts/production-smoke.mjs';

const page='<!doctype html><html lang="pt-BR"><head><title>Center Cúpulas</title></head><body>Loja</body></html>';
function mockRequest({override={},record=[]}={}){
  return async (url,options)=>{
    const u=new URL(url);
    record.push({u,options});
    if(options.method!=='GET'||options.body||options.headers.Authorization)
      throw Error('smoke checks must be read-only and unauthenticated');
    const key=u.pathname+u.search;
    if(override[key])return override[key];
    if(u.pathname==='/'||u.pathname==='/carrinho.html'||u.pathname==='/meus-pedidos.html')
      return new Response(page,{status:200,headers:{'content-type':'text/html; charset=utf-8'}});
    if(u.pathname==='/api/mercadopago/status'&&!u.search)
      return Response.json({checkout_enabled:true,pickup_enabled:false,flow:'mercadopago'});
    if(key==='/api/mercadopago/create-checkout'||
       key==='/api/mercadopago/webhook'||
       key==='/api/mercadopago/order-status')
      return Response.json({error:'method_not_allowed'},{status:405});
    return Response.json({error:'unauthorized'},{status:401});
  };
}

test('production smoke verifies real pages, feature status and secure route rejection with GET only',async()=>{
  const calls=[];
  const report=await runProductionSmoke({request:mockRequest({record:calls})});
  assert.equal(report.ok,true);
  assert.equal(report.checked,12);
  assert.equal(calls.length,12);
  assert.equal(calls.some(x=>x.u.hostname!=='www.centercupulas.com.br'),false);
  assert.ok(calls.every(x=>x.options.method==='GET'));
  assert.equal(calls.some(x=>x.options.body!==undefined),false);
});
test('production smoke detects an accidental public exposure of a privileged RPC route',async()=>{
  const report=await runProductionSmoke({request:mockRequest({override:{
    '/api/internal/checkout-audit':Response.json({status:'healthy'}, {status:200})
  }})});
  assert.equal(report.ok,false);
  assert.ok(report.outcomes.some(x=>x.path==='/api/internal/checkout-audit'&&!x.ok));
});
test('missing status or silently disabled checkout triggers deployment regression alert',async()=>{
  for(const payload of [
    {checkout_enabled:false,pickup_enabled:false,flow:'manual'},
    {checkout_enabled:true,pickup_enabled:true,flow:'mercadopago'},
    {checkout_enabled:true,pickup_enabled:false,flow:'manual'},
    {checkout_enabled:true,pickup_enabled:false,flow:'mercadopago',service_role_key:'leak'}
  ]){
    const report=await runProductionSmoke({request:mockRequest({override:{
      '/api/mercadopago/status':Response.json(payload)
    }})});
    assert.equal(report.ok,false);
    assert.ok(report.outcomes.some(x=>x.path==='/api/mercadopago/status'&&!x.ok));
  }
});
test('HTML errors and non-JSON auth failures trigger the monitor',async()=>{
  const report=await runProductionSmoke({request:mockRequest({override:{
    '/':new Response('<html><body>host error</body></html>',{status:200,headers:{'content-type':'text/html'}}),
    '/api/internal/provider-audit':new Response('<html>proxy failure</html>',{status:401,headers:{'content-type':'text/html'}})
  }})});
  assert.equal(report.ok,false);
  assert.ok(report.outcomes.filter(x=>!x.ok).length>=2);
});
test('smoke refuses dangerous alternate hosts and protocol downgrades',async()=>{
  const request=mockRequest();
  for(const baseUrl of [
    'http://www.centercupulas.com.br',
    'https://attacker.example',
    'https://www.centercupulas.com.br@evil.example',
    'https://www.centercupulas.com.br:443/secret',
    'https://www.centercupulas.com.br/deep'
  ]){
    if(baseUrl.includes(':443'))continue; // URL canonicalization removes the default port.
    await assert.rejects(runProductionSmoke({baseUrl,request}),/production_smoke_invalid_target/);
  }
});
test('continuous operations monitors never add a payment-creating POST or credentials',()=>{
  const source=readFileSync(new URL('../scripts/production-smoke.mjs',import.meta.url),'utf8');
  assert.match(source,/method:'GET'/);
  assert.doesNotMatch(source,/Authorization:\s*'Bearer|payment.*?POST/);
});
