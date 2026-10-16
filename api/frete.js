// Never use a guessed shipping origin: an incorrect CEP can undercharge delivery.
const ORIGIN_CEP = String(process.env.CENTER_CUPULAS_ORIGIN_CEP || '').replace(/\D/g, '');
const FRENET_TOKEN = process.env.FRENET_TOKEN || '';

function cleanCep(value) {
  return String(value || '').replace(/\D/g, '');
}

function number(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round(value, decimals = 2) {
  const p = 10 ** decimals;
  return Math.round((number(value) + Number.EPSILON) * p) / p;
}

function normalizePackages(packages) {
  if (!Array.isArray(packages) || !packages.length || packages.length > 30) return [];
  if (packages.some((pack) => {
    const d = pack?.dimensions_cm || {};
    return ![d.width, d.length, d.height].every((v) => Number.isFinite(Number(v)) && Number(v) > 0 && Number(v) <= 300);
  })) return [];
  return packages.map((pack, index) => {
    const dims = pack?.dimensions_cm || {};
    const width = Math.max(1, Math.ceil(number(dims.width)));
    const length = Math.max(1, Math.ceil(number(dims.length)));
    const height = Math.max(1, Math.ceil(number(dims.height)));
    // Enquanto não medimos o peso real das caixas, usamos peso volumétrico conservador.
    // A cotação fica sempre marcada como "em calibração" e não libera pagamento automático.
    const volumetricWeight = Math.max(0.3, (width * length * height) / 5000);
    return {
      Weight: round(volumetricWeight, 3),
      Length: length,
      Height: height,
      Width: width,
      Diameter: 0,
      SKU: 'CX-' + String(index + 1).padStart(2, '0'),
      Category: 'Cupulas para iluminacao',
      isFragile: true,
      Quantity: 1,
      ProductName: 'Volume Center Cupulas ' + (index + 1)
    };
  });
}

function setCors(req, res) {
  const origin = req.headers.origin || '';
  const allowed =
    origin === 'https://www.centercupulas.com.br' ||
    origin === 'https://centercupulas.com.br' ||
    /^https:\/\/center-cupulas-site-[a-z0-9-]+\.vercel\.app$/.test(origin) ||
    origin.startsWith('http://localhost:');

  res.setHeader('Access-Control-Allow-Origin', allowed ? origin : 'https://www.centercupulas.com.br');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  return !origin || allowed;
}

export default async function handler(req, res) {
  const trustedOrigin = setCors(req, res);
  if (!trustedOrigin) return res.status(403).json({ error: 'invalid_origin' });
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const recipientCep = cleanCep(req.body?.recipientCep);
  const shipmentValue = Number(req.body?.shipmentValue);
  const packages = normalizePackages(req.body?.packages);

  if (!/^\d{8}$/.test(recipientCep)) return res.status(400).json({ error: 'invalid_recipient_cep' });
  if (!Number.isFinite(shipmentValue) || shipmentValue <= 0 || shipmentValue > 1000000) return res.status(400).json({ error: 'invalid_shipment_value' });
  if (!/^\d{8}$/.test(ORIGIN_CEP)) return res.status(503).json({ error: 'origin_cep_not_configured' });
  if (!packages.length) return res.status(400).json({ error: 'invalid_packages' });

  if (!FRENET_TOKEN) {
    return res.status(503).json({
      error: 'frenet_not_configured',
      provider: 'Frenet',
      integration_ready: true,
      origin_cep: ORIGIN_CEP,
      message: 'A integração está pronta, mas falta configurar o token da Frenet.'
    });
  }

  const payload = {
    SellerCEP: ORIGIN_CEP,
    RecipientCEP: recipientCep,
    ShipmentInvoiceValue: round(shipmentValue),
    RecipientCountry: 'BR',
    ShippingServiceCode: null,
    Coupom: null,
    ShippingItemArray: packages
  };

  try {
    const response = await fetch('https://api.frenet.com.br/shipping/quote', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        token: FRENET_TOKEN
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(12000)
    });

    const rawText = await response.text();
    let data = {};
    try { data = rawText ? JSON.parse(rawText) : {}; } catch {}

    if (!response.ok) {
      console.error('Frenet quote error', response.status);
      return res.status(502).json({ error: 'freight_provider_error', provider: 'Frenet' });
    }

    const services = Array.isArray(data.ShippingSevicesArray)
      ? data.ShippingSevicesArray
      : Array.isArray(data.ShippingServicesArray)
        ? data.ShippingServicesArray
        : [];

    const options = services
      .filter((service) => !service?.Error && String(service?.ServiceCode ?? '').trim() && Number.isFinite(Number(service?.ShippingPrice)) && Number(service.ShippingPrice) >= 0)
      .map((service) => ({
        code: String(service.ServiceCode || ''),
        carrier: String(service.Carrier || ''),
        carrier_code: String(service.CarrierCode || ''),
        service: String(service.ServiceDescription || ''),
        price: round(service.ShippingPrice),
        original_price: round(service.OriginalShippingPrice || service.ShippingPrice),
        delivery_days: Math.max(0, Math.ceil(number(service.DeliveryTime))),
        original_delivery_days: Math.max(0, Math.ceil(number(service.OriginalDeliveryTime || service.DeliveryTime))),
        allow_buy_label: Boolean(service.AllowBuyLabel),
        pickup: service.Pickup || null
      }))
      .sort((a, b) => a.price - b.price || a.delivery_days - b.delivery_days);

    return res.status(200).json({
      status: options.length ? 'ok' : 'no_options',
      provider: 'Frenet',
      calibration: process.env.CENTER_SHIPPING_VALIDATED !== 'true',
      origin_cep: ORIGIN_CEP,
      recipient_cep: recipientCep,
      package_count: packages.length,
      weight_basis: 'peso_volumetrico_conservador',
      options
    });
  } catch (error) {
    console.error('Freight quote exception', error);
    return res.status(502).json({ error: 'freight_unavailable', provider: 'Frenet' });
  }
}
