'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { BOX_CATALOG, estimateCenterPackaging } = require('../lib/center-packaging.cjs');

const item = (top,bottom,height,quantity=1,format='conica') => ({
  id: 'teste', format, material: 'tecido_comum', top,bottom,height,quantity
});

test('quatro caixas e custos provisórios conhecidos', () => {
  assert.deepEqual(BOX_CATALOG.map(x=>[x.internal_cm,x.estimated_cost_brl]),[
    [30,6],[45,16],[60,30],[70,45]
  ]);
});
test('25 cm com proteção total de 5 cm entra na caixa 30', () => {
  const a=estimateCenterPackaging([item(10,25,20)]);
  assert.equal(a.package_count,1);
  assert.equal(a.packages[0].box_id,'P30');
  assert.equal(a.packaging_fee,6);
  assert.equal(a.calibration,true);
});
test('26 cm exige caixa média, por margem de proteção',()=>{
  assert.equal(estimateCenterPackaging([item(10,26,20)]).packages[0].box_id,'M45');
});
test('seleciona caixas 45/60/70 respeitando folga',()=>{
  const a=estimateCenterPackaging([item(10,40,20),item(10,55,20),item(10,65,20)]);
  assert.deepEqual(a.packages.map(x=>x.box_id),['M45','G60','GG70']);
  assert.equal(a.packaging_fee,16+30+45);
});
test('quantidades contam uma caixa por peça, sem inferir encaixe',()=>{
  const a=estimateCenterPackaging([item(10,25,20,3)]);
  assert.equal(a.package_count,3);
  assert.equal(a.packaging_fee,18);
});
test('pedido com produto maior que 70 pede revisão; não finge preço completo',()=>{
  const a=estimateCenterPackaging([item(10,70,25)]);
  assert.equal(a.status,'review');
  assert.ok(a.review_reasons.includes('no_standard_box:0'));
});
test('formato oval pede revisão manual',()=>{
  const a=estimateCenterPackaging([item(10,25,20,1,'oval')]);
  assert.equal(a.status,'review');
  assert.equal(a.package_count,0);
});
test('mais de 30 volumes necessita revisão',()=>{
  const a=estimateCenterPackaging([item(10,25,20,31)]);
  assert.equal(a.status,'review');
  assert.equal(a.packages.length,0);
});
test('dimensões não numéricas ou além do limite recusadas',()=>{
  assert.throws(()=>estimateCenterPackaging([item(10,'x',20)]),/invalid_dimensions/);
  assert.throws(()=>estimateCenterPackaging([item(10,25,151)]),/invalid_dimensions/);
});
test('quantidade fracionada é recusada, sem arredondar para baixo',()=>{
  assert.throws(()=>estimateCenterPackaging([item(10,25,20,1.5)]),/invalid_quantity/);
});
test('não aceita preço de caixa alterado por entrada do cliente',()=>{
  const a=estimateCenterPackaging([{...item(10,25,20), estimated_cost_brl:0, box_id:'GG70'}]);
  assert.equal(a.packaging_fee,6);
  assert.equal(a.packages[0].box_id,'P30');
});
test('não aceita carrinho vazio ou com mais de 20 linhas',()=>{
  assert.throws(()=>estimateCenterPackaging([]),/invalid_cart/);
  assert.throws(()=>estimateCenterPackaging(Array(21).fill(item(10,25,20))),/invalid_cart/);
});
