import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const home=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const promo=home.slice(home.indexOf('<section class="home-kit-art"'),home.indexOf('</section>',home.indexOf('<section class="home-kit-art"'))+10);
const dialog=home.slice(home.indexOf('<dialog class="home-kit-options"'),home.indexOf('</dialog>')+9);
const script=readFileSync(new URL('../promo-kit.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../promo-2026.css',import.meta.url),'utf8');

test('banner shows only 2 for R$99,90 and measurements, without fabric copy or premium price',()=>{
 assert.match(promo,/>2 POR</);
 assert.match(promo,/>R\$ 99,90</);
 assert.match(promo,/12 × 20 × 20 cm cada/);
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
