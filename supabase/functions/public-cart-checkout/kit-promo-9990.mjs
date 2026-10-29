// Kit indivisível: duas cúpulas da mesma configuração por conjunto.
// O valor final e as variantes permitidas são validados no servidor.
import { roundMoney } from './price-with-box.mjs';
export const KIT_PAIR_PRICE = 99.90;
export const KIT_NATURAL_FABRIC_PRICE = 120.00;
const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const cottonColors = new Set(['bege','off-white','branco','preto','marrom']);
export const kitPriceFor = line => {
  const fabric = normalize(line?.material);
  if (fabric === 'algodao') return KIT_PAIR_PRICE;
  if (fabric === 'linho' || fabric === 'juta') return KIT_NATURAL_FABRIC_PRICE;
  return null;
};
export const isKitProduct = line => {
  if (!line || line.kind !== 'promo_kit') return false;
  if (!['conica','conica_redonda'].includes(String(line.format)) ||
      Number(line.top) !== 12 || Number(line.bottom) !== 20 || Number(line.height) !== 20 ||
      String(line.observations||'').trim() || String(line.reference||'').trim()) return false;
  const fabric = normalize(line.material), color = normalize(line.color);
  return (fabric === 'algodao' && cottonColors.has(color)) ||
    ((fabric === 'linho' || fabric === 'juta') && color === 'natural');
};
export const validateKitRequest = line => isKitProduct(line) &&
  Number.isSafeInteger(Number(line.quantity)) &&
  Number(line.quantity) >= 2 && Number(line.quantity) <= 500 &&
  Number(line.quantity) % 2 === 0;

export function applyKitPrice(quote) {
  if (!quote || quote.status !== 'ok') return quote;
  const promotion = {type:'kit_2_99_90',active:true,applied:false,from_price:KIT_PAIR_PRICE};
  let kits = 0;
  const items=quote.items.map(line => {
    if (line.kind !== 'promo_kit') return {...line};
    if (!validateKitRequest(line)) throw new Error('invalid_kit_quantity');
    const kitCount = Number(line.quantity)/2;
    const kitPrice = kitPriceFor(line);
    const total = roundMoney(kitCount*kitPrice);
    kits+=kitCount;
    return {...line,kit_quantity:kitCount,kit_price:kitPrice,
      line_list_total:total,line_total:total,
      // unit_price fica disponível apenas como contabilidade interna por peça física.
      // O consumidor verá somente preço por kit.
      unit_list_price:roundMoney(total/Number(line.quantity)),
      unit_price:roundMoney(total/Number(line.quantity))};
  });
  if (!kits) return {...quote,promotion};
  const subtotalBeforeDiscount=roundMoney(items.reduce((sum,line)=>sum+Number(line.line_list_total),0));
  const productTotal=roundMoney(items.reduce((sum,line)=>sum+Number(line.line_total),0));
  return {...quote,items,subtotalBeforeDiscount,productTotal,
    discountAmount:roundMoney(Math.max(0,subtotalBeforeDiscount-productTotal)),
    discountUnlocked:subtotalBeforeDiscount>productTotal,
    promotion:{...promotion,applied:true,kits}};
}
