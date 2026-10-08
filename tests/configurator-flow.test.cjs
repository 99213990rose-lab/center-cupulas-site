'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const builder=fs.readFileSync('catalogo.js','utf8');
const proxy=fs.readFileSync('api/pricing/preview.js','utf8');
const cart=fs.readFileSync('cart.js','utf8');

test('configurador consulta preço no mesmo domínio da prévia',()=>{
  assert.match(builder,/PUBLIC_PRICING_ENDPOINT = '\/api\/pricing\/preview'/);
  assert.match(proxy,/public-pricing-quote/);
});
test('proxy inclui Juta, Linho, Tricoline e limites de dimensões/quantidade',()=>{
  for(const material of ['juta','linho','tricoline']) assert.match(proxy,new RegExp("'"+material+"'"));
  assert.match(proxy,/quantity > 500/);
  assert.match(proxy,/n >= 1 && n <= 150/);
});
test('avança ao carrinho sem exigir WhatsApp quando preço precisa de revisão',()=>{
  assert.match(builder,/if \(window\.CenterCupulasCart\) \{/);
  assert.match(builder,/window\.CenterCupulasCart\.add\(/);
  assert.match(builder,/window\.location\.href = 'carrinho\.html'/);
  assert.match(builder,/quote_snapshot: lastPriceQuote\?\.status === 'estimate'/);
});
test('não apaga cotação assíncrona ao clicar adicionar',()=>{
  const submitBlock=builder.slice(builder.indexOf("form.addEventListener('submit'"),builder.indexOf('const setConfiguration ='));
  assert.ok(submitBlock.length > 0);
  assert.doesNotMatch(submitBlock,/showStep\(panels\.length - 1, false\)/);
  assert.match(submitBlock,/if \(!validateStep\(step\)\)/);
});
test('carrinho persiste dados sem depender de preço passado pelo navegador',()=>{
  assert.match(cart,/quote_snapshot:/);
  assert.match(builder,/quote_snapshot:.*\? \{/);
});
