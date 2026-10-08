'use strict';
const { estimateCenterPackaging } = require('../../lib/center-packaging.cjs');

const QUOTE_URL = 'https://nygjkojgvbdhemvfsqug.supabase.co/functions/v1/public-cart-checkout';
const MAX_BYTES = 40_000;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const rawLength = Number(req.headers['content-length'] || 0);
  if (rawLength > MAX_BYTES) return res.status(413).json({ error: 'cart_too_large' });
  const items = req.body?.items;
  if (!Array.isArray(items) || items.length < 1 || items.length > 20) {
    return res.status(400).json({ error: 'invalid_cart' });
  }

  let packaging;
  try {
    packaging = estimateCenterPackaging(items);
  } catch (error) {
    const code = String(error?.message || 'invalid_cart');
    return res.status(400).json({ error: code });
  }

  try {
    // Nunca aceitar unit_price, total ou frete enviados pelo navegador.
    // Cotação de produto vinda do motor do Supabase da própria Center.
    const upstream = await fetch(QUOTE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'preview', items }),
      signal: AbortSignal.timeout(12000)
    });
    const quote = await upstream.json();
    if (!upstream.ok || quote?.status !== 'ok') {
      return res.status(422).json({
        error: quote?.error || 'product_quote_unavailable',
        requires_review: true
      });
    }
    const productTotal = Number(quote.product_total);
    if (!Number.isFinite(productTotal) || productTotal <= 0) {
      return res.status(502).json({ error: 'invalid_product_total' });
    }
    const boxesTotal = Number(packaging.packaging_fee);
    const reviewReasons = packaging.review_reasons.slice();
    if (quote.calibration !== false) reviewReasons.push('product_pricing_not_approved');
    if (packaging.calibration) reviewReasons.push('box_prices_and_logistics_not_approved');
    if (packaging.status === 'review') reviewReasons.push('package_requires_review');

    return res.status(200).json({
      ...quote,
      packaging,
      packaging_fee: boxesTotal,
      product_total: productTotal,
      subtotal_with_packaging: Math.round((productTotal + boxesTotal + Number.EPSILON) * 100) / 100,
      total: Math.round((productTotal + boxesTotal + Number.EPSILON) * 100) / 100,
      freight: null,
      payment_eligible: false,
      review_reasons: [...new Set(reviewReasons)],
      note: 'Embalagens e frete em calibração; nenhum pagamento é liberado neste ambiente de testes.'
    });
  } catch (error) {
    console.error('center checkout preview failed', error?.name || 'unknown');
    return res.status(502).json({ error: 'pricing_service_unavailable' });
  }
}
