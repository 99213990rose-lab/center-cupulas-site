import test from 'node:test';
import assert from 'node:assert/strict';
import {applyKitPrice,isKitProduct,validateKitRequest,kitPriceFor,KIT_PAIR_PRICE,KIT_NATURAL_FABRIC_PRICE} from '../supabase/functions/public-cart-checkout/kit-promo-9990.mjs';

const sample=(quantity=2,price=74.48)=>({
 id:'promo',kind:'promo_kit',format:'conica',material:'Algodão',color:'Bege',
 top:12,bottom:20,height:20,quantity,reference:null,observations:'',
 line_list_total:price,line_total:price
});
const input=lines=>({status:'ok',items:lines,subtotalBeforeDiscount:lines.reduce((s,l)=>s+l.line_list_total,0),
 productTotal:lines.reduce((s,l)=>s+l.line_total,0),discountAmount:0,discountUnlocked:false,totalBoxCost:10});
test('algodão: 1 kit de duas cúpulas custa R$ 99,90',()=>{
 const q=applyKitPrice(input([sample()]));
 assert.equal(q.productTotal,99.90);
 assert.equal(q.promotion.kits,1);
 assert.equal(q.items[0].quantity,2);
 assert.equal(q.items[0].kit_quantity,1);
 assert.equal(q.items[0].kit_price,KIT_PAIR_PRICE);
});
test('algodão: todas as cinco cores têm o mesmo preço promocional',()=>{
 for(const color of ['Bege','Off-white','Branco','Preto','Marrom']){
  const line={...sample(),color};
  assert.equal(validateKitRequest(line),true);
  assert.equal(applyKitPrice(input([line])).productTotal,99.90);
 }
});
test('linho e juta natural: R$ 120,00 por kit, sem variações de cor',()=>{
 for(const fabric of ['Linho','Juta']){
  const valid={...sample(),material:fabric,color:'Natural'};
  assert.equal(validateKitRequest(valid),true);
  assert.equal(kitPriceFor(valid),KIT_NATURAL_FABRIC_PRICE);
  assert.equal(applyKitPrice(input([valid])).productTotal,120);
  for(const color of ['Bege','Preto','Off-white']){
    assert.equal(validateKitRequest({...valid,color}),false);
  }
 }
});
test('dois kits algodão = 4 peças por R$ 199,80 e dois de linho = R$ 240',()=>{
 assert.equal(applyKitPrice(input([sample(4,148.96)])).productTotal,199.80);
 assert.equal(applyKitPrice(input([{...sample(4,148.96),material:'Linho',color:'Natural'}])).productTotal,240);
});
test('carrinho misto: 1 kit algodão + 1 linho + 1 juta = R$ 339,90',()=>{
 const lines=[
  sample(2,74.48),
  {...sample(2,78),id:'linho',material:'Linho',color:'Natural'},
  {...sample(2,82),id:'juta',material:'Juta',color:'Natural'}
 ];
 const q=applyKitPrice(input(lines));
 assert.equal(q.productTotal,339.90);
 assert.equal(q.promotion.kits,3);
});
test('bloqueia kits fracionários e variações não oferecidas',()=>{
 for(const quantity of [0,1,3,5,501,2.5]){
  assert.equal(validateKitRequest(sample(quantity)),false);
  assert.throws(()=>applyKitPrice(input([sample(quantity)])),/invalid_kit_quantity/);
 }
 for(const line of [
  {...sample(),color:'Rosa'},{...sample(),height:22},{...sample(),material:'Seda'},
  {...sample(),reference:'99'},{...sample(),observations:'Encaixe diferente'}
 ]) assert.equal(validateKitRequest(line),false);
});
test('cúpula comprada fora do kit não ganha preço promocional',()=>{
 const regular={...sample(),kind:null};
 assert.equal(isKitProduct(regular),false);
 assert.equal(applyKitPrice(input([regular])).productTotal,regular.line_total);
});
test('preço de outros produtos e descontos prévios seguem inalterados',()=>{
 const regular={...sample(1,120),id:'regular',kind:null,color:'Preto',line_total:108};
 const q=applyKitPrice(input([sample(),regular]));
 assert.equal(q.subtotalBeforeDiscount,219.90);
 assert.equal(q.productTotal,207.90);
 assert.equal(q.discountAmount,12);
});
