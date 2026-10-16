// Checkout Pro: server-only endpoint. Disabled until production credentials and shipping are validated.
const SITE = 'https://www.centercupulas.com.br';
const QUOTE_API = 'https://nygjkojgvbdhemvfsqug.supabase.co/functions/v1/public-cart-checkout';
const json = (res, status, body) => res.status(status).setHeader('Cache-Control', 'no-store').json(body);
export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });
  if (process.env.CENTER_CHECKOUT_ENABLED !== 'true') return json(res, 503, { error: 'checkout_not_enabled' });
  // No origin CEP/token: no verified shipping and therefore no payable order.
  if (!process.env.FRENET_TOKEN || !/^\d{8}$/.test(String(process.env.CENTER_CUPULAS_ORIGIN_CEP || '').replace(/\D/g, ''))) {
    return json(res, 503, { error: 'shipping_not_configured' });
  }
  const token = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  if (!token || !process.env.MERCADO_PAGO_WEBHOOK_SECRET || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return json(res, 503, { error: 'payment_not_configured' });
  }
  const origin = req.headers.origin;
  if (![SITE, 'https://centercupulas.com.br'].includes(origin)) return json(res, 403, { error: 'invalid_origin' });
  try {
    const { items, customer, shippingSelection } = req.body || {};
    if (!Array.isArray(items) || !items.length || items.length > 20 || !customer || !shippingSelection?.code) {
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
    const total = Number(Number(quote.total).toFixed(2));
    if (quote.shipping?.freight == null || !Number.isSafeInteger(Math.round(total * 100)) || total <= 0) return json(res, 422, { error: 'unverified_total' });
    const preferenceResponse = await fetch('https://api.mercadopago.com/checkout/preferences', {
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
    });
    const preference = await preferenceResponse.json();
    if (!preferenceResponse.ok || !preference.init_point) return json(res, 502, { error: 'payment_provider_unavailable' });
    return json(res, 200, { checkout_url: preference.init_point, quote_code: quote.quote_code });
  } catch {
    return json(res, 502, { error: 'checkout_unavailable' });
  }
}
