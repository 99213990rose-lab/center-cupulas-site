import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/catalogo.js';
function response(){
  const headers={};
  return {headers,setHeader:(k,v)=>{headers[k]=v;},statusCode:200,end(){this.ended=true;}};
}
test('catalogue downloads redirect without analytics network requests',()=>{
  const res=response();
  handler({method:'GET'},res);
  assert.equal(res.statusCode,302);
  assert.equal(res.headers.Location,'/catalogo.pdf');
  assert.equal(res.ended,true);
  assert.equal(res.headers['Cache-Control'],'no-store');
});
test('catalogue download handles HEAD and blocks write methods',()=>{
  const head=response();
  handler({method:'HEAD'},head);
  assert.equal(head.statusCode,302);
  const post=response();
  handler({method:'POST'},post);
  assert.equal(post.statusCode,405);
  assert.equal(post.headers.Allow,'GET, HEAD');
});
