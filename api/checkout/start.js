import crypto from 'node:crypto';
import eligibility from '../../lib/center-checkout-eligibility.cjs';
import packagingTool from '../../lib/center-packaging.cjs';
import store from '../../lib/center-checkout-db.cjs';

const { evaluateCheckout } = eligibility;
const { estimateCenterPackaging } = packagingTool;
const QUOTE_URL = 'https://nygjkojgvbdhemvfsqug.supabase.co/functions/v1/public-cart-checkout';
const ORG_ID = 'e3cb8002-ebaa-4d3a-acd3-46a678815e7b';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const safeText = (x, limit) => String(x || '').trim().slice(0,limit);

async function repriceOnServer(items) {
  const packing = estimateCenterPackaging(items);
  const response = await fetch(QUOTE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'preview', items }),
    signal: AbortSignal.timeout(12000)
  });
  if (!response.ok) throw new Error('factory_price_unavailable');
  const q = await response.json();
  if (q.status !== 'ok') throw new Error('factory_price_unavailable');
  const price = Number(q.product_total);
  if (!Number.isFinite(price) || price <= 0) throw new Error('factory_price_invalid');
  return {
    ...q,
    packaging: packing,
    packaging_fee: packing.packaging_fee,
    subtotal_with_packaging: Math.round((price + packing.packaging_fee)*100)/100
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'POST') return res.status(405).json({error:'method_not_allowed'});
  if (Number(req.headers['content-length'] || 0) > 40000) return res.status(413).json({error:'cart_too_large'});

  const body = req.body || {};
  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length < 1 || items.length > 20) return res.status(400).json({error:'invalid_cart'});
  const attempt = String(body.checkout_attempt_id || '');
  if (!UUID.test(attempt)) return res.status(400).json({error:'invalid_checkout_attempt_id'});

  const customer = {
    name: safeText(body.customer?.name,120),
    email: safeText(body.customer?.email,180).toLowerCase(),
    phone: safeText(body.customer?.phone,25).replace(/\D/g,''),
    cep: safeText(body.customer?.cep,16).replace(/\D/g,''),
    street: safeText(body.customer?.street,160),
    number: safeText(body.customer?.number,30),
    neighborhood: safeText(body.customer?.neighborhood,100),
    city: safeText(body.customer?.city,100),
    state: safeText(body.customer?.state,2)
  };

  try {
    // Recalcula produtos e caixas a cada tentativa. Nunca confiar em valores
    // enviados pelo browser. Nenhum pagamento antes de frete e peso reais.
    const quote = await repriceOnServer(items);

    // O frete atual usa dimensões internas e peso volumétrico provisório.
    // Portanto este campo NÃO é aprovado nem preenchido com preços do cliente.
    // Uma futura integração de frete server-side confiável fornecerá o objeto.
    const shipping = { verified:false, calibration:true };
    const gate = evaluateCheckout({quote,shipping,customer});
    if (!gate.eligible) {
      return res.status(409).json({
        error:'checkout_not_ready',
        message:'Compra online ainda indisponível. Preços, caixa ou frete precisam de confirmação.',
        review_reasons:gate.reasons
      });
    }

    // Dupla proteção: o fluxo inicial APENAS aceita credenciais de teste.
    // A abertura de cobrança real exige uma revisão de código explícita.
    const testToken = process.env.MERCADO_PAGO_TEST_ACCESS_TOKEN || '';
    if (process.env.CENTER_CHECKOUT_TEST_ENABLED !== 'true' || !testToken.startsWith('TEST-')) {
      return res.status(503).json({error:'payment_test_not_configured'});
    }

    const fingerprint = crypto.createHash('sha256').update(JSON.stringify({
      items:quote.items,customer,shipping,amount:gate.amount_cents
    })).digest('hex');
    const previous = await store.findByAttempt(attempt);
    if (previous && previous.cart_fingerprint !== fingerprint) {
      return res.status(409).json({error:'checkout_attempt_conflict'});
    }
    if (previous?.mp_init_point && previous.payment_status !== 'preference_error') {
      return res.status(200).json({orderId:previous.id, initPoint:previous.mp_init_point, reused:true});
    }

    const orderId = previous?.id || crypto.randomUUID();
    const externalReference = 'CENTER-' + orderId;
    if (!previous) {
      await store.insertOrder({
        id:orderId, organization_id:ORG_ID, project:'center-cupulas',
        checkout_attempt_id:attempt,cart_fingerprint:fingerprint,
        external_reference:externalReference,customer,items:quote.items,
        shipping,packaging:quote.packaging,amount_cents:gate.amount_cents
      });
    }

    const preferenceResponse = await fetch('https://api.mercadopago.com/checkout/preferences',{
      method:'POST',
      headers:{
        Authorization:'Bearer ' + testToken,
        'Content-Type':'application/json',
        'X-Idempotency-Key':attempt
      },
      body:JSON.stringify({
        items:[{
          id:'center-cupulas-pedido',
          title:'Pedido personalizado — Center Cúpulas',
          quantity:1,currency_id:'BRL',unit_price:gate.amount_cents/100
        }],
        payer:{name:customer.name,email:customer.email},
        external_reference:externalReference,
        notification_url:'https://www.centercupulas.com.br/api/mercadopago/webhook',
        back_urls:{
          success:'https://www.centercupulas.com.br/carrinho.html',
          failure:'https://www.centercupulas.com.br/carrinho.html',
          pending:'https://www.centercupulas.com.br/carrinho.html'
        },
        auto_return:'approved'
      }),
      signal:AbortSignal.timeout(15000)
    });
    const result = await preferenceResponse.json().catch(()=>({}));
    if (!preferenceResponse.ok || !result.id || !result.sandbox_init_point) {
      await store.patchOrder(orderId,{payment_status:'preference_error'},'checkout_created');
      return res.status(502).json({error:'mercado_pago_preference_failed'});
    }
    const updated = await store.patchOrder(orderId,{
      payment_status:'pending',
      mp_preference_id:String(result.id),
      mp_init_point:String(result.sandbox_init_point)
    });
    if (!updated) return res.status(503).json({error:'preference_persist_failed'});

    return res.status(200).json({
      orderId,
      // Nunca retornar init_point de produção durante a fase de testes.
      initPoint:result.sandbox_init_point,
      preferenceId:String(result.id),
      mode:'sandbox'
    });
  } catch (error) {
    console.error('center start checkout:',error?.message || 'unknown');
    return res.status(503).json({error:'checkout_unavailable'});
  }
}
