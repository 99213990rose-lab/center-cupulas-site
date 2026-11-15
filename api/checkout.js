const crypto = require('crypto');
const catalog = require('../store-products.json');

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function clean(value, max = 180) {
  return String(value || '').trim().slice(0, max);
}

function getProduct(sku) {
  return (catalog.products || []).find((item) =>
    item && item.sku === sku && item.online === true && Number(item.price) > 0
  );
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { error: 'Método não permitido.' });
  }

  const token = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  if (!token) return json(res, 503, { error: 'Pagamento indisponível no momento.' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const sku = clean(body.sku, 80);
    const product = getProduct(sku);
    if (!product) return json(res, 404, { error: 'Produto ainda não disponível para compra online.' });

    const quantity = Number.parseInt(body.quantity, 10);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > (product.maxQuantity || 5)) {
      return json(res, 400, { error: 'Quantidade inválida para compra online.' });
    }

    const deliveryMethod = clean(body.deliveryMethod, 30);
    if (deliveryMethod !== 'pickup') {
      return json(res, 409, {
        error: 'Este pedido precisa de cálculo de frete antes do pagamento.',
        code: 'FREIGHT_REQUIRED'
      });
    }

    const buyer = body.buyer || {};
    const name = clean(buyer.name, 120);
    const email = clean(buyer.email, 180);
    const phone = clean(buyer.phone, 40);
    if (!name || !email || !email.includes('@')) {
      return json(res, 400, { error: 'Nome e e-mail válidos são obrigatórios.' });
    }

    const unitPrice = Number(product.price);
    const orderRef = 'CENTER-' + Date.now().toString(36).toUpperCase() + '-' +
      crypto.randomBytes(4).toString('hex').toUpperCase();

    const siteUrl = 'https://www.centercupulas.com.br';
    const preferenceBody = {
      items: [{
        id: product.sku,
        title: product.name,
        description: product.description || product.name,
        quantity,
        currency_id: 'BRL',
        unit_price: unitPrice
      }],
      payer: { name, email },
      external_reference: orderRef,
      metadata: {
        sku: product.sku,
        reference: product.reference || '',
        measure: product.measure || '',
        material: clean(body.material, 60),
        color: clean(body.color, 60),
        buyer_phone: phone,
        delivery_method: 'pickup'
      },
      back_urls: {
        success: siteUrl + '/pedido.html?result=success',
        pending: siteUrl + '/pedido.html?result=pending',
        failure: siteUrl + '/pedido.html?result=failure'
      },
      auto_return: 'approved',
      statement_descriptor: 'CENTER CUPULAS'
    };

    const mpResponse = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': orderRef
      },
      body: JSON.stringify(preferenceBody)
    });

    const preference = await mpResponse.json().catch(() => ({}));
    if (!mpResponse.ok || !preference.init_point) {
      console.error('Mercado Pago preference error', mpResponse.status, preference);
      return json(res, 502, { error: 'Não foi possível iniciar o pagamento.' });
    }

    return json(res, 200, {
      orderRef,
      checkoutUrl: preference.init_point,
      preferenceId: preference.id || null,
      amount: Number((unitPrice * quantity).toFixed(2)),
      currency: 'BRL'
    });
  } catch (error) {
    console.error('Center checkout error', error);
    return json(res, 500, { error: 'Erro ao iniciar o checkout.' });
  }
};
