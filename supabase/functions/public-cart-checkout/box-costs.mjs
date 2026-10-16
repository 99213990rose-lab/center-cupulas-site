// Center Cúpulas: box PURCHASING budget only; not a carrier freight quote.
// A tier is selected from the cúpula's dimensions, without requiring a box registry.
// Units already grouped into planned volumes by the preview packaging estimator.
export function calculateBoxPurchaseBudget(packaging, items, rules) {
  const invalid = { status: 'requires_review', total_cost_brl: null, volumes: [], source: 'internal_box_procurement' };
  if (!packaging || packaging.status === 'review' || !Array.isArray(packaging.packages) || !packaging.packages.length || !Array.isArray(items)) return invalid;
  const amounts = {
    pequena: Number(rules?.box_small_cost_brl),
    media: Number(rules?.box_medium_cost_brl),
    grande: Number(rules?.box_large_cost_brl)
  };
  const smallMax = Number(rules?.box_small_product_max_cm);
  const mediumMax = Number(rules?.box_medium_product_max_cm);
  if (!Object.values(amounts).every(v => Number.isFinite(v) && v >= 0 && v <= 1000)
    || !(smallMax > 0 && mediumMax > smallMax)) return invalid;
  const itemById = new Map(items.map(item => [String(item.id), item]));
  const volumes = [];
  let total = 0;
  for (const pack of packaging.packages) {
    const item = itemById.get(String(pack.item_id || ''));
    if (!item || pack.requires_manual_review || !(Number(pack.units) >= 1)) return invalid;
    const maxProductCm = Math.max(Number(item.top), Number(item.bottom), Number(item.height));
    if (!Number.isFinite(maxProductCm) || maxProductCm <= 0) return invalid;
    const tier = maxProductCm <= smallMax ? 'pequena' : maxProductCm <= mediumMax ? 'media' : 'grande';
    const cost = amounts[tier];
    volumes.push({ tier, units: Number(pack.units), cost_brl: cost });
    total += cost;
  }
  const counts = { pequena: 0, media: 0, grande: 0 };
  for (const volume of volumes) counts[volume.tier] += 1;
  return {
    status: 'estimate',
    total_cost_brl: Math.round((total + Number.EPSILON) * 100) / 100,
    counts,
    volumes,
    unit_costs_brl: amounts,
    source: 'internal_box_procurement',
    calculation: 'product_size_tiers',
    note: 'Estimativa interna para compra de caixas, não frete nem cobrança adicional ao cliente. Quantidade de volumes sujeita à separação real.'
  };
}
