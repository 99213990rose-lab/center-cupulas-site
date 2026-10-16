import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const categoryPages = [
  ['cupulas-conicas.html','conica'],
  ['cupulas-cilindricas.html','drum'],
  ['cupulas-quadradas.html','piramidal-quadrada'],
  ['cupulas-atacado.html','conica']
];
const read=(f)=>readFileSync(f,'utf8');

test('category pages have unique SEO metadata and correct canonical URLs',()=>{
  const titles=new Set();
  const descriptions=new Set();
  for(const [path] of categoryPages){
    const html=read(path);
    const title=html.match(/<title>([^<]+)<\/title>/)?.[1];
    const description=html.match(/<meta name="description" content="([^"]+)"/)?.[1];
    assert.ok(title && title.length>=30 && title.length<=82,path+': title');
    assert.ok(description && description.length>70 && description.length<180,path+': description');
    assert.ok(!titles.has(title),path+': duplicate title');
    assert.ok(!descriptions.has(description),path+': duplicate description');
    titles.add(title);
    descriptions.add(description);
    assert.match(html,/<html lang="pt-BR">/);
    assert.match(html,/<main id="conteudo">/);
    assert.equal((html.match(/<h1\b/g)||[]).length,1,path+': must have one h1');
    assert.ok(html.includes('<link rel="canonical" href="https://www.centercupulas.com.br/'+path+'">'));
    const schema=html.match(/<script type="application\/ld\+json">([^<]+)<\/script>/)?.[1];
    const json=JSON.parse(schema);
    assert.equal(json['@type'],'BreadcrumbList');
    assert.equal(json.itemListElement[1].item,'https://www.centercupulas.com.br/'+path);
    assert.ok(html.includes('privacy-consent.js') && html.includes('script.js'));
    assert.ok(!html.includes('src="https://www.googletagmanager.com'),path+': scripts must require consent');
  }
});

test('category gallery images and internal resource links exist in repository',()=>{
  for(const [path] of categoryPages){
    const html=read(path);
    const resources=[...html.matchAll(/(?:href|src)="([^"]+)"/g)].map(m=>m[1]);
    for(const resource of resources){
      if(/^(https?:|mailto:|tel:|#)/.test(resource))continue;
      const local=resource.split(/[?#]/)[0].replace(/^\//,'');
      if(!local)continue;
      assert.ok(existsSync(local),path+' has missing asset/page: '+local);
    }
    assert.ok((html.match(/loading="lazy"/g)||[]).length>=3,path+' gallery');
    assert.ok((html.match(/<img /g)||[]).length>=4,path+' imagery');
    assert.ok(html.includes('frete confirmado separadamente'),path+': freight statement');
  }
});

test('homepage, catalog and sitemap link to all four category pages',()=>{
  for(const path of ['index.html','modelos.html','sitemap.xml']){
    const html=read(path);
    for(const [category] of categoryPages) assert.ok(html.includes(category),path+' missing '+category);
  }
});

test('links to configurator keep their model format after navigation',()=>{
  const script=read('catalogo.js');
  assert.ok(script.includes("const requestedFormat = catalogQuery.get('formato')"));
  assert.ok(script.includes('allowedFormats.has(requestedFormat)'));
  assert.ok(script.includes("measureMode: 'custom'"));
  for(const [path,format] of categoryPages){
    assert.ok(read(path).includes('modelos.html?formato='+format+'#monte'),path+' missing deep link');
  }
});

test('category styles include mobile layout and no malformed margin token',()=>{
  const css=read('styles.css');
  for(const selector of ['.category-hero__grid','.category-product-grid','.category-entry__grid','.category-faq-list']){
    assert.ok(css.includes(selector),selector);
  }
  assert.ok(css.includes('@media (max-width:560px)'));
  assert.doesNotMatch(css,/margin:0 0:18px/);
});
