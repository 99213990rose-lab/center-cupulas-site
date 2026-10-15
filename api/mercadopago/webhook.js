import { createHmac, timingSafeEqual } from 'node:crypto';

const ORG_ID = 'e3cb8002-ebaa-4d3a-acd3-46a678815e7b';
const respond = (res, status, body) => res.status(status).setHeader('Cache-Control', 'no-store').json(body);
function signatureOk(req, secret) {
  const signature = String(req.headers['x-signature'] || '');
  const requestId = String(req.headers['x-request-id'] || '');
  const ts = signature.match(/(?:^|,)\s*ts=([^,]+)/)?.[1];
  const v1 = signature.match(/(?:^|,)\s*v1=([0-9a-f]+)/i)?.[1];
  const dataId = String(req.query['data.id'] || req.body?.data?.id || '');
  if (!ts || !v1 || !requestId || !/^\d+$/.test(dataId)) return false;
  const expected = createHmac('sha256', secret).update('id:' + dataId.toLowerCase() + ';request-id:' + requestId + ';ts:' + ts + ';').digest('hex');
  const actualBytes = Buffer.from(v1, 'hex');
  const expectedBytes = Buffer.from(expected, 'hex');
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}
export default async function handler(req, res) {
  if (req.method !== 'POST') return respond(res, 405, { error: 'method_not_allowed' });
  const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;
  const token = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  const supaUrl = process.env.SUPABASE_URL;
  const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret || !token || !supaUrl || !supaKey) return respond(res, 503, { error: 'not_configured' });
  if (!signatureOk(req, secret)) return respond(res, 401, { error: 'invalid_signature' });
  const eventType = String(req.body?.type || req.query.type || '').toLowerCase();
  if (eventType && eventType !== 'payment') return respond(res, 200, { received: true, ignored: true });
  const id = String(req.query['data.id'] || req.body?.data?.id || '');
  try {
    const paymentRes = await fetch('https://api.mercadopago.com/v1/payments/' + encodeURIComponent(id), {
      headers: { Authorization: 'Bearer ' + token }
    });
    if (!paymentRes.ok) return respond(res, 502, { error: 'payment_lookup_failed' });
    const payment = await paymentRes.json();
    const reference = String(payment.external_reference || '');
    if (!reference.startsWith('CENTER_CUPULAS:')) return respond(res, 200, { received: true, ignored: true });
    const quoteId = reference.slice('CENTER_CUPULAS:'.length);
    if (!/^[0-9a-f-]{36}$/i.test(quoteId)) return respond(res, 400, { error: 'invalid_reference' });
    const base = supaUrl.replace(/\/$/, '') + '/rest/v1/quotes';
    const headers = { apikey: supaKey, Authorization: 'Bearer ' + supaKey, 'Content-Type': 'application/json' };
    const query = '?id=eq.' + encodeURIComponent(quoteId) + '&organization_id=eq.' + ORG_ID + '&select=id,status,total,currency,notes';
    const found = await fetch(base + query, { headers });
    if (!found.ok) return respond(res, 502, { error: 'order_lookup_failed' });
    const quotes = await found.json();
    const quote = quotes[0];
    if (!quote) return respond(res, 200, { received: true, ignored: true });
    const expectedCents = Math.round(Number(quote.total) * 100);
    const receivedCents = Math.round(Number(payment.transaction_amount) * 100);
    if (payment.status !== 'approved') return respond(res, 200, { received: true, payment_status: payment.status });
    if (!Number.isSafeInteger(expectedCents) || expectedCents <= 0 || receivedCents !== expectedCents ||
        String(payment.currency_id) !== String(quote.currency || 'BRL')) {
      return respond(res, 409, { error: 'payment_amount_mismatch' });
    }
    if (quote.status === 'paid') return respond(res, 200, { received: true, already_processed: true });
    const paidNote = 'Mercado Pago aprovado; payment_id=' + String(payment.id).slice(0, 64);
    const update = await fetch(base + '?id=eq.' + encodeURIComponent(quoteId) + '&organization_id=eq.' + ORG_ID + '&status=neq.paid', {
      method: 'PATCH',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({ status: 'paid', notes: [quote.notes || '', paidNote].filter(Boolean).join(' | ').slice(0, 5000) })
    });
    if (!update.ok) return respond(res, 502, { error: 'order_update_failed' });
    return respond(res, 200, { received: true, paid: true });
  } catch { return respond(res, 502, { error: 'verification_failed' }); }
}
