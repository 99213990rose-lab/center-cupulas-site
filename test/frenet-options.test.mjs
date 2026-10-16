import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeFrenetOptions} from '../api/frenet-options.mjs';

test('normalizes valid shipping quotes and preserves zero-price free delivery',()=>{
 const options=normalizeFrenetOptions({ShippingSevicesArray:[
  {ServiceCode:'STD',Carrier:'Correios',ServiceDescription:'PAC',ShippingPrice:'31.40',DeliveryTime:'7',Error:'false',AllowBuyLabel:'true'},
  {ServiceCode:'GRATIS',Carrier:'Transportadora',ShippingPrice:0,DeliveryTime:3,Error:false}
 ]});
 assert.deepEqual(options.map(x=>x.code),['GRATIS','STD']);
 assert.equal(options[1].price,31.4);
 assert.equal(options[1].delivery_days,7);
 assert.equal(options[1].allow_buy_label,true);
});

test('does not accept null, blank, boolean, negative or non-finite provider prices',()=>{
 const options=normalizeFrenetOptions({ShippingServicesArray:[
  {ServiceCode:'A',ShippingPrice:null},
  {ServiceCode:'B',ShippingPrice:''},
  {ServiceCode:'C',ShippingPrice:false},
  {ServiceCode:'D',ShippingPrice:-20},
  {ServiceCode:'E',ShippingPrice:'NaN'},
  {ServiceCode:'F',ShippingPrice:55,Error:'true'},
  {ServiceCode:'G',ShippingPrice:12.99,Error:'false'},
  {ServiceCode:'H',ShippingPrice:45,Error:1}
 ]});
 assert.deepEqual(options.map(x=>x.code),['G']);
});

test('rejects ambiguous duplicate service codes and invalid delivery estimates',()=>{
 const options=normalizeFrenetOptions({ShippingSevicesArray:[
   {ServiceCode:'SHARED',Carrier:'A',ShippingPrice:10},
   {ServiceCode:'SHARED',Carrier:'B',ShippingPrice:20},
   {ServiceCode:'UNIQUE',Carrier:'Carrier',ShippingPrice:35,DeliveryTime:'no data'}
 ]});
 assert.equal(options.length,1);
 assert.equal(options[0].code,'UNIQUE');
 assert.equal(options[0].delivery_days,null);
});

test('malformed provider success responses do not become zero options',()=>{
 assert.equal(normalizeFrenetOptions({}),null);
 assert.equal(normalizeFrenetOptions(null),null);
});
