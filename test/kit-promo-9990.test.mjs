import test from 'node:test';
import assert from 'node:assert/strict';
import {applyKitPrice,isKitProduct} from '../supabase/functions/public-cart-checkout/kit-promo-9990.mjs';
const at = Date.parse('2026-10-29T15:00:00-03:00');
const sample = (quantity=2,price=74.48) => ({
  id:'kit',format:'conica',material:'Algodão',color:'Bege',top:12,bottom:20,height:20,quantity,
  observations:'',line_list_total:price,line_total:price,unit_price:price/quantity
});
const input = lines => ({status:'ok',items:lines,subtotalBeforeDiscount:lines.reduce((s,l)=>s+l.line_list_total,0),
  productTotal:lines.reduce((s,l)=>s+l.line_total,0),discountAmount:0,discountUnlocked:false,totalBoxCost:10});
test('par exato custa R$ 99,90, sem alegar desconto fictício',()=>{
  const o=applyKitPrice(input([sample()]),at);
  assert.equal(o.productTotal,99.90);assert.equal(o.subtotalBeforeDiscount,99.90);
  assert.equal(o.discountAmount,0);assert.equal(o.discountUnlocked,false);
  assert.equal(o.items[0].quantity,2);assert.equal(o.items[0].line_total,99.90);assert.equal(o.promotion.pairs,1);
});
test('não aceita outros tecidos, cores, dimensões nem uma peça',()=>{
  const alt=[sample(1,37.24),{...sample(),color:'Branco'},{...sample(),height:22},{...sample(),material:'Linho'}];
  for(const item of alt)assert.equal(applyKitPrice(input([item]),at).promotion.applied,false);
  assert.equal(isKitProduct(sample()),true);
});
test('4 cúpulas = dois kits; 3 = um kit e unidade avulsa',()=>{
  assert.equal(applyKitPrice(input([sample(4,148.96)]),at).productTotal,199.80);
  assert.equal(applyKitPrice(input([sample(3,111.72)]),at).productTotal,137.14);
});
test('itens distintos preservam valores e desconto preexistente de volume',()=>{
  const other={...sample(1,120),id:'other',color:'Preto',line_total:108};
  const res=applyKitPrice(input([sample(),other]),at);
  assert.equal(res.productTotal,207.90);assert.equal(res.subtotalBeforeDiscount,219.90);assert.equal(res.discountAmount,12);
});
test('kit permanece ativo sem data limite',()=>{
  const q=applyKitPrice(input([sample()]));
  assert.equal(q.promotion.applied,true);
  assert.equal(q.promotion.active,true);
  assert.equal(q.promotion.ends_at,undefined);
});
