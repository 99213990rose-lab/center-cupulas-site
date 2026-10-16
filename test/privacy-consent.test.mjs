import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const js = readFileSync('privacy-consent.js','utf8');
const pages = [
  'index.html','modelos.html','reformas.html','carrinho.html',
  'como-comprar.html','entregas-e-trocas.html','privacidade.html'
];

function simulateConsent(stored = null) {
  const scripts=[];
  const events=[];
  let reloads=0;
  const state=new Map(stored ? [['centerPrivacyPreferencesV1',JSON.stringify(stored)]] : []);
  const localStorage={
    getItem:k=>state.get(k)||null,
    setItem:(k,v)=>state.set(k,v)
  };
  const document={
    readyState:'loading',
    querySelector:()=>null,
    createElement:()=>({dataset:{},async:false}),
    head:{appendChild:script=>scripts.push(script.src)},
    addEventListener:()=>{}
  };
  const window={
    localStorage,location:{reload:()=>reloads++},
    dataLayer:[],
    dispatchEvent:event=>events.push(event.type)
  };
  class CustomEvent { constructor(type){this.type=type;} }
  runInNewContext(js,{window,document,CustomEvent});
  return {window,scripts,state,events,get reloads(){return reloads;}};
}

test('no non-essential external scripts load before the visitor opts in',()=>{
  const a=simulateConsent();
  assert.deepEqual(a.scripts,[]);
  assert.equal(a.window.CenterPrivacyConsent.enabled('analytics'),false);
  assert.equal(a.window.CenterPrivacyConsent.enabled('marketing'),false);
  a.window.CenterPrivacyConsent.save({analytics:true,marketing:false});
  assert.deepEqual(a.scripts,['/_vercel/insights/script.js']);
  assert.ok(a.events.includes('center-privacy-consent'));
});

test('ad measurement requires separate marketing permission',()=>{
  const a=simulateConsent();
  a.window.CenterPrivacyConsent.save({analytics:false,marketing:true});
  assert.equal(a.scripts.length,1);
  assert.match(a.scripts[0],/www\.googletagmanager\.com/);
  assert.equal(a.window.CenterPrivacyConsent.enabled('analytics'),false);
  assert.equal(a.window.CenterPrivacyConsent.enabled('marketing'),true);
});

test('revoking active analytics forces reload so an already loaded script stops',()=>{
  const a=simulateConsent({version:1,analytics:true,marketing:false});
  assert.deepEqual(a.scripts,['/_vercel/insights/script.js']);
  a.window.CenterPrivacyConsent.save({analytics:false,marketing:false});
  assert.equal(a.reloads,1);
  assert.equal(JSON.parse(a.state.get('centerPrivacyPreferencesV1')).analytics,false);
});

test('every public page loads consent manager before first-party tracking and offers preference controls',()=>{
  for(const path of pages){
    const html=readFileSync(path,'utf8');
    assert.ok(html.includes('privacy-consent.js'),path);
    assert.ok(html.indexOf('privacy-consent.js') < html.indexOf('src="script.js"') ||
      html.indexOf('privacy-consent.js') < html.indexOf('defer src="script.js"'),path);
    assert.ok(html.includes('data-open-privacy-settings'),path);
    assert.ok(!html.includes('src="/_vercel/insights/script.js"'),path);
    assert.ok(!html.includes('src="https://www.googletagmanager.com'),path);
  }
});
