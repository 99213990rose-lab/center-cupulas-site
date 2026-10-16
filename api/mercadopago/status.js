// Public feature-status endpoint. Does not expose credentials or customer information.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
  const originCep = String(process.env.CENTER_CUPULAS_ORIGIN_CEP || '').replace(/\D/g, '');
  const enabled = process.env.CENTER_CHECKOUT_ENABLED === 'true' &&
    Boolean(process.env.MERCADO_PAGO_ACCESS_TOKEN) &&
    Boolean(process.env.MERCADO_PAGO_WEBHOOK_SECRET) &&
    Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY) &&
    Boolean(process.env.SUPABASE_URL) &&
    Boolean(process.env.FRENET_TOKEN) &&
    process.env.CENTER_USE_LIVE_FRENET_RATES === 'true' &&
    /^\d{8}$/.test(originCep);
  if (req.query?.diagnose === 'connection') {
    // Read-only credential probe; never return token, account data or method details.
    if (!process.env.MERCADO_PAGO_ACCESS_TOKEN) {
      return res.status(200).json({ checkout_enabled: enabled, provider_connection: 'not_configured' });
    }
    try {
      const probe = await fetch('https://api.mercadopago.com/v1/payment_methods', {
        method: 'GET',
        headers: {Authorization: 'Bearer ' + process.env.MERCADO_PAGO_ACCESS_TOKEN},
        signal: AbortSignal.timeout(7000)
      });
      const provider_connection = probe.ok ? 'authorized'
        : [401,403].includes(probe.status) ? 'unauthorized'
        : probe.status === 429 ? 'rate_limited' : 'provider_error';
      return res.status(200).json({ checkout_enabled: enabled, provider_connection });
    } catch {
      return res.status(200).json({ checkout_enabled: enabled, provider_connection: 'unavailable' });
    }
  }
  return res.status(200).json({ checkout_enabled: enabled, flow: enabled ? 'mercadopago' : 'manual' });
}
