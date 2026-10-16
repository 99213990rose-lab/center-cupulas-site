import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('catalog does not erase quote while validating submitted configuration', () => {
  const src = readFileSync('catalogo.js', 'utf8');
  const submit = src.slice(src.indexOf("form.addEventListener('submit'"), src.indexOf('window.location.href = \'carrinho.html\';') + 60);
  assert.match(submit, /lastPriceConfigKey !== pricingKey\(configuration\)/);
  assert.doesNotMatch(submit, /showStep\(step, false\)/);
  assert.doesNotMatch(submit, /showStep\(panels\.length - 1, false\)/);
  assert.match(submit, /lastPriceQuote\?\.status === 'estimate'/);
});

test('catalog invalidates and requotes changed measurements', () => {
  const src = readFileSync('catalogo.js','utf8');
  assert.match(src,/const refreshIfPriceChanged = /);
  assert.match(src,/\+\+pricingRequestId; \/\/ discard any response/);
  assert.match(src,/pricingKey\(configuration\)/);
  assert.match(src,/submitButton\.disabled = true/);
  assert.match(src,/if \(requestId === pricingRequestId\) submitButton\.disabled = false/);
});

test('visible discount percentages derive from price API, not a constant', ()=>{
  for (const path of ['catalogo.js','carrinho.js']) {
    const src=readFileSync(path,'utf8');
    assert.match(src,/discountPercent/);
    assert.doesNotMatch(src,/10% de desconto/);
  }
});
