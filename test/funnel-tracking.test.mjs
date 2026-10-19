import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const edge = readFileSync('supabase/functions/center-web-event/index.ts', 'utf8');
const scripts = ['script.js', 'catalogo.js', 'carrinho.js'].map(path => readFileSync(path, 'utf8'));
const allEmitted = new Set(scripts.flatMap(source =>
  [...source.matchAll(/sendWebEvent(?:\?\.)?\(['"]([a-z_]+)['"]/g)].map(match => match[1])
));
const allowlistText = edge.match(/const ALLOWED_EVENTS = new Set\(\[([\s\S]*?)\]\)/)?.[1] || '';
const accepted = new Set([...allowlistText.matchAll(/"([a-z_]+)"/g)].map(match => match[1]));

test('Supabase accepts every client funnel event', () => {
  assert.ok(allEmitted.size >= 10, 'all conversion calls must be discovered');
  for (const name of allEmitted) assert.ok(accepted.has(name), 'not accepted by collector: ' + name);
  for (const event of [
    'page_view', 'configurator_started', 'configurator_step_completed',
    'pricing_estimate_view', 'cart_add', 'cart_view', 'shipping_option_selected',
    'checkout_attempt', 'cart_checkout_started', 'checkout_error'
  ]) {
    assert.ok(allEmitted.has(event), 'missing client event ' + event);
    assert.ok(accepted.has(event), 'missing conversion event ' + event);
  }
});

test('analytics collection still depends on visitor consent and rejects unknown event types', () => {
  assert.match(scripts[0], /CenterPrivacyConsent\?\.enabled\('analytics'\)/);
  assert.match(edge, /ALLOWED_EVENTS.has\(eventType\)/);
  assert.match(scripts[2], /Never send addresses, contact fields or raw error strings/);
});
