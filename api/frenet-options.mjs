// Frenet shipping quote helpers. Never infer a carrier tariff from an incomplete response.
const asFinite = (value) => {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const money = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
const text = (value, max=100) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0,max);
const failed = (error) => {
  if (error === undefined || error === null || error === false || error === 0) return false;
  const value=String(error).trim().toLowerCase();
  return !['','false','0','no','none'].includes(value);
};
export function normalizeFrenetOptions(data) {
  const array = Array.isArray(data?.ShippingSevicesArray) ? data.ShippingSevicesArray
    : Array.isArray(data?.ShippingServicesArray) ? data.ShippingServicesArray : null;
  if (!array) return null; // malformed response, not valid 'no options'
  const byCode = new Map();
  const duplicates = new Set();
  for (const service of array) {
    const code = text(service?.ServiceCode,60);
    const rawPrice = asFinite(service?.ShippingPrice);
    if (failed(service?.Error) || !code || rawPrice === null || rawPrice < 0 || rawPrice > 100000) continue;
    const rawDays = asFinite(service?.DeliveryTime);
    const days = rawDays!==null && rawDays>=0 && rawDays<=365 ? Math.ceil(rawDays) : null;
    const originalPrice=asFinite(service?.OriginalShippingPrice);
    const originalDays=asFinite(service?.OriginalDeliveryTime);
    const option={
      code,
      carrier:text(service?.Carrier)||'Transportadora',
      carrier_code:text(service?.CarrierCode,60),
      service:text(service?.ServiceDescription),
      price:money(rawPrice),
      original_price:originalPrice!==null && originalPrice>=rawPrice?money(originalPrice):money(rawPrice),
      delivery_days:days,
      original_delivery_days:originalDays!==null && originalDays>=0 && originalDays<=365?Math.ceil(originalDays):days,
      allow_buy_label:service?.AllowBuyLabel===true || String(service?.AllowBuyLabel).toLowerCase()==='true',
      pickup:service?.Pickup ?? null
    };
    // The checkout identifies services by code: ambiguous duplicates must not be selectable.
    if (byCode.has(code)) duplicates.add(code);
    else byCode.set(code,option);
  }
  for (const code of duplicates) byCode.delete(code);
  return [...byCode.values()].sort((a,b)=>a.price-b.price || (a.delivery_days??999)-(b.delivery_days??999));
}
