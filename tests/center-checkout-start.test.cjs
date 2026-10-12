'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const originalFetch = global.fetch;
let handler;

test.before(async () => {
  ({ default: handler } = await import('../api/checkout/start.js'));
});

test.after(() => {
  global.fetch = originalFetch;
});

function validBody() {
  return {
    checkout_attempt_id: '550e8400-e29b-41d4-a716-446655440000',
    items: [{
      id: 'item-test',
      format: 'conica',
      material: 'tecido_comum',
      top: 20,
      bottom: 20,
      height: 20,
      quantity: 1
    }],
    customer: {
      name: 'Cliente de teste',
      email: 'cliente@example.com',
      phone: '11999998888',
      cep: '08265220'
    }
  };
}

async function invoke({ method = 'POST', host = 'center-cupulas-site-test.vercel.app', body = validBody() } = {}) {
  const state = {
    headers: {},
    statusCode: 200,
    body: null,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    }
  };
  const req = {
    method,
    headers: {
      host,
      'content-length': String(Buffer.byteLength(JSON.stringify(body)))
    },
    body
  };
  await handler(req, state);
  return state;
}

test('checkout recusa domínio oficial antes de consultar preços ou criar pagamento', async () => {
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    throw new Error('fetch não deveria ser chamado para o domínio oficial');
  };

  const result = await invoke({ host: 'www.centercupulas.com.br' });

  assert.equal(result.statusCode, 403);
  assert.equal(result.body.error, 'preview_only');
  assert.equal(calls, 0);
});

test('checkout não cobra quando frete e embalagem continuam sem aprovação, mesmo com dados falsos do navegador', async () => {
  const calls = [];
  global.fetch = async (url) => {
    calls.push(String(url));
    assert.match(String(url), /public-cart-checkout/);
    return {
      ok: true,
      json: async () => ({
        status: 'ok',
        calibration: false,
        pricing_approved: true,
        production_approved: true,
        items: [{ quantity: 1, approved_for_auto_checkout: true }],
        product_total: 100
      })
    };
  };

  const body = validBody();
  // Tentativa deliberada de falsificar frete e totais no navegador.
  body.shipping = {
    verified: true,
    calibration: false,
    provider: 'Falso',
    service_code: 'FAKE',
    recipient_cep: '08265220',
    price: 0
  };
  body.total = 0.01;
  body.unit_price = 0.01;

  const result = await invoke({ body });

  assert.equal(result.statusCode, 409);
  assert.equal(result.body.error, 'checkout_not_ready');
  assert.ok(result.body.review_reasons.includes('shipping_not_verified'));
  assert.ok(result.body.review_reasons.includes('packaging_not_approved'));
  assert.equal(calls.length, 1);
  assert.equal(calls.some(url => url.includes('api.mercadopago.com')), false);
});
