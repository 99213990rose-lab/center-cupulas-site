import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';

const publicPages = [
  'index.html','modelos.html','reformas.html','carrinho.html',
  'como-comprar.html','entregas-e-trocas.html','privacidade.html'
];
const informational = publicPages.slice(4);
const navigation = ['como-comprar.html','entregas-e-trocas.html','privacidade.html'];

test('customer-service pages exist and have usable content and metadata', () => {
  for (const path of informational) {
    const html=readFileSync(path,'utf8');
    assert.match(html, /<html lang="pt-BR">/);
    assert.match(html, /<main id="conteudo">/);
    assert.match(html, /<h1>[^<]{15,}/);
    assert.match(html, /<meta name="description" content="[^"]{50,}/);
    assert.ok(html.includes('rel="canonical" href="https://www.centercupulas.com.br/'+path+'"'));
    assert.ok(html.includes('centercupulas@gmail.com'));
    assert.match(html, /<footer class="footer">/);
    assert.match(html, /<\/html>/);
    assert.doesNotMatch(html, /\[PREENCHER|Lorem ipsum|CNPJ:\s*0{14}/i);
    for(const link of navigation) assert.ok(html.includes('href="'+link+'"'),path+' missing '+link);
  }
});

test('all main pages link to customer information, not a dead-end', () => {
  for(const path of publicPages.slice(0,4)) {
    const html=readFileSync(path,'utf8');
    for(const link of navigation) assert.ok(html.includes('href="'+link+'"'),path+' missing '+link);
  }
});

test('public sitemap contains discoverable commercial information',()=>{
  const sitemap=readFileSync('sitemap.xml','utf8');
  for(const path of informational) assert.ok(sitemap.includes('https://www.centercupulas.com.br/'+path));
  assert.ok(!sitemap.includes('carrinho.html'));
});

test('all local html, css and javascript references on information pages exist',()=>{
  for(const path of informational){
    const html=readFileSync(path,'utf8');
    const targets=[...html.matchAll(/(?:href|src)="([^"]+)"/g)]
      .map(x=>x[1]).filter(x=>/^(?!https?:|mailto:|tel:|#|\/)([^?#]+\.(?:css|js|html))/.test(x));
    for(const value of targets) assert.ok(existsSync(value.split(/[?#]/)[0]),path+' missing '+value);
  }
});
