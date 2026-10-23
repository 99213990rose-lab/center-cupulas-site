function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return json(res, 405, { error: 'Método não permitido.' });
  }

  const token = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  const paymentId = String((req.query || {}).payment_id || '').trim();
  if (!token || !/^\d+$/.test(paymentId)) {
    return json(res, 400, { error: 'Pagamento inválido.' });
  }

  try {
    const response = await fetch(
      'https://api.mercadopago.com/v1/payments/' + encodeURIComponent(paymentId),
      { headers: { Authorization: 'Bearer ' + token } }
    );
    const payment = await response.json().catch(() => ({}));
    if (!response.ok) return json(res, response.status, { error: 'Pagamento não encontrado.' });

    return json(res, 200, {
      id: String(payment.id || ''),
      status: payment.status || 'unknown',
      statusDetail: payment.status_detail || '',
      orderRef: payment.external_reference || '',
      amount: payment.transaction_amount || null,
      currency: payment.currency_id || 'BRL'
    });
  } catch (error) {
    console.error('Payment lookup error', error);
    return json(res, 502, { error: 'Não foi possível consultar o pagamento.' });
  }
};
