import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const home=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const promo=home.slice(home.indexOf('<section class="home-kit-art"'),home.indexOf('</section>',home.indexOf('<section class="home-kit-art"'))+10);
const dialog=home.slice(home.indexOf('<dialog class="home-kit-options"'),home.indexOf('</dialog>')+9);
const script=readFileSync(new URL('../promo-kit.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../promo-2026.css',import.meta.url),'utf8');

test('banner shows 2 por R$99,90 without dimensions or fabric copy',()=>{
 assert.match(promo,/alt="2 POR R\$ 99,90"/);
 assert.match(promo,/assets\/promo\/arte-2-por-9990\.svg/);
 assert.doesNotMatch(promo,/12 × 20 × 20 cm cada/);
 assert.match(dialog,/12 × 20 × 20 cm cada/);
 assert.doesNotMatch(promo,/Algodão bege|Linho|Juta|R\$ 120|O PAR POR/);
 assert.match(promo,/Aproveitar agora/);
});
test('cotton can choose among approved colors, linen/jute only natural, prices after click',()=>{
 assert.match(dialog,/data-kit-material/);
 assert.match(dialog,/Algodão — R\$ 99,90/);
 assert.match(dialog,/Linho natural — R\$ 120,00/);
 assert.match(dialog,/Juta natural — R\$ 120,00/);
 for(const color of ['Bege','Off-white','Branco','Preto','Marrom']){
   assert.ok(dialog.includes('value="'+color+'"'));
 }
 assert.match(script,/selectedColor=material\.value==='algodao'\?color\.value:'Natural'/);
 assert.match(script,/kind:'promo_kit'/);
 assert.match(script,/quantity:2/);
});
test('CTA opens fabric selection, not WhatsApp, and animation respects reduced motion',()=>{
 assert.match(script,/dialog\.showModal\(\)/);
 assert.doesNotMatch(script,/wa\.me|whatsapp\.com/);
 assert.match(css,/kit-cta-lightpass/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.ok(css.includes('.home-kit-options [hidden]'));
});

test('price artwork stays readable, vector and accessible without raster artifacts',()=>{
 const art=readFileSync(new URL('../assets/promo/arte-2-por-9990.svg',import.meta.url),'utf8');
 assert.match(art,/viewBox="0 0 465 178"/);
 assert.match(art,/font-size="32"/);
 assert.match(art,/>2 POR</);
 assert.match(art,/>R\$ 99,90</);
 assert.match(art,/textLength="426" lengthAdjust="spacingAndGlyphs"/);
 assert.ok(15+426 < 465, "price must fit within SVG viewport including right padding");
 assert.match(promo,/aria-label="2 por R\$ 99,90"/);
 assert.match(css,/home-kit-art__price-art/);
});
