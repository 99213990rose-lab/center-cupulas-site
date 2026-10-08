'use strict';

// Custos de caixa: estimativas, NÃO são preços de fornecedores confirmados.
// As medidas indicadas são INTERNAS. A dimensão externa e peso real precisam ser aferidos.
// Nunca liberar uma cobrança usando exclusivamente este catálogo em calibração.
const BOX_CATALOG = Object.freeze([
  Object.freeze({ id: 'P30', label: 'Pequena', internal_cm: 30, estimated_cost_brl: 6 }),
  Object.freeze({ id: 'M45', label: 'Média', internal_cm: 45, estimated_cost_brl: 16 }),
  Object.freeze({ id: 'G60', label: 'Grande', internal_cm: 60, estimated_cost_brl: 30 }),
  Object.freeze({ id: 'GG70', label: 'Extragrande', internal_cm: 70, estimated_cost_brl: 45 })
]);

const CLEARANCE_TOTAL_CM = 6; // folga total em calibração, alinhada à regra de embalagem do Supabase.
const MAX_PACKAGES_ESTIMATE = 30;
const SUPPORTED_FORMATS = new Set(['conica', 'bell', 'drum', 'piramidal-quadrada', 'cubo']);
const roundBRL = x => Math.round((x + Number.EPSILON) * 100) / 100;
const dimensions = box => ({
  width: box.internal_cm,
  length: box.internal_cm,
  height: box.internal_cm
});

function estimateCenterPackaging(items) {
  if (!Array.isArray(items) || items.length === 0 || items.length > 20) {
    throw new Error('invalid_cart');
  }

  const packages = [];
  const review_reasons = [];
  let units_total = 0;
  let packaging_fee = 0;

  for (const [index, item] of items.entries()) {
    const { top, bottom, height, quantity } = item || {};
    const values = [Number(top), Number(bottom), Number(height)];
    const qty = Number(quantity);
    if (!values.every(v => Number.isFinite(v) && v > 0 && v <= 150)) {
      throw new Error('invalid_dimensions');
    }
    if (!Number.isInteger(qty) || qty < 1 || qty > 500) {
      throw new Error('invalid_quantity');
    }
    units_total += qty;
    if (units_total > 500) throw new Error('invalid_quantity');

    const format = String(item.format || '');
    if (!SUPPORTED_FORMATS.has(format)) {
      review_reasons.push('unsupported_or_special_format:' + index);
      continue;
    }

    const maxHorizontal = Math.max(values[0], values[1]);
    const needed = Math.max(maxHorizontal, values[2]) + CLEARANCE_TOTAL_CM;
    const box = BOX_CATALOG.find(b => b.internal_cm >= needed);
    if (!box) {
      review_reasons.push('no_standard_box:' + index);
      continue;
    }

    // Conservador: uma peça por caixa. Nunca supor empilhamento/aninhamento
    // sem teste físico do produto e da resistência da caixa.
    if (qty + packages.length > MAX_PACKAGES_ESTIMATE) {
      review_reasons.push('many_packages:' + index);
      continue;
    }

    for (let i = 0; i < qty; i++) {
      packages.push({
        box_id: box.id,
        box_label: box.label,
        item_index: index,
        item_id: item.id == null ? null : String(item.id).slice(0, 80),
        units: 1,
        dimensions_cm: dimensions(box),
        dimensions_type: 'internal_estimate',
        needs_external_dimensions_and_weight: true,
        cost_brl: box.estimated_cost_brl
      });
    }
    packaging_fee += qty * box.estimated_cost_brl;
  }

  return {
    status: review_reasons.length ? 'review' : 'estimated',
    calibration: true,
    price_source: 'provisional_oct_2026',
    clearance_total_cm: CLEARANCE_TOTAL_CM,
    box_catalog: BOX_CATALOG,
    package_count: packages.length,
    units_total,
    packages,
    packaging_fee: roundBRL(packaging_fee),
    review_reasons,
    note: 'Custo e escolha de caixas em calibração. Exigem medidas externas, peso e teste físico antes de cobrar automaticamente.'
  };
}

module.exports = { BOX_CATALOG, CLEARANCE_TOTAL_CM, estimateCenterPackaging };
