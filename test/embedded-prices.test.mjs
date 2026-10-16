import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { estimateBoxCostForItem } from '../supabase/functions/public-cart-checkout/box-costs.mjs';
import { addBoxesToPrices } from '../supabase/functions/public-cart-checkout/price-with-box.mjs';

const r = {
  box_small_cost_brl:10,box_medium_cost_brl:12,box_large_cost_brl:15,
  box_small_product_max_cm:35,box_medium_product_max_cm:65,
  max_nested_per_package:4,max_package_dimension_cm:100,
  side_padding_cm:6,height_padding_cm:6,nested_height_increment_cm:3
};
const input=(id,format,top,bottom,height,quantity,line_list_total)=>({
  id,format,top,bottom,height,quantity,line_list_total
});

test('one small cupula: exactly R$10 embedded in product, not an extra fee',()=>{
  const line=input('a','conica',25,30,18,1,100);
  const result=addBoxesToPrices([line],[estimateBoxCostForItem(line,r)],500,10);
  assert.equal(result.status,'ok');
  assert.equal(result.productTotal,110);
  assert.equal(result.items[0].line_total,110);
  assert.equal(result.subtotalBeforeDiscount,110);
  assert.equal(result.discountAmount,0);
  assert.equal(result.totalBoxCost,10);
});

test('three sizes in one cart: small R$10, medium R$12, large R$15',()=>{
  const lines=[
    input('a','conica',22,30,20,1,100),
    input('b','drum',45,45,32,1,150),
    input('c','conica',60,75,35,1,200)
  ];
  const totals=addBoxesToPrices(lines,lines.map(x=>estimateBoxCostForItem(x,r)),500,10);
  assert.equal(totals.totalBoxCost,37);
  assert.equal(totals.productTotal,487);
  assert.deepEqual(totals.items.map(x=>x.line_total),[110,162,215]);
});

test('volume discounts do not remove the cost of the boxes',()=>{
  const line=input('a','conica',25,30,18,4,600);
  const boxes=estimateBoxCostForItem(line,r);
  assert.equal(boxes.total_cost_brl,10); // 4 cúpulas nested in one planned box
  const result=addBoxesToPrices([line],[boxes],500,10);
  assert.equal(result.discountUnlocked,true);
  assert.equal(result.totalBoxCost,10);
  assert.equal(result.discountAmount,60);
  assert.equal(result.productTotal,550); // (600-60) + 10
  assert.equal(result.subtotalBeforeDiscount,610);
  assert.equal(result.items[0].line_total,550);
});

test('catalog and cart use identical business logic, even after deployment',()=>{
  for(const path of ['box-costs.mjs','price-with-box.mjs']){
    assert.equal(
      readFileSync('supabase/functions/public-pricing-quote/'+path,'utf8'),
      readFileSync('supabase/functions/public-cart-checkout/'+path,'utf8')
    );
  }
});

test('quote calculation never inserts a second checkout packaging charge',()=>{
  const cart=readFileSync('supabase/functions/public-cart-checkout/index.ts','utf8');
  const catalog=readFileSync('supabase/functions/public-pricing-quote/index.ts','utf8');
  assert.match(cart,/addBoxesToPrices\(/);
  assert.match(catalog,/addBoxesToPrices\(/);
  assert.match(cart,/const finalTotal=round2\(productTotal\+freightValue\)/);
  assert.match(cart,/included_in_products:true/);
  assert.doesNotMatch(cart,/finalTotal\s*=.*boxBudget\.total_cost_brl/);
});

test('missing box rule does not create a zero-price quote',()=>{
  const line=input('a','conica',28,28,18,1,70);
  assert.equal(addBoxesToPrices([line],[{status:'requires_review'}],500,10).status,'requires_review');
  assert.equal(estimateBoxCostForItem(line,{...r,box_large_cost_brl:-1}).status,'requires_review');
});
