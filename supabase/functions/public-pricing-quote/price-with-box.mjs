// Shared arithmetic for cart checkout and one-product catalog estimates.
// Only manufacturing gets quantity-discounted; all predicted box costs remain
// embedded in the final product lines, never an additional checkout charge.
export const roundMoney = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export function addBoxesToPrices(lines, boxBudgets, threshold, discountPercent) {
  const empty = { status: 'requires_review' };
  if (!Array.isArray(lines) || !lines.length || !Array.isArray(boxBudgets) || lines.length !== boxBudgets.length) return empty;
  const limit = Number(threshold);
  const percent = Number(discountPercent);
  if (!Number.isFinite(limit) || limit < 0 || !Number.isFinite(percent) || percent < 0 || percent >= 100) return empty;
  if (lines.some(x => !Number.isInteger(Number(x.quantity)) || Number(x.quantity) < 1 ||
    !Number.isFinite(Number(x.line_list_total)) || Number(x.line_list_total) <= 0) ||
    boxBudgets.some(x => x?.status !== 'estimate' || !Number.isFinite(Number(x.total_cost_brl)) || Number(x.total_cost_brl) < 0)) return empty;

  const manufacturerSubtotal = roundMoney(lines.reduce((sum, x) => sum + Number(x.line_list_total), 0));
  const unlocked = manufacturerSubtotal >= limit;
  const multiplier = unlocked ? (1 - percent / 100) : 1;
  const pricedItems = lines.map((line, index) => {
    const includedBoxCost = Number(boxBudgets[index].total_cost_brl);
    const qty = Number(line.quantity);
    const gross = roundMoney(Number(line.line_list_total) + includedBoxCost);
    const net = roundMoney(roundMoney(Number(line.line_list_total) * multiplier) + includedBoxCost);
    return {
      ...line,
      unit_list_price: roundMoney(gross / qty),
      line_list_total: gross,
      unit_price: roundMoney(net / qty),
      line_total: net
    };
  });
  const subtotalBeforeDiscount = roundMoney(pricedItems.reduce((sum, x) => sum + x.line_list_total, 0));
  const productTotal = roundMoney(pricedItems.reduce((sum, x) => sum + x.line_total, 0));
  const totalBoxCost = roundMoney(boxBudgets.reduce((sum, x) => sum + Number(x.total_cost_brl), 0));
  if (!Number.isFinite(productTotal) || productTotal <= 0) return empty;
  return {
    status: 'ok',
    items: pricedItems,
    manufacturerSubtotal,
    subtotalBeforeDiscount,
    productTotal,
    discountUnlocked: unlocked,
    discountAmount: roundMoney(subtotalBeforeDiscount - productTotal),
    totalBoxCost
  };
}
