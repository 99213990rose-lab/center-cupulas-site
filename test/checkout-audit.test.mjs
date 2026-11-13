import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import audit from '../api/internal/checkout-audit.js';

const savedFetch = globalThis.fetch;
const keys = ['CRON_SECRET', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
const savedEnv = Object.fromEntries(keys.map(k => [k, process.env[k]]));
function setup(t) {
  t.after(() => {
    globalThis.fetch = savedFetch;
    for (const key of keys) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
  });
  process.env.CRON_SECRET = 'test-only-private-secret-more-than-twenty-chars';
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_example_placeholder';
}
function res() {
  return {
    statusCode: 200, headers: {}, body: null,
    status(code) { this.statusCode = code; return this; },
    setHeader(k, v) { this.headers[k] = v; return this; },
    json(value) { this.body = value; return this; }
  };
}
function req(authorization = 'Bearer ' + process.env.CRON_SECRET) {
  return { method: 'GET', headers: { authorization } };
}
function snapshot(overrides = {}) {
  return {
    paid_quotes_without_orders: 0,
    paid_checkout_orders_without_jobs: 0,
    applied_payments_without_paid_order: 0,
    duplicate_approved_charges: 0,
    pending_email_notifications: 0,
    stale_email_notifications: 0,
    pending_emails_never_attempted: 0,
    active_online_orders_missing_fitting: 0,
    ...overrides
  };
}

test('cron rejects unauthenticated callers before accessing credentials or database', async t => {
  setup(t);
  globalThis.fetch = () => { throw Error('must not fetch'); };
  const unauthorized = res();
  await audit(req('Bearer wrong'), unauthorized);
  assert.equal(unauthorized.statusCode, 401);
  const wrongMethod = res();
  await audit({ ...req(), method: 'POST' }, wrongMethod);
  assert.equal(wrongMethod.statusCode, 405);
  assert.equal(unauthorized.headers['Cache-Control'], 'private, no-store');
});
test('cron requests exactly one database aggregation with service-role key', async t => {
  setup(t);
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++;
    assert.equal(url, 'https://example.supabase.co/rest/v1/rpc/center_checkout_integrity_snapshot');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.apikey, 'sb_secret_example_placeholder');
    assert.equal(options.headers.Authorization, undefined);
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.body, '{}');
    return Response.json(snapshot({pending_email_notifications: 4, stale_email_notifications: 4, pending_emails_never_attempted: 4}));
  };
  const response = res();
  await audit(req(), response);
  assert.equal(calls, 1);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.status, 'attention');
  assert.equal(response.body.pending_email_notifications, 4);
  assert.equal(response.body.active_online_orders_missing_fitting, 0);
  assert.equal(response.body.paid_quotes_without_orders, 0);
});
test('unconfirmed lamp fitting makes operations need attention, not failed payments', async t => {
  setup(t);
  globalThis.fetch = async () => Response.json(snapshot({active_online_orders_missing_fitting: 8}));
  const response = res();
  await audit(req(), response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.status, 'attention');
  assert.equal(response.body.active_online_orders_missing_fitting, 8);
});

test('financial mismatch is critical, even when other metrics are healthy', async t => {
  setup(t);
  globalThis.fetch = async () => Response.json(snapshot({applied_payments_without_paid_order: 1}));
  const response = res();
  await audit(req(), response);
  assert.equal(response.statusCode, 503);
  assert.equal(response.body.status, 'critical');
});
test('duplicate approved payment is critical', async t => {
  setup(t);
  globalThis.fetch = async () => Response.json(snapshot({duplicate_approved_charges: 1}));
  const response = res();
  await audit(req(), response);
  assert.equal(response.statusCode, 503);
  assert.equal(response.body.duplicate_approved_charges, 1);
});
test('database failures and incomplete snapshots must fail closed', async t => {
  setup(t);
  for (const data of [null, [], { pending_email_notifications: 0 }, snapshot({stale_email_notifications: -1}), snapshot({stale_email_notifications: '0'})]) {
    globalThis.fetch = async () => Response.json(data);
    const response = res();
    await audit(req(), response);
    assert.equal(response.statusCode, 503);
    assert.equal(response.body.status, 'unavailable');
  }
  globalThis.fetch = async () => Response.json({error:'unavailable'}, {status:503});
  const failure = res();
  await audit(req(), failure);
  assert.equal(failure.statusCode, 503);
});
test('SQL migration grants only service_role permission', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20261112_center_checkout_integrity_snapshot.sql', import.meta.url), 'utf8');
  assert.match(sql, /security invoker/);
  assert.match(sql, /revoke all on function public\.center_checkout_integrity_snapshot\(\)/);
  assert.match(sql, /from public, anon, authenticated/);
  assert.match(sql, /to service_role/);
  assert.match(sql, /not exists/);
});
test('daily checkout health remains on private cron route', () => {
  const cfg = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.ok(cfg.crons.some(x => x.path === '/api/internal/checkout-audit' && x.schedule === '15 12 * * *'));
});
