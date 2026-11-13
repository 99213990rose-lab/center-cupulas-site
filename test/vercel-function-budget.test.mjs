import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
function routes(folder){
  return readdirSync(folder,{withFileTypes:true}).flatMap(entry=>{
    const path=join(folder,entry.name);
    if(entry.isDirectory())return routes(path);
    return entry.isFile()&&/\.(?:js|mjs|ts)$/.test(entry.name)?[path]:[];
  });
}
test('Vercel Hobby production stays within 12 serverless functions',()=>{
  const paths=routes(join(root,'api'));
  assert.ok(paths.length<=12, `Found ${paths.length} API function entrypoints; Hobby limit is 12`);
  assert.ok(paths.some(path=>path.endsWith('/operations/record-tracking.js')));
  assert.ok(!paths.some(path=>path.endsWith('/operations/production-fittings.js')));
});
test('fitting review is still routed through the authenticated operations handler',()=>{
  const source=readFileSync(join(root,'api/operations/record-tracking.js'),'utf8');
  assert.ok(existsSync(join(root,'lib/production-fittings.mjs')));
  assert.match(source,/import handleFittings from '\.\.\/\.\.\/lib\/production-fittings\.mjs'/);
  assert.match(source,/\['production_fittings', 'operations_health'\]\.includes\(req\.query\?\.operation\)/);
  assert.match(source,/return handleFittings\(req, res\)/);
});
