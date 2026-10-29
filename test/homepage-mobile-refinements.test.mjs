import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const homeCss=readFileSync(new URL('../homepage-shop.css',import.meta.url),'utf8');
const promoCss=readFileSync(new URL('../promo-2026.css',import.meta.url),'utf8');

test('principal chamada usa exatamente o texto aprovado, com vírgula e espaço',()=>{
 assert.ok(html.includes('<h1 id="home2-hero-title">Escolha ou monte a cúpula do seu abajur, do seu jeito.</h1>'));
 assert.ok(!html.includes('Cúpulas para abajur,<span>do seu jeito.</span>'));
 assert.match(homeCss,/text-wrap: balance;/);
 assert.match(homeCss,/\.home2-page \.home2-hero h1 \{/);
});
test('header mobile melhora marca e selo sem afetar o header desktop',()=>{
 assert.match(homeCss,/\.home2-page \.brand__mark \{ width: 44px; height: 35px;/);
 assert.match(homeCss,/\.home2-page \.brand strong \{ font-size: \.98rem;/);
 assert.match(homeCss,/\.home2-page \.brand-heritage__seal strong \{ font-size: \.57rem;/);
 assert.match(homeCss,/@media \(max-width: 370px\)/);
});
test('imagens no celular aumentam apenas no layout responsivo e mantêm os arquivos originais',()=>{
 const banner=html.slice(html.indexOf('<section class="home-kit-art"'),html.indexOf('</section>',html.indexOf('<section class="home-kit-art"'))+10);
 assert.equal((banner.match(/conica-tricoline-bege\.webp/g)||[]).length,2);
 assert.match(promoCss,/@media \(max-width: 480px\) \{/);
 assert.match(promoCss,/grid-template-columns: minmax\(0, 1fr\) 116px;/);
 assert.match(promoCss,/width: 72px;/);
 assert.match(promoCss,/height: 72px;/);
 assert.match(promoCss,/@media \(max-width: 359px\)/);
 assert.match(banner,/data-kit-buy/);
 assert.match(banner,/2 POR R\$ 99,90/);
});
