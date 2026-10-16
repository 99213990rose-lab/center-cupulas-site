// Public feature-status endpoint. Does not expose credentials or customer information.
export default function handler(req, res) {
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
  return res.status(200).json({ checkout_enabled: enabled, flow: enabled ? 'mercadopago' : 'manual' });
}
