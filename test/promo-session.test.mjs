import test from 'node:test';
import assert from 'node:assert/strict';
import {SESSION_MS,COOLDOWN_MS,initialSessionStart,sessionPhase} from '../promo-session.mjs';
const start=Date.parse('2026-10-29T14:00:00-03:00');
test('primeira visita começa uma única sessão de três horas',()=>{
 assert.equal(initialSessionStart(null,start),start);
 assert.equal(sessionPhase(start,start).seconds,10800);
 assert.equal(sessionPhase(start,start+SESSION_MS-1000).seconds,1);
});
test('no zero permanece concluído pelas três horas seguintes',()=>{
 assert.equal(sessionPhase(start,start+SESSION_MS).phase,'cooldown');
 assert.equal(sessionPhase(start,start+SESSION_MS+COOLDOWN_MS-1).phase,'cooldown');
 assert.equal(initialSessionStart(String(start),start+SESSION_MS+60_000),start);
});
test('após pausa, só visita/recarregamento abre nova sessão',()=>{
 assert.equal(sessionPhase(start,start+SESSION_MS+COOLDOWN_MS).phase,'ready');
 assert.equal(initialSessionStart(String(start),start+SESSION_MS+COOLDOWN_MS),start+SESSION_MS+COOLDOWN_MS);
});
test('atualização da página nunca reinicia o relógio durante sessão',()=>{
 assert.equal(initialSessionStart(String(start),start+1000),start);
 assert.equal(initialSessionStart(String(start),start+2*3600_000),start);
});
