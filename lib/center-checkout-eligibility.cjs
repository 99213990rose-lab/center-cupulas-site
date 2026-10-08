'use strict';

// Gate autoritativo do pagamento: recebe APENAS cotação recalculada pelo
// servidor e oferta de frete obtida novamente pela API. Nunca confiar em valores
// enviados pelo navegador. Falta qualquer validação? Não cria cobrança.
const cents = value => {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 500000 || Math.abs(n * 100 - Math.round(n * 100)) > 1e-6) return null;
  return Math.round(n * 100);
};

function evaluateCheckout({ quote, shipping, customer } = {}) {
  const reasons = [];
  if (!quote || quote.status !== 'ok') reasons.push('invalid_server_quote');
  if (!quote || quote.calibration !== false || quote.pricing_approved !== true) {
    reasons.push('pricing_not_calibrated');
  }
  if (!quote || quote.production_approved !== true) reasons.push('production_not_approved');
  if (!Array.isArray(quote?.items) || !quote.items.length ||
      quote.items.some(i => i.approved_for_auto_checkout !== true || !Number.isInteger(Number(i.quantity)) || Number(i.quantity) < 1)) {
    reasons.push('items_not_approved');
  }

  const packs = quote?.packaging;
  if (!packs || packs.status !== 'approved' || packs.calibration !== false ||
      packs.cost_approved !== true || !Array.isArray(packs.packages) ||
      packs.packages.length === 0 || packs.packages.length > 30) {
    reasons.push('packaging_not_approved');
  } else if (packs.packages.some(p => {
    const d = p.external_dimensions_cm;
    return !d || !['width','length','height'].every(k=>Number.isFinite(d[k])&&d[k]>0&&d[k]<=150) ||
       !Number.isFinite(p.gross_weight_kg) || p.gross_weight_kg <= 0 || p.measured !== true;
  })) {
    reasons.push('package_dimensions_unverified');
  }

  const productCents = cents(quote?.product_total);
  const packingCents = cents(quote?.packaging_fee);
  const subtotalCents = cents(quote?.subtotal_with_packaging);
  if (productCents === null || productCents <= 0 || packingCents === null ||
      subtotalCents === null || subtotalCents !== productCents + packingCents) {
    reasons.push('server_total_mismatch');
  }

  let shippingCents = null;
  if (!shipping || shipping.verified !== true || shipping.calibration !== false ||
      !shipping.service_code || !shipping.provider || !/^\d{8}$/.test(String(shipping.recipient_cep || ''))) {
    reasons.push('shipping_not_verified');
  } else {
    shippingCents = cents(shipping.price);
    if (shippingCents === null) reasons.push('shipping_price_invalid');
  }

  if (!customer || String(customer.name || '').trim().length < 2 ||
    !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(customer.email || '').trim()) ||
    !/^\d{10,15}$/.test(String(customer.phone || '').replace(/\D/g, '')) ||
    !/^\d{8}$/.test(String(customer.cep || '').replace(/\D/g, ''))) {
    reasons.push('invalid_customer');
  }

  const amountCents = reasons.length ? null : productCents + packingCents + shippingCents;
  if (amountCents !== null && (amountCents <= 0 || amountCents > 50000000)) {
    reasons.push('total_out_of_range');
  }

  return { eligible: reasons.length === 0, reasons, amount_cents: reasons.length ? null : amountCents };
}

module.exports = { cents, evaluateCheckout };
