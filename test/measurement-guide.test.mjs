import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read=path=>readFileSync(path,'utf8');
const page='guia-de-medidas.html';
const guideLinkedFrom=[
 'index.html','modelos.html','reformas.html','carrinho.html',
 'como-comprar.html','entregas-e-trocas.html','privacidade.html',
 'cupulas-conicas.html','cupulas-cilindricas.html','cupulas-quadradas.html','cupulas-atacado.html'
];

test('measurement guide uses clear dimensions without defining packaging dimensions',()=>{
 const html=read(page);
 assert.equal((html.match(/<h1\b/g)||[]).length,1);
 assert.ok(html.includes('superior × inferior × altura'));
 assert.ok(html.includes('20 × 40 × 30 cm'));
 assert.ok(html.includes('encaixe'));
 assert.ok(html.includes('Para modelos retangulares'));
 assert.ok(html.includes('Não representam um tamanho de produto nem uma especificação de embalagem'));
 assert.ok(!html.includes('preço garantido'));
});

test('round and square diagrams are accessible and have dimension captions',()=>{
 const html=read(page);
 assert.equal((html.match(/role="img"/g)||[]).length,2);
 assert.equal((html.match(/<svg class="measure-illustration__svg"/g)||[]).length,2);
 assert.equal((html.match(/<title id="(?:circular|square)-title"/g)||[]).length,2);
 assert.equal((html.match(/<desc id="(?:circular|square)-description"/g)||[]).length,2);
 for(const id of ['circular-title','circular-description','square-title','square-description'])
   assert.ok(html.includes(id),id);
 for(const dimension of ['SUPERIOR','INFERIOR','ALTURA'])
   assert.ok(html.split(dimension).length>=3,'both diagrams require '+dimension);
});

test('guide has SEO metadata and all local resources exist',()=>{
 const html=read(page);
 assert.match(html,/<html lang="pt-BR">/);
 assert.ok(html.includes('<link rel="canonical" href="https://www.centercupulas.com.br/'+page+'">'));
 const schema=JSON.parse(html.match(/<script type="application\/ld\+json">([^<]+)<\/script>/)[1]);
 assert.equal(schema['@type'],'BreadcrumbList');
 for(const url of [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map(x=>x[1])){
   if(/^(https?:|mailto:|tel:|#)/.test(url))continue;
   const path=url.split(/[?#]/)[0].replace(/^\//,'');
   if(path)assert.ok(existsSync(path),'missing file '+path);
 }
 assert.ok(html.indexOf('privacy-consent.js')<html.indexOf('script.js'));
});

test('every relevant shopping flow can open the measurement guide',()=>{
 for(const path of guideLinkedFrom)
   assert.ok(read(path).includes('href="guia-de-medidas.html"'),path+' missing link');
 assert.ok(read('modelos.html').includes('builder-measure-link'));
 assert.ok(read('sitemap.xml').includes('https://www.centercupulas.com.br/'+page));
});

test('measurement guide is legible on small screens',()=>{
 const css=read('styles.css');
 for(const selector of ['.measure-grid','.measure-illustration__svg','.measure-example__formula','.measure-notes__grid','.builder-measure-link'])
   assert.ok(css.includes(selector),selector);
 assert.ok(css.includes('@media (max-width:690px)'));
});
