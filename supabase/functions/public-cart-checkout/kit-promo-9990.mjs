// Kit anunciado por tempo indeterminado. O preço é sempre calculado pelo servidor.
import { roundMoney } from './price-with-box.mjs';
export const KIT_PAIR_PRICE = 99.90;
const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
export const isKitProduct = line => line &&
  ['conica','conica_redonda'].includes(String(line.format)) &&
  normalize(line.material) === 'algodao' && normalize(line.color) === 'bege' &&
  Number(line.top) === 12 && Number(line.bottom) === 20 && Number(line.height) === 20 &&
  !String(line.observations||'').trim();
// Recebe o retorno do calculador com embalagens, que são precificadas apenas uma vez.
// Ajusta o preço do kit inclusive quando o valor normal seria menor:
// não apresenta porcentagem falsa nem inventa 'economia' ao consumidor.
export function applyKitPrice(quote) {
  if (!quote || quote.status !== 'ok') return quote;
  const promotion = {type:'kit_2_99_90',active:true,applied:false,pair_price:KIT_PAIR_PRICE};
  let pairs = 0;
  const items = quote.items.map(line => {
    const quantity = Number(line.quantity);
    if (!isKitProduct(line) || !Number.isInteger(quantity) || quantity < 2) return {...line};
    const eligiblePairs = Math.floor(quantity / 2);
    const extraUnit = roundMoney(Number(line.line_list_total) / quantity);
    const total = roundMoney(eligiblePairs * KIT_PAIR_PRICE + (quantity % 2) * extraUnit);
    pairs += eligiblePairs;
    return {...line, line_list_total:total, line_total:total, unit_list_price:roundMoney(total/quantity), unit_price:roundMoney(total/quantity)};
  });
  if (pairs === 0) return {...quote,promotion};
  const before = roundMoney(items.reduce((sum,item) => sum + Number(item.line_list_total),0));
  const after = roundMoney(items.reduce((sum,item) => sum + Number(item.line_total),0));
  const discount = roundMoney(before-after);
  return {
    ...quote,items,subtotalBeforeDiscount:before,productTotal:after,
    discountAmount:Math.max(0,discount),discountUnlocked:discount>0,
    promotion:{...promotion,applied:true,pairs}
  };
}
