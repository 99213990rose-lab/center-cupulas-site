// Proxy da precificação pública da Center. Mesma origem do site de testes;
// evita o bloqueio CORS das URLs temporárias da Vercel.
// Não autoriza cobrança: a resposta do motor ainda é estimativa em calibração.
const UPSTREAM = 'https://nygjkojgvbdhemvfsqug.supabase.co/functions/v1/public-pricing-quote';
const FORMATS = new Set(['conica','bell','drum','oval','piramidal-quadrada','piramidal-retangular','octogonal','cubo']);
const MATERIALS = new Set(['juta','linho','tricoline','tecido','tecido_comum','rústico','rustico']);

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'POST') return res.status(405).json({error:'method_not_allowed'});
  if (Number(req.headers['content-length'] || 0) > 2500) return res.status(413).json({error:'payload_too_large'});

  const input = req.body || {};
  const format = String(input.format || '').trim();
  const material = String(input.material || '').trim();
  const top = Number(input.top), bottom = Number(input.bottom), height = Number(input.height);
  const quantity = Number(input.quantity);

  if (!FORMATS.has(format) || !MATERIALS.has(material.toLowerCase()) ||
      ![top,bottom,height].every(n => Number.isFinite(n) && n >= 1 && n <= 150) ||
      !Number.isInteger(quantity) || quantity < 1 || quantity > 500) {
    return res.status(400).json({status:'error',error:'invalid_configuration'});
  }

  try {
    const response = await fetch(UPSTREAM, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({format,material,top,bottom,height,quantity}),
      signal:AbortSignal.timeout(12000)
    });
    const data = await response.json().catch(()=>null);
    if (!response.ok || !data || !['estimate','consult'].includes(data.status)) {
      return res.status(502).json({status:'error',error:'pricing_temporarily_unavailable'});
    }
    if (data.status === 'estimate' &&
      (!Number.isFinite(Number(data.total)) || Number(data.total) <= 0 ||
        !Number.isFinite(Number(data.unit_price)) || Number(data.unit_price) <= 0)) {
      return res.status(502).json({status:'error',error:'invalid_pricing_result'});
    }
    return res.status(200).json(data);
  } catch (error) {
    console.error('center public price preview unavailable:',error?.name||'unknown');
    return res.status(503).json({status:'error',error:'pricing_temporarily_unavailable'});
  }
}
