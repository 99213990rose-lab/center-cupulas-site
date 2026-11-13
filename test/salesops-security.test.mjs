import test from 'node:test';
import assert from 'node:assert/strict';
import salesops from '../api/salesops-meta.js';

const originalFetch = globalThis.fetch;
const token = 'Bearer ' + 'a'.repeat(42);
function req(overrides = {}) {
  return { method: 'POST', headers: { authorization: token }, query: { action: 'activate' },
    body: { action: 'inspect' }, ...overrides };
}
function res() {
  return { statusCode: 200, headers: {}, body: null,
    setHeader(k, v) { this.headers[k] = v; return this; },
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; }
  };
}
test('SalesOps blocks unauthenticated requests and unapproved actions', async t => {
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = () => { throw Error('must not fetch'); };
  let response = res();
  await salesops(req({headers: {}}), response);
  assert.equal(response.statusCode, 401);
  response = res();
  await salesops(req({query: {action: 'any-function'}}), response);
  assert.equal(response.statusCode, 400);
  assert.equal(response.headers['Cache-Control'], 'private, no-store');
});
test('SalesOps refuses an oversized payload before contacting Supabase', async t => {
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = () => { throw Error('must not fetch'); };
  const response = res();
  await salesops(req({body: {notes: 'x'.repeat(20000)}}), response);
  assert.equal(response.statusCode, 413);
  assert.equal(response.body.error, 'payload_too_large');
});
test('SalesOps forwards only allowlisted actions and preserves successful JSON', async t => {
  t.after(() => { globalThis.fetch = originalFetch; });
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++;
    assert.equal(url, 'https://nygjkojgvbdhemvfsqug.supabase.co/functions/v1/center-meta-account-activate');
    assert.equal(options.headers.Authorization, token);
    assert.ok(options.signal instanceof AbortSignal);
    return Response.json({ok:true,provider:'meta'});
  };
  const response = res();
  await salesops(req(), response);
  assert.equal(calls, 1);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, {ok:true,provider:'meta'});
});
test('SalesOps never forwards upstream secrets or raw error messages', async t => {
  t.after(() => { globalThis.fetch = originalFetch; });
  const privateMessage = 'internal-provider-secret-abcd-xyz';
  globalThis.fetch = async () => Response.json({error:'server',detail:privateMessage}, {status:500});
  const response = res();
  await salesops(req(), response);
  assert.equal(response.statusCode, 502);
  assert.equal(response.body.error, 'upstream_rejected');
  assert.ok(!JSON.stringify(response.body).includes(privateMessage));
});
test('SalesOps returns a generic error on invalid JSON or a network exception', async t => {
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => new Response('provider raw secret', {status:200});
  const response = res();
  await salesops(req(), response);
  assert.equal(response.statusCode, 502);
  assert.equal(response.body.error, 'upstream_unavailable');
  globalThis.fetch = async () => { throw TypeError('private-upstream-token'); };
  const timeout = res();
  await salesops(req(), timeout);
  assert.equal(timeout.statusCode, 502);
  assert.ok(!JSON.stringify(timeout.body).includes('private-upstream-token'));
});
