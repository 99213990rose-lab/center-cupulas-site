import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const edge=readFileSync(new URL('../supabase/functions/public-cart-checkout/index.ts',import.meta.url),'utf8');

test('a guest order must not erase a stored CRM email',()=>{
  assert.match(edge,/display_name:name,\.\.\.\(email\?\{email\}:\{\}\),last_seen_at:/);
  assert.doesNotMatch(edge,/display_name:name,email:email\|\|null,last_seen_at:/);
});
test('customer order email must come only from the current checkout',()=>{
  // Never infer the purchasing customer's email from CRM phone lookups.
  assert.match(edge,/shipping:\{\.\.\.shipping,customer_email:email\|\|null,/);
});
test('CRM enrichment failures are observable without aborting a valid order',()=>{
  assert.match(edge,/if\(leadUpdate\.error\)console\.warn\("public-cart-checkout crm_lead_update_failed"/);
  assert.match(edge,/\.eq\("id",leadId\)\.eq\("organization_id",ORG_ID\)/);
});

test('quote preparation bounds live freight requests and keeps failures private',()=>{
  assert.match(edge,/fetch\("https:\/\/www\.centercupulas\.com\.br\/api\/frete",[\s\S]*?signal:AbortSignal\.timeout\(10000\)/);
  assert.doesNotMatch(edge,/console\.error\("public-cart-checkout",error\)/);
});
