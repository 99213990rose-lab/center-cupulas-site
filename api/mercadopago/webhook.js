import { notifyCenterPaidSale, saleAlertIsConfigured } from './sale-alert.js';
import mpTransport from './transport.cjs';
const cleanToken = (raw) => String(raw || '').trim()
  .replace(/^['"]|['"]$/g, '')
  .replace(/^Bearer\s+/i, '')
  .replace(/[\r\n\t ]/g, '');
import { createHmac, timingSafeEqual } from 'node:crypto';

const ORG_REF = 'CENTER_CUPULAS:';
const respond = (res, code, data) => res.status(code).setHeader('Cache-Control', 'no-store').json(data);

function getNotificationId(req) {
  const raw = req.query?.['data.id'] ?? req.body?.data?.id;
  const id = String(raw ?? '');
  return /^[0-9]{1,30}$/.test(id) ? id : null;
}

function validSignature(req, secret, id) {
  const raw = String(req.headers['x-signature'] || '');
  const requestId = String(req.headers['x-request-id'] || '');
  const ts = raw.match(/(?:^|,)\s*ts=([0-9]+)(?:,|$)/)?.[1];
  const signature = raw.match(/(?:^|,)\s*v1=([a-f0-9]{64})(?:,|$)/i)?.[1];
  if (!id || !ts || !signature || !requestId || requestId.length > 200) return false;
  const manifest = `id:${id.toLowerCase()};request-id:${requestId};ts:${ts};`;
  const expected = createHmac('sha256', secret).update(manifest).digest();
  const supplied = Buffer.from(signature, 'hex');
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function supabaseHeaders(key) {
  // Modern sb_secret_ keys are NOT JWTs: never send them as Authorization: Bearer.
  const headers = { 'apikey': key, 'Content-Type': 'application/json' };
  if (!key.startsWith('sb_secret_')) headers.Authorization = 'Bearer ' + key;
  return headers;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return respond(res, 405, { error: 'method_not_allowed' });
  const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;
  const token = cleanToken(process.env.MERCADO_PAGO_ACCESS_TOKEN);
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret || !token || !url || !key) return respond(res, 503, { error: 'not_configured' });

  const id = getNotificationId(req);
  if (!validSignature(req, secret, id)) return respond(res, 401, { error: 'invalid_signature' });
  const type = String(req.body?.type || req.query?.type || 'payment').toLowerCase();
  if (type !== 'payment' && !type.startsWith('payment.')) {
    return respond(res, 200, { received: true, ignored: true });
  }

  try {
    const paymentUrl='https://api.mercadopago.com/v1/payments/' + id;
    let response;
    try {
      response = await fetch(paymentUrl, {
        headers: { Authorization: 'Bearer ' + token },
        signal: AbortSignal.timeout(6500)
      });
    } catch {
      // Only a signed payment notification reaches this branch.
      response=await mpTransport.requestJson(paymentUrl,{
        headers:{Authorization:'Bearer '+token}
      });
    }
    if (!response.ok) {
      console.error('center-webhook payment lookup failed', response.status);
      return respond(res, 503, { error: 'payment_lookup_failed' });
    }
    const payment = await response.json();
    if (String(payment.id) !== id) return respond(res, 409, { error: 'payment_identity_mismatch' });
    const reference = String(payment.external_reference || '');
    if (!reference.startsWith(ORG_REF)) return respond(res, 200, { received: true, ignored: true });
    const quoteId = reference.slice(ORG_REF.length);
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(quoteId)) {
      return respond(res, 409, { error: 'invalid_order_reference' });
    }
    if (payment.status !== 'approved') {
      return respond(res, 200, { received: true, payment_status: String(payment.status || 'unknown') });
    }
    const cents = Math.round(Number(payment.transaction_amount) * 100);
    if (!Number.isSafeInteger(cents) || cents <= 0 || payment.currency_id !== 'BRL') {
      console.error('center-webhook invalid currency or amount', id);
      return respond(res, 409, { error: 'invalid_payment_amount' });
    }

    // One atomic operation verifies total and currency, prevents duplicate confirmations,
    // records the payment ID and marks the quote paid under a row lock.
    const saved = await fetch(url.replace(/\/$/, '') + '/rest/v1/rpc/confirm_center_checkout_payment', {
      method: 'POST',
      headers: supabaseHeaders(key),
      body: JSON.stringify({
        p_quote_id: quoteId,
        p_payment_id: id,
        p_amount_cents: cents,
        p_currency: 'BRL'
      }),
      signal: AbortSignal.timeout(10000)
    });
    if (!saved.ok) {
      console.error('center-webhook reconciliation failed', saved.status, id);
      return respond(res, saved.status >= 500 ? 503 : 409, { error: 'reconciliation_failed' });
    }
    const result = await saved.json();
    if (result?.status === 'duplicate_charge') {
      console.error('CENTER PAYMENT REQUIRES REVIEW: duplicate approved charge', id);
    }
    // Alert the owner only after the signed payment was atomically applied.
    // A WhatsApp outage must never roll back or falsify a confirmed sale.
    if (result?.status === 'applied' && result?.order_id && saleAlertIsConfigured()) {
      try {
        const notice = await notifyCenterPaidSale(result.order_id);
        if (notice.status !== 'sent') console.warn('center-sale WhatsApp notice', notice.status);
      } catch (error) {
        console.error('center-sale WhatsApp alert failed', error?.message || 'alert_failed');
      }
    }
    return respond(res, 200, {
      received: true,
      reconciliation: String(result?.status || 'unknown'),
      idempotent: Boolean(result?.idempotent)
    });
  } catch (error) {
    console.error('center-webhook temporarily unavailable', error?.name || 'request_error');
    return respond(res, 503, { error: 'temporary_failure' });
  }
}
