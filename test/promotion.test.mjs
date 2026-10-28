import test from 'node:test';
import assert from 'node:assert/strict';
import { applySecondShadePromotion, PROMO_START_MS, PROMO_END_MS } from '../supabase/functions/public-cart-checkout/promo-second-shade.mjs';
const at = Date.parse('2026-10-29T12:00:00-03:00');
function quote(lines, volume = 0) {
  const subtotal = lines.reduce((s, l) => s + l.line_list_total, 0);
  return { status:'ok',items:lines.map(l=>({ ...l, line_total:l.line_list_total,unit_price:l.line_list_total/l.quantity })),
    subtotalBeforeDiscount:subtotal,productTotal:subtotal-volume,discountAmount:volume,discountUnlocked:volume>0 };
}
function line(material, qty, price) { return { material, quantity:qty,line_list_total:price*qty }; }
test('duas cúpulas iguais na mesma linha recebem desconto sobre uma unidade', () => {
 const r=applySecondShadePromotion(quote([line('Algodão',2,100)]),at);
 assert.equal(r.productTotal,190); assert.equal(r.items[0].line_total,190); assert.equal(r.promotion.applied,true);
});
test('segunda peça mais barata recebe 10%, sem descontar a mais cara',()=>{
 const r=applySecondShadePromotion(quote([line('Algodão',1,120),line('tricoline',1,80)]),at);
 assert.equal(r.productTotal,192);assert.deepEqual(r.items.map(x=>x.line_total),[120,72]);
});
test('não se aplica a uma única cúpula ou a materiais diferentes',()=>{
 assert.equal(applySecondShadePromotion(quote([line('Algodão',1,90)]),at).promotion.applied,false);
 assert.equal(applySecondShadePromotion(quote([line('Algodão',1,90),line('Linho',1,90)]),at).promotion.applied,false);
});
test('não soma o desconto por volume se ele for maior',()=>{
 const r=applySecondShadePromotion(quote([line('Algodão',2,100)],30),at);
 assert.equal(r.promotion.applied,false);assert.equal(r.productTotal,170);
});
test('respeita datas de início e término em São Paulo',()=>{
 const q=quote([line('Algodão',2,100)]);
 assert.equal(applySecondShadePromotion(q,PROMO_START_MS-1).promotion.applied,false);
 assert.equal(applySecondShadePromotion(q,PROMO_START_MS).promotion.applied,true);
 assert.equal(applySecondShadePromotion(q,PROMO_END_MS).promotion.applied,false);
});
