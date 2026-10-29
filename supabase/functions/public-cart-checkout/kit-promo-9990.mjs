// A promoção é um produto indivisível: um kit contém duas cúpulas.
// O valor final é calculado pelo servidor, nunca confiado ao navegador.
import { roundMoney } from './price-with-box.mjs';
export const KIT_PAIR_PRICE = 99.90;
const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();

export const isKitProduct = line => line && line.kind === 'promo_kit' &&
  ['conica','conica_redonda'].includes(String(line.format)) &&
  normalize(line.material) === 'algodao' && normalize(line.color) === 'bege' &&
  Number(line.top) === 12 && Number(line.bottom) === 20 && Number(line.height) === 20 &&
  !String(line.observations||'').trim() && !String(line.reference||'').trim();

export const validateKitRequest = line => isKitProduct(line) &&
  Number.isSafeInteger(Number(line.quantity)) &&
  Number(line.quantity) >= 2 && Number(line.quantity) <= 500 &&
  Number(line.quantity) % 2 === 0;

export function applyKitPrice(quote) {
  if (!quote || quote.status !== 'ok') return quote;
  const promotion = {type:'kit_2_99_90',active:true,applied:false,pair_price:KIT_PAIR_PRICE};
  let kitCount = 0;
  const items = quote.items.map(line => {
    if (line.kind !== 'promo_kit') return {...line};
    if (!validateKitRequest(line)) throw new Error('invalid_kit_quantity');
    const count = Number(line.quantity) / 2;
    const total = roundMoney(count * KIT_PAIR_PRICE);
    kitCount += count;
    return {...line,kit_quantity:count,kit_price:KIT_PAIR_PRICE,
      line_list_total:total,line_total:total,
      // Internamente unit_price representa peça física (logística e relatórios).
      // Na interface do consumidor só mostramos o total e preço por kit.
      unit_list_price:roundMoney(total/Number(line.quantity)),
      unit_price:roundMoney(total/Number(line.quantity))};
  });
  if (!kitCount) return {...quote,promotion};

  const subtotalBeforeDiscount = roundMoney(items.reduce((sum,line)=>sum+Number(line.line_list_total),0));
  const productTotal = roundMoney(items.reduce((sum,line)=>sum+Number(line.line_total),0));
  return {...quote,items,subtotalBeforeDiscount,productTotal,
    discountAmount:roundMoney(Math.max(0,subtotalBeforeDiscount-productTotal)),
    discountUnlocked:subtotalBeforeDiscount>productTotal,
    promotion:{...promotion,applied:true,kits:kitCount}};
}
