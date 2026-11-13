import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('Vercel server functions keep native ESM instead of requiring .mjs through CJS',()=>{
  const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
  assert.equal(pkg.type,'module');
  assert.equal(pkg.private,true);
});

test('critical serverless entrypoints and their ESM dependencies import cleanly',async()=>{
  const paths=[
    '../api/mercadopago/status.js',
    '../api/internal/checkout-audit.js',
    '../api/internal/provider-audit.js',
    '../api/internal/order-email-cron.js',
    '../api/operations/record-tracking.js',
    '../api/mercadopago/create-checkout.js',
    '../api/mercadopago/webhook.js',
    '../api/catalogo.js',
    '../api/salesops-meta.js'
  ];
  for(const path of paths){
    const handler=(await import(path)).default;
    assert.equal(typeof handler,'function',path+' must export a handler');
  }
});

test('backend helper dependencies are resolvable as native ESM',async()=>{
  const auth=await import('../lib/cron-auth.mjs');
  const emails=await import('../lib/order-confirmation-email.mjs');
  const production=await import('../lib/production-fittings.mjs');
  assert.equal(typeof auth.isInternalCronAuthorized,'function');
  assert.equal(typeof emails.processOrderConfirmationEmails,'function');
  assert.equal(typeof production.default,'function');
});
