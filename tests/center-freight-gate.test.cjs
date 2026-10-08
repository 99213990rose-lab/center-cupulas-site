'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const { BOX_MEASUREMENTS, normalizeVerifiedPackages }=require('../lib/center-shipping-gate.cjs');
const { estimateCenterPackaging }=require('../lib/center-packaging.cjs');

const sample=()=>estimateCenterPackaging([{format:'conica',top:20,bottom:20,height:20,quantity:1}]);
test('não aceita frete enquanto medidas de caixa e peso são estimados',()=>{
  const pkg=sample();const res=normalizeVerifiedPackages(pkg);
  assert.equal(res.ready,false);
  assert.deepEqual(res.packages,[]);
});
test('sem dados físicos aprovados para qualquer modelo de caixa',()=>{
  for(const id of ['P30','M45','G60','GG70']){
    assert.equal(BOX_MEASUREMENTS[id].external_cm,null);
    assert.equal(BOX_MEASUREMENTS[id].gross_weight_kg,null);
    assert.equal(BOX_MEASUREMENTS[id].packing_test_approved,false);
  }
});
test('mesmo pacote marcado aprovado não aceita peso ou medidas inexistentes',()=>{
  const pkg=sample();
  pkg.calibration=false;pkg.status='approved';
  const result=normalizeVerifiedPackages(pkg);
  assert.equal(result.ready,false);
  assert.equal(result.reason,'box_external_measurements_or_weight_missing');
});
test('valor do frete não vem de preço nem dimensões informados pelo navegador',()=>{
  const code=fs.readFileSync('api/frete.js','utf8');
  assert.match(code,/estimateCenterPackaging\(items\)/);
  assert.match(code,/normalizeVerifiedPackages\(packaging\)/);
  assert.doesNotMatch(code,/req\.body\?\.packages/);
  assert.doesNotMatch(code,/req\.body\?\.shipmentValue/);
  const cart=fs.readFileSync('carrinho.js','utf8');
  assert.match(cart,/recipientCep: cep,\s*\/\/ Servidor recalcula preço, caixas, dimensões e peso validados\.\s*items: apiItems\(\)/);
});
test('a cotação pede ao servidor nova apuração da fábrica',()=>{
  const code=fs.readFileSync('api/frete.js','utf8');
  assert.match(code,/quote\.calibration!==false/);
  assert.match(code,/quote\.pricing_approved!==true/);
});
