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

// The same grouping applies to single-product catalog quotes and cart lines.
export function estimateBoxCostForItem(item, rules) {
  const invalid = { status: 'requires_review', total_cost_brl: null, volumes: [] };
  if (!item || item.format === 'oval') return invalid;
  const maxNested = Math.floor(Number(rules?.max_nested_per_package));
  const maxDimension = Number(rules?.max_package_dimension_cm);
  const side = Number(rules?.side_padding_cm);
  const paddingHeight = Number(rules?.height_padding_cm);
  const nestingIncrease = Number(rules?.nested_height_increment_cm);
  const top = Number(item.top);
  const bottom = Number(item.bottom);
  const height = Number(item.height);
  const quantity = Number(item.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 500 ||
    ![top,bottom,height].every(v => Number.isFinite(v) && v>=1 && v<=150) ||
    ![maxNested,maxDimension,side,paddingHeight,nestingIncrease].every(Number.isFinite) ||
    maxNested<1 || maxNested>30 || maxDimension<=0 || side<0 || paddingHeight<0 || nestingIncrease<0) return invalid;
  const nested = ['conica','bell','piramidal-quadrada'].includes(item.format);
  const id = String(item.id || 'single-item');
  const packs = [];
  let remaining=quantity;
  while(remaining>0) {
    let units=Math.min(maxNested,remaining);
    if(!nested) {
      const fit=Math.max(1,Math.floor((maxDimension-paddingHeight)/Math.max(1,height)));
      units=Math.min(units,fit);
    }
    const width=Math.ceil(Math.max(top,bottom)+side);
    const depth=width;
    const packedHeight=Math.ceil(nested?height+paddingHeight+Math.max(0,units-1)*nestingIncrease:height*units+paddingHeight);
    if(Math.max(width,depth,packedHeight)>maxDimension) return invalid;
    packs.push({item_id:id,units,requires_manual_review:false});
    remaining-=units;
  }
  return calculateBoxPurchaseBudget({status:'estimated',packages:packs},
    [{id,top,bottom,height}],rules);
}

