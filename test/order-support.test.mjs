import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createOrderSupportMessage} from '../pedido-ajuda.mjs';

test('support consultation prepares WhatsApp message with order code, not real-time tracking',()=>{
 const response=createOrderSupportMessage({topic:'andamento',code:'web-12345'});
 assert.equal(response.ok,true);
 const url=new URL(response.url);
 assert.equal(url.pathname,'/5512983216069');
 assert.equal(url.searchParams.get('text').includes('WEB-12345'),true);
 assert.equal(url.searchParams.get('text').includes('Andamento da produção'),true);
 assert.doesNotMatch(response.message,/rastreio em tempo real|pagamento aprovado/);
});

test('customers without a reference can still ask the team',()=>{
 const response=createOrderSupportMessage({topic:'entrega',code:''});
 assert.equal(response.ok,true);
 assert.ok(response.message.includes('ainda não tenho o código'));
});

test('unknown subjects and unsafe order references are rejected',()=>{
 for(const [payload,field] of [
  [{topic:'invalid',code:'WEB123'},'topic'],
  [{topic:'andamento',code:'<script>'},'code'],
  [{topic:'andamento',code:'a'},'code'],
  [{topic:'andamento',code:'A'.repeat(51)},'code']
 ]) {
  const r=createOrderSupportMessage(payload);
  assert.equal(r.ok,false);
  assert.equal(r.field,field);
 }
});

test('support page clearly explains manual reply and never stores visitor code',()=>{
 const html=readFileSync('entregas-e-trocas.html','utf8');
 const source=readFileSync('pedido-ajuda.mjs','utf8');
 assert.ok(html.includes('id="consulta-pedido"'));
 assert.ok(html.includes('data-order-help-form'));
 assert.ok(html.includes('name="topic"'));
 assert.ok(html.includes('name="code"'));
 assert.ok(html.includes('data-order-help-feedback'));
 assert.ok(html.includes('data-order-help-link'));
 assert.ok(html.includes('pedido-ajuda.mjs'));
 assert.ok(html.includes('não mostra um rastreamento em tempo real'));
 assert.doesNotMatch(source,/localStorage|sessionStorage|fetch\s*\(|sendBeacon/);
 assert.ok(readFileSync('como-comprar.html','utf8').includes('entregas-e-trocas.html#consulta-pedido'));
});
