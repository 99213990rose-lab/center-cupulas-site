import mpTransport from './transport.cjs';
import {createHmac} from 'node:crypto';
const cleanToken = (raw) => String(raw || '').trim()
  .replace(/^['"]|['"]$/g, '')
  .replace(/^Bearer\s+/i, '')
  .replace(/[\r\n\t ]/g, '');
// Checkout Pro: server-only endpoint. Disabled until production credentials and shipping are validated.
const SITE = 'https://www.centercupulas.com.br';
const QUOTE_API = 'https://nygjkojgvbdhemvfsqug.supabase.co/functions/v1/public-cart-checkout';
const json = (res, status, body) => res.status(status).setHeader('Cache-Control', 'no-store').json(body);
export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });
  if (process.env.CENTER_CHECKOUT_ENABLED !== 'true') return json(res, 503, { error: 'checkout_not_enabled' });
  // No origin CEP/token or verified packaging: do not create a payable order.
  if (process.env.CENTER_USE_LIVE_FRENET_RATES !== 'true') return json(res, 503, { error: 'carrier_rates_not_enabled' });
  if (!process.env.FRENET_TOKEN || !/^\d{8}$/.test(String(process.env.CENTER_CUPULAS_ORIGIN_CEP || '').replace(/\D/g, ''))) {
    return json(res, 503, { error: 'shipping_not_configured' });
  }
  const token = cleanToken(process.env.MERCADO_PAGO_ACCESS_TOKEN);
  if (!token || !process.env.MERCADO_PAGO_WEBHOOK_SECRET || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return json(res, 503, { error: 'payment_not_configured' });
  }
  const origin = req.headers.origin;
  if (![SITE, 'https://centercupulas.com.br'].includes(origin)) return json(res, 403, { error: 'invalid_origin' });
  try {
    const { items, customer, shippingSelection } = req.body || {};
    if (!Array.isArray(items) || !items.length || items.length > 20 || !customer || !shippingSelection?.code ||
        typeof shippingSelection?.price !== 'number' || !Number.isFinite(shippingSelection.price) || shippingSelection.price < 0 ||
        typeof shippingSelection?.productTotal !== 'number' || !Number.isFinite(shippingSelection.productTotal) || shippingSelection.productTotal <= 0) {
      return json(res, 400, { error: 'complete_order_and_shipping_required' });
    }
    // Current Center backend recalculates each item and verifies selected freight on submission.
    const quoteResponse = await fetch(QUOTE_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: SITE },
      body: JSON.stringify({ action: 'payment', items, customer, shippingSelection: { code: shippingSelection.code } })
    });
    const quote = await quoteResponse.json();
    if (!quoteResponse.ok || !quote.submitted) return json(res, 422, { error: 'quote_unavailable' });
    if (quote.shipping?.status !== 'quoted' || quote.packaging?.status !== 'estimated' ||
        !Number.isFinite(Number(quote.total)) || Number(quote.total) <= 0 || !quote.quote_id) {
      return json(res, 422, { error: 'shipping_or_packaging_needs_review', quote_code: quote.quote_code });
    }
    // A new live carrier rate or product price must never silently raise the amount shown.
    const expectedCents = Math.round((shippingSelection.productTotal + shippingSelection.price) * 100);
    const serverCents = Math.round(Number(quote.total) * 100);
    if (!Number.isSafeInteger(expectedCents) || !Number.isSafeInteger(serverCents) || expectedCents !== serverCents) {
      return json(res, 409, {error:'price_changed'});
    }
    const total = Number(Number(quote.total).toFixed(2));
    if (quote.shipping?.freight == null || !Number.isSafeInteger(Math.round(total * 100)) || total <= 0) return json(res, 422, { error: 'unverified_total' });
    const preferenceRequest = {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', 'X-Idempotency-Key': String(quote.quote_id) },
      body: JSON.stringify({
        items: [{ id: String(quote.quote_id), title: 'Pedido Center Cúpulas ' + quote.quote_code, quantity: 1, currency_id: 'BRL', unit_price: total }],
        external_reference: 'CENTER_CUPULAS:' + quote.quote_id,
        payer: { name: String(customer.name || '').slice(0, 120), ...(String(customer.email || '').trim() ? { email: String(customer.email).trim().slice(0, 180) } : {}) },
        back_urls: { success: SITE + '/carrinho.html?payment=return', failure: SITE + '/carrinho.html?payment=failed', pending: SITE + '/carrinho.html?payment=pending' },
        notification_url: SITE + '/api/mercadopago/webhook',
        auto_return: 'approved'
      })
    };
    let preferenceResponse;
    try {
      preferenceResponse=await fetch('https://api.mercadopago.com/checkout/preferences',preferenceRequest);
    } catch {
      // Native HTTPS fallback for recoverable Node fetch/Undici connection errors.
      console.warn('center-checkout using native HTTPS fallback for Mercado Pago');
      try {
        preferenceResponse=await mpTransport.requestJson('https://api.mercadopago.com/checkout/preferences',preferenceRequest);
      } catch {
        return json(res,502,{error:'payment_provider_unavailable'});
      }
    }
    let preference = {};
    try { preference = await preferenceResponse.json(); } catch {}
    if (!preferenceResponse.ok || typeof preference.init_point !== 'string' || !preference.init_point.startsWith('https://')) {
      // Mercado Pago returns distinct codes for credential/identity checks and
      // invalid preference fields. Whitelist, never echo arbitrary upstream data.
      const causes = Array.isArray(preference.cause) ? preference.cause : [];
      const labels = [preference.error, preference.message, ...causes.map(x => x?.code)];
      const known = [
        'invalid_access_token', 'invalid_credentials', 'unauthorized',
        'collector_does_not_comply_with_current_regulation',
        'invalid_back_urls', 'invalid_items', 'invalid_payer',
        'invalid_shipments', 'invalid_payment_methods'
      ];
      const providerReason = labels.find(x => typeof x === 'string' && known.includes(x)) || 'other';
      console.error('center-checkout Mercado Pago preference refused', {
        status: preferenceResponse.status, reason: providerReason
      });
      const accountError = ['invalid_access_token', 'invalid_credentials', 'unauthorized'].includes(providerReason)
        || [401, 403].includes(preferenceResponse.status);
      const complianceError = providerReason === 'collector_does_not_comply_with_current_regulation';
      return json(res, accountError || complianceError ? 503 : 502, {
        error: accountError ? 'payment_account_authentication_failed'
          : complianceError ? 'payment_account_verification_required' : 'payment_provider_unavailable',
        provider_code: providerReason
      });
    }
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(quote.quote_id))){
      return json(res,502,{error:'checkout_reference_invalid'});
    }
    // A private proof lets this customer see only the status of this specific quote.
    // It cannot confirm payment: only the signed Mercado Pago webhook can do that.
    const receiptProof=createHmac('sha256',process.env.SUPABASE_SERVICE_ROLE_KEY)
      .update('center-status-v1:'+quote.quote_id).digest('hex');
    return json(res, 200, {
      checkout_url: preference.init_point,
      quote_code: quote.quote_code,
      status_reference: quote.quote_id,
      status_proof: receiptProof
    });
  } catch {
    return json(res, 502, { error: 'checkout_unavailable' });
  }
}
