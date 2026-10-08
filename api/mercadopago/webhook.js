import security from '../../lib/center-mp-security.cjs';
import db from '../../lib/center-checkout-db.cjs';

const { validId, verifyMercadoPagoSignature, reconcileMercadoPagoPayment, shouldApplyStatus } = security;

export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  if (req.method !== 'POST') return res.status(405).json({error:'method_not_allowed'});
  if (Number(req.headers['content-length'] || 0) > 25000) return res.status(413).json({error:'payload_too_large'});

  const secret = process.env.CENTER_MP_TEST_WEBHOOK_SECRET || '';
  const testToken = process.env.MERCADO_PAGO_TEST_ACCESS_TOKEN || '';
  if (!secret || !testToken.startsWith('TEST-')) {
    // Nunca processar callback desprotegido ou de credenciais desconhecidas.
    return res.status(503).json({error:'payment_webhook_not_configured'});
  }

  const url=new URL(req.url,'https://www.centercupulas.com.br');
  const event=req.body || {};
  const eventType=String(event.type || url.searchParams.get('type') || '').toLowerCase();
  if (eventType && eventType !== 'payment') return res.status(200).json({received:true,ignored:true});

  const queryId=validId(url.searchParams.get('data.id') || url.searchParams.get('id'));
  const bodyId=validId(event?.data?.id || event?.id);
  if (queryId && bodyId && queryId !== bodyId) return res.status(400).json({error:'payment_id_mismatch'});
  const paymentId=queryId || bodyId;
  if (!paymentId) return res.status(400).json({error:'payment_id_required'});

  const signature=req.headers['x-signature'];
  const requestId=req.headers['x-request-id'];
  const verified=verifyMercadoPagoSignature({
    signature:Array.isArray(signature)?signature[0]:signature,
    requestId:Array.isArray(requestId)?requestId[0]:requestId,
    paymentId,secret
  });
  if (!verified) return res.status(401).json({error:'invalid_webhook_signature'});

  try {
    // Não confiar no webhook/retorno do navegador. Consulta o próprio Mercado Pago.
    const response=await fetch('https://api.mercadopago.com/v1/payments/'+encodeURIComponent(paymentId),{
      headers:{Authorization:'Bearer '+testToken},
      signal:AbortSignal.timeout(12000)
    });
    if (!response.ok) return res.status(502).json({error:'payment_verification_unavailable'});
    const payment=await response.json();
    const externalRef=String(payment.external_reference||'');
    if (!/^CENTER-[0-9a-f-]{36}$/i.test(externalRef)) {
      return res.status(200).json({received:true,ignored:true,reason:'other_project'});
    }
    const order=await db.findByReference(externalRef);
    if (!order) return res.status(404).json({error:'center_order_not_found'});

    const result=reconcileMercadoPagoPayment(order,payment);
    if (!result.valid || String(payment.id)!==paymentId) {
      console.error('Center Mercado Pago: payment mismatch',result.reasons);
      return res.status(409).json({error:'payment_order_mismatch'});
    }
    if (!shouldApplyStatus(order.payment_status,result.status)) {
      return res.status(200).json({received:true,processed:false,status:order.payment_status});
    }
    const paid=result.status==='paid';
    const applied=await db.patchOrder(order.id,{
      payment_status:result.status,
      mp_payment_id:paymentId,
      last_payment_status:String(payment.status||''),
      ...(paid?{paid_at:new Date().toISOString()}: {})
    },order.payment_status);
    return res.status(200).json({
      received:true,processed:Boolean(applied),
      status:applied?.payment_status||order.payment_status
    });
  } catch(error) {
    console.error('Center Mercado Pago webhook failed:',error?.message||'unknown');
    return res.status(503).json({error:'payment_processing_unavailable'});
  }
}
