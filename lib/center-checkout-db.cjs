'use strict';
const URL_BASE = 'https://nygjkojgvbdhemvfsqug.supabase.co/rest/v1/center_checkout_orders';

async function centerDb({ method='GET', search='', body, returnRows=true }) {
  const token = process.env.CENTER_SUPABASE_SERVICE_ROLE_KEY;
  if (!token) throw new Error('center_database_not_configured');
  const url = URL_BASE + (search ? '?' + search : '');
  const response = await fetch(url, {
    method,
    headers: {
      apikey: token,
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
      Prefer: returnRows ? 'return=representation' : 'return=minimal'
    },
    ...(body === undefined ? {} : {body: JSON.stringify(body)}),
    signal: AbortSignal.timeout(12000)
  });
  if (!response.ok) {
    const e = new Error('center_database_error');
    e.code = response.status;
    throw e;
  }
  if (!returnRows) return null;
  return response.json();
}
const eq = (key, value) => key + '=eq.' + encodeURIComponent(String(value));

async function findByAttempt(id) {
  const rows = await centerDb({ search: eq('checkout_attempt_id', id) + '&select=*&limit=1' });
  return rows[0] || null;
}
async function findByReference(ref) {
  const rows = await centerDb({ search: eq('external_reference', ref) + '&select=*&limit=1' });
  return rows[0] || null;
}
async function insertOrder(order) {
  const rows = await centerDb({ method:'POST', body:order });
  return rows[0] || null;
}
async function patchOrder(id, changes, previousStatus) {
  const search = eq('id', id) + (previousStatus ? '&' + eq('payment_status', previousStatus) : '') + '&select=*';
  const rows = await centerDb({method:'PATCH',search,body:{...changes, updated_at:new Date().toISOString()}});
  return rows[0] || null;
}
module.exports = {findByAttempt,findByReference,insertOrder,patchOrder};
