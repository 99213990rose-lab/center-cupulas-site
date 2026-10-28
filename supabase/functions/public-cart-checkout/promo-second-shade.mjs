// Campanha temporária; o servidor calcula os preços, nunca o navegador.
import { roundMoney } from "./price-with-box.mjs";

export const PROMO_START_MS = Date.parse("2026-10-28T00:00:00-03:00");
export const PROMO_END_MS = Date.parse("2026-11-01T00:00:00-03:00");

function isCotton(material) {
  const key = String(material || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  return key === "algodao" || key === "tricoline";
}

export function applySecondShadePromotion(quote, at = Date.now()) {
  if (!quote || quote.status !== "ok") return quote;
  const active = Number(at) >= PROMO_START_MS && Number(at) < PROMO_END_MS;
  const base = { active, applied: false, eligible: false, percent: 10, ends_at: "2026-10-31T23:59:59-03:00" };
  if (!active) return { ...quote, promotion: base };
  const eligible = quote.items.map((line, index) => ({
    line, index, quantity: Number(line.quantity), unitPrice: roundMoney(Number(line.line_list_total) / Number(line.quantity))
  })).filter(x => isCotton(x.line.material) && Number.isInteger(x.quantity) && x.quantity >= 1 && x.unitPrice > 0);
  if (eligible.reduce((sum, x) => sum + x.quantity, 0) < 2) return { ...quote, promotion: base };
  eligible.sort((a, b) => a.unitPrice - b.unitPrice || a.index - b.index);
  const chosen = eligible[0];
  const promotionalDiscount = roundMoney(chosen.unitPrice * 0.10);
  // Non-cumulative: preserve the original volume discount whenever it is more advantageous.
  if (promotionalDiscount <= Number(quote.discountAmount || 0)) {
    return { ...quote, promotion: { ...base, eligible: true, reason: "volume_discount_more_advantageous" } };
  }
  const items = quote.items.map((line, index) => {
    const lineTotal = index === chosen.index
      ? roundMoney(Number(line.line_list_total) - promotionalDiscount)
      : Number(line.line_list_total);
    return { ...line, line_total: lineTotal, unit_price: roundMoney(lineTotal / Number(line.quantity)) };
  });
  const productTotal = roundMoney(items.reduce((sum, line) => sum + Number(line.line_total), 0));
  return {
    ...quote,
    items,
    productTotal,
    discountUnlocked: true,
    discountAmount: roundMoney(Number(quote.subtotalBeforeDiscount) - productTotal),
    promotion: { ...base, eligible: true, applied: true }
  };
}
