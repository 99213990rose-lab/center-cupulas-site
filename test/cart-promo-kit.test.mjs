import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const code=readFileSync(new URL('../cart.js',import.meta.url),'utf8');
function setup(stored=[]){
  const storage=new Map([['centerCupulasCartV1',JSON.stringify(stored)]]);
  const context={
    localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v))},
    crypto:{randomUUID:()=>String(Math.random())},
    CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},
    window:{dispatchEvent:()=>{},addEventListener:()=>{}},
    document:{readyState:'loading',addEventListener:()=>{},querySelectorAll:()=>[]}
  };
  runInNewContext(code,context);
  return {cart:context.window.CenterCupulasCart,storage};
}
const kit=quantity=>({kind:'promo_kit',format:'conica',format_label:'Cônica / Empire',
 material:'Algodão',color:'Bege',top:12,bottom:20,height:20,quantity,reference:null,observations:''});
const regular=quantity=>({format:'drum',material:'Algodão',color:'Bege',
 top:30,bottom:30,height:20,quantity,reference:'35',observations:''});
test('adicionar kit resulta em duas peças e um único item',()=>{
 const {cart}=setup();
 cart.add(kit(2));
 assert.equal(cart.read().length,1);
 assert.equal(cart.read()[0].kind,'promo_kit');
 assert.equal(cart.read()[0].quantity,2);
});
test('controle 1 ou 2 kits representa 2 ou 4 cúpulas, nunca 1 ou 3',()=>{
 const {cart}=setup();
 cart.add(kit(2));
 const id=cart.read()[0].id;
 cart.setQuantity(id,2);
 assert.equal(cart.read()[0].quantity,4);
 cart.setQuantity(id,1);
 assert.equal(cart.read()[0].quantity,2);
 cart.setQuantity(id,0);
 assert.equal(cart.read()[0].quantity,2);
});
test('cúpulas normais continuam com quantidade unitária',()=>{
 const {cart}=setup();
 cart.add(regular(1));
 const id=cart.read()[0].id;
 cart.setQuantity(id,3);
 assert.equal(cart.read()[0].quantity,3);
});
test('carrinho antigo de campanha migra de uma peça para um kit',()=>{
 const {cart}=setup([kit(1).kind?{...kit(1),kind:undefined}:{}]);
 const row=cart.read()[0];
 assert.equal(row.kind,'promo_kit');
 assert.equal(row.quantity,2);
});
test('produto normal e kit não são mesclados ao adicionar',()=>{
 const {cart}=setup();
 cart.add(kit(2));
 cart.add({...kit(2),kind:null,reference:'35'});
 assert.equal(cart.read().length,2);
});
