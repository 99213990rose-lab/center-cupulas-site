import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';

const pages=[
  'index.html','modelos.html','loja.html','reformas.html','como-comprar.html',
  'entregas-e-trocas.html','privacidade.html','guia-de-medidas.html',
  'cupulas-conicas.html','cupulas-cilindricas.html','cupulas-quadradas.html',
  'cupulas-atacado.html','cupulas-retangulares.html','tecidos-e-acabamentos.html',
  'cupula-conica-bege-20x35x25.html','cupula-cilindrica-off-white-25x25x15.html','cupula-piramidal-quadrada-branca-15x30x20.html','cupula-cilindrica-bege-40x40x25.html','cupula-conica-off-white-10x35x23.html','cupula-cilindrica-preta-45x45x30.html','cupula-conica-branca-27x35x26.html','cupula-sino-gelo-18x45x31.html'
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
  assert.ok(home.includes('href="loja.html">Ver produtos'),'direct shop in hero');
  assert.ok(home.includes('href="loja.html">Escolher minha cúpula'),'shop CTA preserved');
  assert.ok(home.includes('data-store-products data-limit="4"'),'products on homepage');
  assert.ok(home.includes('Falar pelo WhatsApp'),'assisted support preserved');
  assert.match(catalog,/id="monte"/);
  assert.match(catalog,/adicione ao pedido/);
});


test('catalogue immediately leads new shoppers to a usable configurator', () => {
  const html = readFileSync('modelos.html', 'utf8');
  const cart = readFileSync('cart.js', 'utf8');
  const css = readFileSync('styles.css', 'utf8');
  assert.match(html, /class="catalog-hero__actions"/);
  assert.match(html, /href="#monte">Montar e comprar minha cúpula/);
  assert.match(html, /data-cart-target-when-empty="#monte"/);
  assert.match(html, /data-cart-target-with-items="carrinho\.html"/);
  assert.match(html, /data-cart-empty-label="Montar cúpula"/);
  assert.match(cart, /data-cart-target-when-empty/);
  assert.match(cart, /cartTargetWithItems/);
  assert.match(css, /\.catalog-hero__actions/);
  assert.match(html, /id="monte"/);
  // Payment settings and carrier rules are outside the scope of this change.
  assert.match(readFileSync('api/mercadopago/status.js', 'utf8'), /CENTER_CHECKOUT_ENABLED/);
});

test('retangular SEO page is discoverable and shape purchase CTAs avoid empty carts', () => {
  const landing = readFileSync('cupulas-retangulares.html', 'utf8');
  assert.ok(landing.includes('Cúpulas Retangulares para Abajur Sob Medida'), 'specific SEO title');
  assert.ok(landing.includes('rel="canonical" href="https://www.centercupulas.com.br/cupulas-retangulares.html"'), 'canonical');
  assert.ok(landing.includes('href="modelos.html?formato=piramidal-retangular#monte"'), 'preselected configurator');
  assert.ok(readFileSync('catalogo.js','utf8').includes("'piramidal-retangular'"), 'existing configurator supports format');
  assert.ok(readFileSync('sitemap.xml','utf8').includes('cupulas-retangulares.html'), 'indexed in sitemap');
  for (const name of ['index.html','modelos.html']) {
    const html = readFileSync(name, 'utf8');
    assert.ok(html.includes('class="category-entry__tile" href="cupulas-retangulares.html"'), name+' link');
    assert.ok(html.includes('href="cupulas-atacado.html"'), name+' B2B link preserved');
  }
  for(const [name,format] of [['cupulas-conicas.html','conica'],['cupulas-cilindricas.html','drum'],['cupulas-quadradas.html','piramidal-quadrada']]) {
    const html = readFileSync(name,'utf8');
    assert.ok(html.includes('href="modelos.html?formato='+format+'#monte"'), name+' direct purchase');
    assert.ok(!html.includes('Frete confirmado separadamente'), name+' old freight copy removed');
  }
});


test('cart shows selected fabric/shape reference without accepting arbitrary external image URLs',()=>{
  const wizard = readFileSync('catalogo.js','utf8');
  const store = readFileSync('cart.js','utf8');
  const cart = readFileSync('carrinho.js','utf8');
  const page = readFileSync('carrinho.html','utf8');
  const css = readFileSync('styles.css','utf8');
  assert.ok(wizard.includes('preview_image: getCatalogVisual('));
  assert.ok(store.includes('preview_image: /^assets'));
  assert.ok(cart.includes('const safeImage = /^assets'));
  assert.ok(cart.includes('alt="Referência visual da configuração escolhida"'));
  assert.ok(!/preview_image:\s*item\.preview_image/.test(store),'image must be sanitized');
  assert.ok(page.includes('class="checkout-assurance" data-cart-assurance'));
  assert.ok(cart.includes('assurance.hidden = empty'));
  for(const link of ['como-comprar.html','entregas-e-trocas.html','privacidade.html']) assert.ok(page.includes('href="'+link+'"'));
  assert.ok(css.includes('.cart-item__visual img'));
  assert.ok(wizard.includes("heading?.scrollIntoView({ block: 'start', behavior: 'auto' })"));
});

test('ready-product store uses server quotes and the existing cart',()=>{
  const home=readFileSync('index.html','utf8');
  const page=readFileSync('loja.html','utf8');
  const store=readFileSync('loja.js','utf8');
  assert.ok(home.includes('data-store-products data-limit="4"'));
  assert.ok(page.includes('data-store-products'));
  assert.ok(page.includes('modelos.html#monte'),'custom route preserved');
  assert.ok(store.includes('public-pricing-quote'),'no invented catalog price');
  assert.ok(store.includes("q?.confidence!=='high'"));
  assert.ok(store.includes('q?.exact_reference!==true'));
  assert.ok(store.includes('window.CenterCupulasCart'),'shared cart');
  assert.ok(store.includes("window.location.assign('carrinho.html')"));
  assert.equal((store.match(/ref:'[0-9][0-9]'/g)||[]).length,8);
  assert.ok(!store.includes('historical_price'));
});

test('simplified storefront homepage prioritizes products, categories and customization',()=>{
 const html=readFileSync('index.html','utf8');
 const css=readFileSync('homepage-shop.css','utf8');
 assert.ok(!html.includes('data-hero-carousel'),'hero carousel removed');
 assert.ok(html.includes('Cúpulas para abajur,'),'short product-first headline');
 assert.ok(html.includes('data-store-products data-limit="4"'),'live-priced four-product feature');
 assert.ok(html.includes('href="loja.html">Ver produtos'),'direct retail path');
 assert.ok(html.includes('href="modelos.html#monte">Personalizar minha cúpula'),'customization path');
 assert.ok(html.includes('id="tipos"'),'format discovery maintained');
 assert.ok(html.includes('id="contato"'),'contact anchor preserved');
 assert.ok(html.includes('src="loja.js"'),'server-quoted storefront');
 assert.ok(css.includes('@media (max-width:680px)'),'mobile responsive design');
});

test('eight individually indexed product pages connect to server quote and cart',()=>{
 const pages=[{"slug":"cupula-conica-bege-20x35x25.html","id":"conica-20-35-25","name":"Cúpula cônica bege"},{"slug":"cupula-cilindrica-off-white-25x25x15.html","id":"drum-25-25-15","name":"Cúpula cilíndrica off-white"},{"slug":"cupula-piramidal-quadrada-branca-15x30x20.html","id":"piramidal-15-30-20","name":"Cúpula piramidal quadrada branca"},{"slug":"cupula-cilindrica-bege-40x40x25.html","id":"drum-40-40-25","name":"Cúpula cilíndrica bege"},{"slug":"cupula-conica-off-white-10x35x23.html","id":"conica-10-35-23","name":"Cúpula cônica off-white"},{"slug":"cupula-cilindrica-preta-45x45x30.html","id":"drum-45-45-30","name":"Cúpula cilíndrica preta"},{"slug":"cupula-conica-branca-27x35x26.html","id":"conica-27-35-26","name":"Cúpula cônica branca"},{"slug":"cupula-sino-gelo-18x45x31.html","id":"bell-18-45-31","name":"Cúpula estilo sino gelo"}];
 const products=readFileSync('loja.js','utf8');
 const runtime=readFileSync('produto.js','utf8');
 const xml=readFileSync('sitemap.xml','utf8');
 for(const p of pages) {
  const html=readFileSync(p.slug,'utf8');
  assert.equal((html.match(/<h1\b/g)||[]).length,1,p.slug+': one H1');
  assert.ok(html.includes('<h1>'+p.name+'</h1>'),p.slug+': correct title');
  assert.ok(html.includes('"id":"'+p.id+'"'),p.slug+': embedded product');
  assert.ok(html.includes('src="produto.js"'),p.slug+': script');
  assert.ok(html.includes('data-pdp-qty'),p.slug+': quantity');
  assert.ok(html.includes('data-pdp-buy'),p.slug+': cart button');
  assert.ok(html.includes('"@type":"Product"'),p.slug+': product structured data');
  assert.ok(!html.includes('"price":'),p.slug+': no unverified structured price');
  assert.ok(xml.includes('https://www.centercupulas.com.br/'+p.slug),p.slug+': sitemap');
  assert.ok(products.includes(p.slug),p.slug+': link in shop');
 }
 assert.ok(runtime.includes('public-pricing-quote'));
 assert.ok(runtime.includes("q?.exact_reference!==true"));
 assert.ok(runtime.includes('window.CenterCupulasCart'));
 assert.doesNotThrow(()=>new Function(runtime));
 assert.doesNotThrow(()=>new Function(products));
});
