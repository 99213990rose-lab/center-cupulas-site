import test from 'node:test';
import assert from 'node:assert/strict';
import {applyKitPrice,isKitProduct,validateKitRequest,KIT_PAIR_PRICE} from '../supabase/functions/public-cart-checkout/kit-promo-9990.mjs';

const sample=(quantity=2,price=74.48)=>({
 id:'promo',kind:'promo_kit',format:'conica',material:'Algodão',color:'Bege',top:12,bottom:20,height:20,
 quantity,reference:null,observations:'',line_list_total:price,line_total:price
});
const input=lines=>({status:'ok',items:lines,subtotalBeforeDiscount:lines.reduce((s,l)=>s+l.line_list_total,0),
 productTotal:lines.reduce((s,l)=>s+l.line_total,0),discountAmount:0,discountUnlocked:false,totalBoxCost:10});

test('1 kit = 2 peças, R$ 99,90',()=>{
 const q=applyKitPrice(input([sample()]));
 assert.equal(q.productTotal,99.90);
 assert.equal(q.promotion.kits,1);
 assert.equal(q.items[0].quantity,2);
 assert.equal(q.items[0].kit_quantity,1);
 assert.equal(q.items[0].kit_price,KIT_PAIR_PRICE);
 assert.equal(q.items[0].line_total,99.90);
});
test('2 kits = 4 peças, R$ 199,80',()=>{
 const q=applyKitPrice(input([sample(4,148.96)]));
 assert.equal(q.productTotal,199.80);
 assert.equal(q.promotion.kits,2);
 assert.equal(q.items[0].kit_quantity,2);
});
test('bloqueia 1, 3 e demais quantidades quebradas de peças em linha de kit',()=>{
 for(const quantity of [0,1,3,5,501,2.5]){
   assert.equal(validateKitRequest(sample(quantity)),false);
   assert.throws(()=>applyKitPrice(input([sample(quantity)])),/invalid_kit_quantity/);
 }
});
test('bloqueia outros tecidos, cores, medidas e alterações da peça',()=>{
 for(const row of [
  {...sample(),color:'Branco'},{...sample(),height:22},{...sample(),material:'Linho'},
  {...sample(),reference:'99'},{...sample(),observations:'Encaixe diferente'}
 ]) assert.equal(validateKitRequest(row),false);
});
test('mesma cúpula em compra comum não recebe preço promocional',()=>{
 const regular={...sample(),kind:null};
 assert.equal(isKitProduct(regular),false);
 assert.equal(applyKitPrice(input([regular])).productTotal,regular.line_total);
});
test('linhas de outros modelos mantêm preços e descontos existentes',()=>{
 const regular={...sample(1,120),id:'regular',kind:null,color:'Preto',line_total:108};
 const quote=applyKitPrice(input([sample(),regular]));
 assert.equal(quote.subtotalBeforeDiscount,219.90);
 assert.equal(quote.productTotal,207.90);
 assert.equal(quote.discountAmount,12);
});
