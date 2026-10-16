import mpTransport from './transport.cjs';
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
  if (req.query?.diagnose === 'connection' || req.query?.diagnose === 'native') {
    // Read-only credential probe; never return token, account data or method details.
    if (!process.env.MERCADO_PAGO_ACCESS_TOKEN) {
      return res.status(200).json({ checkout_enabled: enabled, provider_connection: 'not_configured' });
    }
    const healthUrl='https://api.mercadopago.com/v1/payment_methods';
    const opts={method:'GET',headers:{Authorization:'Bearer '+process.env.MERCADO_PAGO_ACCESS_TOKEN}};
    const nativeOnly=req.query?.diagnose==='native';
    try {
      let probe;
      let transport='fetch';
      if(nativeOnly) {
        probe=await mpTransport.requestJson(healthUrl,opts);
        transport='node_https';
      } else {
        try {
          probe=await fetch(healthUrl,{...opts,signal:AbortSignal.timeout(6500)});
        } catch {
          probe=await mpTransport.requestJson(healthUrl,opts);
          transport='node_https_fallback';
        }
      }
      const provider_connection = probe.ok ? 'authorized'
        : [401,403].includes(probe.status) ? 'unauthorized'
        : probe.status === 429 ? 'rate_limited' : 'provider_error';
      return res.status(200).json({checkout_enabled:enabled,provider_connection,transport});
    } catch (error) {
      // Sanitize network diagnostics: do not return exception strings or token data.
      const code = String(error?.cause?.code || error?.cause?.cause?.code || '');
      const name = String(error?.name || '');
      const connection_issue = ['UND_ERR_CONNECT_TIMEOUT', 'ETIMEDOUT'].includes(code)
        ? 'connect_timeout'
        : ['ECONNRESET', 'UND_ERR_SOCKET'].includes(code)
        ? 'connection_reset'
        : ['ENOTFOUND', 'EAI_AGAIN'].includes(code)
        ? 'dns_failure'
        : ['CERT_HAS_EXPIRED', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'].includes(code)
        ? 'tls_validation'
        : ['TimeoutError', 'AbortError'].includes(name) ? 'request_timeout'
        : name === 'TypeError' ? 'request_failed' : 'unknown';
      return res.status(200).json({ checkout_enabled: enabled,
        provider_connection: 'unavailable', connection_issue });
    }
  }
  return res.status(200).json({ checkout_enabled: enabled, flow: enabled ? 'mercadopago' : 'manual' });
}
