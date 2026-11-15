import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync,existsSync} from 'node:fs';

const pages=['index.html','loja.html','carrinho.html','meus-pedidos.html'];
const assetPattern=/<(?:script|link)\b[^>]*?\b(?:src|href)=["']([^"']+)["'][^>]*>/gi;

test('critical customer pages reference real, nonempty local JS and CSS assets',()=>{
  for(const page of pages){
    const markup=readFileSync(new URL('../'+page,import.meta.url),'utf8');
    const paths=[...markup.matchAll(assetPattern)].map(match=>match[1])
      .filter(value=>! /^(?:https?:)?\/\//i.test(value) &&
        /\.(?:js|css)(?:[?#]|$)/i.test(value));
    assert.ok(paths.some(value=>/\.js(?:[?#]|$)/i.test(value)),page+' must load JavaScript');
    assert.ok(paths.some(value=>/\.css(?:[?#]|$)/i.test(value)),page+' must load CSS');
    for(const path of paths){
      const filename=path.split(/[?#]/,1)[0].replace(/^\/+/, '');
      assert.doesNotMatch(filename,/(?:^|\/)\.\.(?:\/|$)/,page+': unexpected path traversal');
      const target=new URL('../'+filename,import.meta.url);
      assert.equal(existsSync(target),true,page+': missing asset '+path);
      assert.ok(statSync(target).size>0,page+': empty asset '+path);
    }
  }
});
