// RASCUNHO: liberar apenas depois de validar o custo atual de fabricação.
import { roundMoney } from "./price-with-box.mjs";
export const KIT_BEGIN_MS=Date.parse("2026-10-29T00:00:00-03:00");
export const KIT_END_MS=Date.parse("2026-11-01T00:00:00-03:00");
const normalized=value=>String(value??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
const match=line=>line && line.format==="conica" && Number(line.top)===27 && Number(line.bottom)===35 && Number(line.height)===26 && normalized(line.material)==="algodao" && normalized(line.color)==="branco" && String(line.reference)==="33";
export function applyFixedPriceKit(quote,at=Date.now()){
 if(!quote||quote.status!=="ok")return quote;
 const active=Number(at)>=KIT_BEGIN_MS&&Number(at)<KIT_END_MS;
 const base={type:"kit_2_for_120",active,applied:false,eligible:false,kit_price:120};
 if(!active)return {...quote,promotion:base};
 const items=quote.items.map(line=>({...line,line_total:Number(line.line_list_total),unit_price:roundMoney(Number(line.line_list_total)/Number(line.quantity))}));
 let kits=0,matched=false;
 for(const line of items){
   if(!match(line)||!Number.isInteger(Number(line.quantity))||Number(line.quantity)<2)continue;
   matched=true;
   const qty=Number(line.quantity),pairs=Math.floor(qty/2),remaining=qty%2;
   const regularUnit=Number(line.line_list_total)/qty;
   const proposed=roundMoney(pairs*120+remaining*regularUnit);
   if(proposed>=Number(line.line_list_total))continue;
   line.line_total=proposed;
   line.unit_price=roundMoney(proposed/qty);
   kits+=pairs;
 }
 if(!kits)return {...quote,promotion:{...base,eligible:matched,reason:"regular_price_not_higher"}};
 const total=roundMoney(items.reduce((sum,line)=>sum+Number(line.line_total),0));
 const discount=roundMoney(Number(quote.subtotalBeforeDiscount)-total);
 if(discount<=Number(quote.discountAmount||0))return {...quote,promotion:{...base,eligible:true,reason:"volume_discount_more_advantageous"}};
 return {...quote,items,productTotal:total,discountUnlocked:true,discountAmount:discount,promotion:{...base,eligible:true,applied:true,kits}};
}
