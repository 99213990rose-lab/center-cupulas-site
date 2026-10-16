import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateBoxPurchaseBudget } from '../supabase/functions/public-cart-checkout/box-costs.mjs';

const rules = {
  box_small_cost_brl: 10, box_medium_cost_brl: 12, box_large_cost_brl: 15,
  box_small_product_max_cm: 35, box_medium_product_max_cm: 65
};
const item=(id,top,bottom,height)=>({id,top,bottom,height});
const preview=(packs)=>({status:'estimated',packages:packs});
const pack=(id,units=1)=>({item_id:id,units,requires_manual_review:false});

test('charges a fixed internal box purchasing budget by product size',()=>{
  const result=calculateBoxPurchaseBudget(preview([pack('a'),pack('b'),pack('c')]),[
    item('a',25,30,20),item('b',45,55,27),item('c',70,85,34)
  ],rules);
  assert.equal(result.status,'estimate');
  assert.equal(result.total_cost_brl,37);
  assert.deepEqual(result.counts,{pequena:1,media:1,grande:1});
  assert.deepEqual(result.volumes.map(x=>x.cost_brl),[10,12,15]);
  assert.equal(result.source,'internal_box_procurement');
});

test('budgets one cost per planned box volume, not per lamp shade',()=>{
  const result=calculateBoxPurchaseBudget(preview([pack('a',4),pack('a',2)]),[item('a',33,33,23)],rules);
  assert.equal(result.total_cost_brl,20);
  assert.equal(result.counts.pequena,2);
  assert.deepEqual(result.volumes.map(x=>x.units),[4,2]);
});

test('supports updating all prices and classification thresholds in Supabase rules',()=>{
  const custom={...rules,box_small_cost_brl:7.5,box_medium_cost_brl:11,box_large_cost_brl:15,box_small_product_max_cm:30,box_medium_product_max_cm:50};
  const value=calculateBoxPurchaseBudget(preview([pack('a'),pack('b')]),[item('a',30,30,12),item('b',50,50,24)],custom);
  assert.equal(value.total_cost_brl,18.5);
  assert.deepEqual(value.counts,{pequena:1,media:1,grande:0});
});

test('rejects a purchase-budget guess when item needs manual review',()=>{
  const result=calculateBoxPurchaseBudget({status:'review',packages:[pack('a')]},[item('a',20,20,20)],rules);
  assert.equal(result.status,'requires_review');
  assert.equal(result.total_cost_brl,null);
});

test('missing measured product configuration never yields a misleading zero cost',()=>{
  const result=calculateBoxPurchaseBudget(preview([pack('other')]),[item('a',25,25,25)],rules);
  assert.equal(result.status,'requires_review');
  assert.equal(result.total_cost_brl,null);
});

test('invalid price rules do not create misleading cost estimates',()=>{
  const result=calculateBoxPurchaseBudget(preview([pack('a')]),[item('a',25,25,25)],{...rules,box_medium_cost_brl:-5});
  assert.equal(result.status,'requires_review');
});
