import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';

const pages=[
  'index.html','modelos.html','reformas.html','como-comprar.html',
  'entregas-e-trocas.html','privacidade.html','guia-de-medidas.html',
  'cupulas-conicas.html','cupulas-cilindricas.html','cupulas-quadradas.html',
  'cupulas-atacado.html','tecidos-e-acabamentos.html'
];

function resource(file,url) {
  if(!url || /^(?:https?:|mailto:|tel:|data:|blob:|#)/i.test(url)) return null;
  assert.ok(!/^javascript:/i.test(url),file+': unsafe link');
  const local=url.split(/[?#]/)[0].replace(/^\//,'');
  if(!local || local==='.')return null;
  return local.endsWith('/')?local+'index.html':local;
}

test('public pages keep SEO, semantic headings and consent-based tracking',()=>{
  for(const file of pages) {
    assert.ok(existsSync(file),'Missing '+file);
    const html=readFileSync(file,'utf8');
    assert.match(html,/<!doctype html>/i,file+': doctype');
    assert.match(html,/<html lang="pt-BR">/i,file+': language');
    assert.match(html,/<title>[^<]{18,}<\/title>/i,file+': title');
    assert.match(html,/<meta name="description" content="[^"]{40,}"/i,file+': description');
    assert.match(html,/<main\b/i,file+': main content');
    assert.equal((html.match(/<h1\b/gi)||[]).length,1,file+': one h1');
    assert.ok(html.includes('privacy-consent.js'),file+': visitor consent');
    assert.ok(!html.includes('src="https://www.googletagmanager.com'),file+': ads must not load before opt-in');
  }
});

test('all local page navigation targets and image resources exist',()=>{
  for(const file of pages){
    const html=readFileSync(file,'utf8');
    for(const a of html.matchAll(/<(?:a|img|script|link)\b[^>]*?\b(?:href|src)="([^"]+)"[^>]*>/gi)){
      const target=resource(file,a[1]);if(target)assert.ok(existsSync(target),file+' → '+target);
    }
    for(const img of html.matchAll(/<img\b[^>]*>/gi)){
      assert.match(img[0],/\balt="/i,file+': image needs alt text (empty for decorative)');
    }
  }
});

test('sitemap lists all indexable editorial and product pages',()=>{
  const sitemap=readFileSync('sitemap.xml','utf8');
  for(const file of pages.filter(x=>!['index.html','privacidade.html'].includes(x))){
    assert.ok(sitemap.includes('https://www.centercupulas.com.br/'+file),file+' missing from sitemap');
  }
  assert.ok(!sitemap.includes('salesops.html'));
  assert.ok(!sitemap.includes('cotador.html'));
});

test('critical infrastructure remains protected and checkout is not activated by static UI',()=>{
  const status=readFileSync('api/mercadopago/status.js','utf8');
  assert.ok(status.includes("process.env.CENTER_CHECKOUT_ENABLED === 'true'"));
  assert.ok(status.includes("process.env.CENTER_USE_LIVE_FRENET_RATES === 'true'"));
  assert.ok(status.includes("process.env.CENTER_CHECKOUT_ENABLED === 'true'"));
  for(const file of ['cotador.html','salesops.html'])
    assert.match(readFileSync(file,'utf8'),/noindex,nofollow,noarchive/);
});


test('homepage prioritizes the self-service catalogue without removing assisted quotations',()=>{
  const home=readFileSync('index.html','utf8');
  const catalog=readFileSync('modelos.html','utf8');
  assert.match(home,/<a class="button button--sm button--gold header__cta" href="modelos\.html#monte">Comprar pelo site<\/a>/);
  assert.match(home,/<a class="button hero-slide__button" href="modelos\.html#monte">Configurar e comprar/);
  assert.match(home,/<h3>Confira preço e frete<\/h3>/);
  assert.match(home,/>WhatsApp<\/a>/);
  assert.match(catalog,/id="monte"/);
  assert.match(catalog,/adicione ao pedido/);
});
