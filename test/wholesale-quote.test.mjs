import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createWhatsAppInquiry,validateWholesaleInquiry} from '../atacado.mjs';

const sample={
  contact:'Ana Silva',business:'Ateliê Luz',sector:'loja',format:'cilindrica',
  quantity:'48',material:'juta',dimensions:'20 × 40 × 30 cm',cep:'13421-548',
  notes:'Preciso de uma proposta para duas lojas.'
};
test('prepares a clear wholesale WhatsApp inquiry without sending it',()=>{
  const result=createWhatsAppInquiry(sample);
  assert.equal(result.ok,true);
  assert.equal(new URL(result.url).host,'wa.me');
  assert.equal(new URL(result.url).pathname,'/5512983216069');
  const message=new URL(result.url).searchParams.get('text');
  for (const term of ['Ana Silva','Ateliê Luz','Cilíndricas / Drum','48 peça(s)','13421-548','20 × 40 × 30 cm','duas lojas'])
    assert.ok(message.includes(term),term);
  assert.ok(message.includes('prazo e entrega'));
});

test('rejects invalid quantities, CEPs, and unknown options',()=>{
 for(const [change,field] of [
   [{quantity:'0'},'quantity'],[{quantity:'10001'},'quantity'],
   [{quantity:'1.5'},'quantity'],[{cep:'123'},'cep'],
   [{format:'inventado'},'format'],[{sector:'undefined'},'sector'],
   [{material:'automático'},'material'],[{contact:' '},'contact']
 ]) {
   const result=validateWholesaleInquiry({...sample,...change});
   assert.equal(result.ok,false,field);
   assert.equal(result.field,field);
 }
});

test('only solicited information is included, without browser-storage or server requests',()=>{
 const source=readFileSync('atacado.mjs','utf8');
 assert.doesNotMatch(source,/localStorage|sessionStorage|sendBeacon|fetch\s*\(/);
 assert.match(source,/window\.open\(result\.url/);
 assert.match(source,/if \(!form\.reportValidity\(\)\) return;/);
 const result=createWhatsAppInquiry({...sample,contact:'\nAna  \tSilva\n',notes:'Linha 1\n\nLinha 2',cep:'13421548'});
 assert.equal(result.ok,true);
 const message=new URL(result.url).searchParams.get('text');
 assert.ok(message.includes('Contato: Ana Silva'));
 assert.ok(message.includes('13421-548'));
 assert.ok(message.includes('Linha 1\n\nLinha 2'));
});

test('wholesale page features a fully accessible form and a guide link',()=>{
 const html=readFileSync('cupulas-atacado.html','utf8');
 assert.match(html,/<form\b[^>]*data-wholesale-form/);
 for(const field of ['contact','sector','format','quantity','material','dimensions','cep','notes']){
   assert.ok(html.includes('name="'+field+'"'),field);
 }
 assert.match(html,/data-wholesale-feedback[^>]*role="status"|role="status"[^>]*data-wholesale-feedback/);
 assert.ok(html.includes('data-wholesale-fallback'));
 assert.ok(html.includes('href="guia-de-medidas.html"'));
 assert.ok(html.includes('src="atacado.mjs"'));
 assert.ok(html.includes('href="#solicitar-orcamento"'));
 assert.ok(html.includes('caixas')===false || html.includes('embalagem incluído'));
});
