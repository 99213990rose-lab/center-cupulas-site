
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { calculateBoxPurchaseBudget, estimateBoxCostForItem } from "./box-costs.mjs";
import { addBoxesToPrices } from "./price-with-box.mjs";

const ORG_ID = "e3cb8002-ebaa-4d3a-acd3-46a678815e7b";
const ALLOWED_ORIGINS = new Set([
  "https://www.centercupulas.com.br",
  "https://centercupulas.com.br",
  "https://center-cupulas-site.vercel.app",
  "https://center-cupulas-site-ri-cos.vercel.app",
  "https://center-cupulas-site-git-main-ri-cos.vercel.app"
]);

type Rules = {
  factory_update_pct: number | string;
  owner_margin_pct: number | string;
  site_cost_pct: number | string;
  square_oval_pct: number | string;
  large_pct: number | string;
  large_threshold_cm: number | string;
  premium_material_pct: number | string;
  discount_threshold: number | string;
  discount_pct: number | string;
  engine_version: string;
};
type PackagingRules = {
  max_nested_per_package:number|string;
  side_padding_cm:number|string;
  height_padding_cm:number|string;
  nested_height_increment_cm:number|string;
  max_package_dimension_cm:number|string;
  rule_version:string;
  box_small_cost_brl:number|string;
  box_medium_cost_brl:number|string;
  box_large_cost_brl:number|string;
  box_small_product_max_cm:number|string;
  box_medium_product_max_cm:number|string;
};
type RefPrice = { code:string; top_cm:number|string; bottom_cm:number|string; height_cm:number|string; historical_price:number|string };
type Validation = { format:string; top_cm:number|string; bottom_cm:number|string; height_cm:number|string; material:string; quantity:number; actual_factory_price:number|string|null };
type Item = { id?:string; format:string; format_label?:string; material:string; color?:string; top:number; bottom:number; height:number; quantity:number; reference?:string|null; observations?:string };

let cache: { refs: RefPrice[]; rules: Rules; validations: Validation[]; packaging: PackagingRules; expires: number } | null = null;
const n=(v:unknown)=>Number(v||0);
const pct=(v:unknown)=>1+n(v)/100;
const round2=(v:number)=>Math.round((v+Number.EPSILON)*100)/100;
const roundDim=(v:number)=>Math.ceil(v);

function cors(origin:string|null){
  const allowed=origin&&(ALLOWED_ORIGINS.has(origin)||origin.startsWith("http://localhost:"));
  return {
    "Access-Control-Allow-Origin":allowed?origin!:"https://www.centercupulas.com.br",
    "Access-Control-Allow-Headers":"content-type, apikey, authorization, x-client-info",
    "Access-Control-Allow-Methods":"POST, OPTIONS",
    "Vary":"Origin",
    "Content-Type":"application/json; charset=utf-8",
    "Cache-Control":"no-store"
  };
}
function json(body:unknown,status:number,origin:string|null){return new Response(JSON.stringify(body),{status,headers:cors(origin)})}
function mapFormat(format:string){
  if(["conica","bell","conica_redonda"].includes(format))return "conica_redonda";
  if(["drum","cilindrica_redonda"].includes(format))return "cilindrica_redonda";
  if(format==="oval")return "oval";
  if(["piramidal-quadrada","cubo","quadrada"].includes(format))return "quadrada";
  return null;
}
function mapMaterial(material:string){
  const k=String(material||"").toLowerCase();
  if(k==="juta")return "juta";
  if(k==="linho")return "linho";
  return "tecido_comum";
}
function distance(a:any,b:any){
  let sum=0;
  for(const k of ["top_cm","bottom_cm","height_cm"]){
    const x=n(a[k]),y=n(b[k]),scale=Math.max(10,y),d=(x-y)/scale;sum+=d*d;
  }
  return Math.sqrt(sum);
}
function shapeSizePct(r:Rules,format:string,top:number,bottom:number,height:number){
  let p=["quadrada","oval"].includes(format)?n(r.square_oval_pct):0;
  if(Math.max(top,bottom,height)>n(r.large_threshold_cm))p+=n(r.large_pct);
  return p;
}
function normalizeValidation(v:Validation,r:Rules){
  if(!v.actual_factory_price)return null;
  let price=n(v.actual_factory_price);
  const s=shapeSizePct(r,v.format,n(v.top_cm),n(v.bottom_cm),n(v.height_cm));
  if(s)price/=pct(s);
  if(["linho","juta"].includes(v.material))price/=pct(r.premium_material_pct);
  return price;
}
async function loadData(){
  if(cache&&cache.expires>Date.now())return cache;
  const sb=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const [a,b,c,d]=await Promise.all([
    sb.from("pricing_reference_prices").select("code,top_cm,bottom_cm,height_cm,historical_price").eq("organization_id",ORG_ID).order("code"),
    sb.from("pricing_rules").select("*").eq("organization_id",ORG_ID).single(),
    sb.from("pricing_validations").select("format,top_cm,bottom_cm,height_cm,material,quantity,actual_factory_price").eq("organization_id",ORG_ID),
    sb.from("packaging_rules").select("*").eq("organization_id",ORG_ID).single()
  ]);
  if(a.error||b.error||c.error||d.error||!b.data||!d.data)throw new Error(a.error?.message||b.error?.message||c.error?.message||d.error?.message||"pricing unavailable");
  cache={
    refs:(a.data||[]) as RefPrice[],
    rules:b.data as Rules,
    validations:(c.data||[]) as Validation[],
    packaging:d.data as PackagingRules,
    expires:Date.now()+300000
  };
  return cache;
}
function estimateBase(refs:RefPrice[],vals:Validation[],r:Rules,top:number,bottom:number,height:number){
  const q={top_cm:top,bottom_cm:bottom,height_cm:height};
  let anchors:any[]=refs.map(x=>({top_cm:n(x.top_cm),bottom_cm:n(x.bottom_cm),height_cm:n(x.height_cm),price:n(x.historical_price)*pct(r.factory_update_pct)}));
  for(const v of vals){const price=normalizeValidation(v,r);if(price)anchors.push({top_cm:n(v.top_cm),bottom_cm:n(v.bottom_cm),height_cm:n(v.height_cm),price})}
  anchors=anchors.map(a=>({...a,d:distance(a,q)})).sort((a,b)=>a.d-b.d);
  const exact=anchors.find(a=>a.d<0.000001);
  if(exact)return {price:exact.price,confidence:"high",exact:true};
  const near=anchors.slice(0,5);let num=0,den=0;
  for(const a of near){const w=1/(Math.pow(a.d,2)+0.0025);num+=a.price*w;den+=w}
  const price=num/den,d0=near[0]?.d??1,prices=near.map(x=>x.price),spread=Math.max(...prices)-Math.min(...prices),ratio=price?spread/price:1;
  const confidence=d0<=0.10&&ratio<=0.35?"high":d0<=0.28&&ratio<=0.65?"medium":"low";
  return {price,confidence,exact:false};
}
function priceItem(item:Item,data:{refs:RefPrice[];rules:Rules;validations:Validation[]}){
  const top=Number(item.top),bottom=Number(item.bottom),height=Number(item.height),quantity=Math.max(1,Math.floor(Number(item.quantity||1)));
  const format=mapFormat(item.format),material=mapMaterial(item.material);
  if(!format)throw new Error("unsupported_format");
  if(![top,bottom,height].every(v=>Number.isFinite(v)&&v>=1&&v<=150))throw new Error("invalid_dimensions");
  if(!Number.isFinite(quantity)||quantity<1||quantity>500)throw new Error("invalid_quantity");
  const base=estimateBase(data.refs,data.validations,data.rules,top,bottom,height);
  if(base.confidence==="low")throw new Error("low_confidence");
  const formatPct=shapeSizePct(data.rules,format,top,bottom,height);
  const materialPct=["linho","juta"].includes(material)?n(data.rules.premium_material_pct):0;
  const factory=base.price*pct(formatPct)*pct(materialPct);
  const commercialBase=factory*pct(data.rules.owner_margin_pct)*pct(data.rules.site_cost_pct);
  const discountPct=n(data.rules.discount_pct);
  const listUnit=discountPct<100?commercialBase/(1-discountPct/100):commercialBase;
  return {
    id:item.id||crypto.randomUUID(),
    format:item.format,
    format_label:String(item.format_label||item.format).slice(0,100),
    material:String(item.material||"").slice(0,60),
    color:String(item.color||"").slice(0,60),
    top,bottom,height,quantity,
    reference:item.reference?String(item.reference).slice(0,30):null,
    observations:String(item.observations||"").slice(0,500),
    confidence:base.confidence,
    exact_reference:base.exact,
    unit_list_price:round2(listUnit),
    line_list_total:round2(listUnit*quantity)
  };
}
function estimatePackaging(items:any[],r:PackagingRules){
  const side=n(r.side_padding_cm),heightPadding=n(r.height_padding_cm),nestedInc=n(r.nested_height_increment_cm);
  const maxNested=Math.max(1,Math.floor(n(r.max_nested_per_package)||1));
  const maxDim=n(r.max_package_dimension_cm)||100;
  const packages:any[]=[];
  let manualReview=false;

  for(const item of items){
    if(item.format==="oval"){manualReview=true;continue}
    const base=Math.max(n(item.top),n(item.bottom));
    const isNestable=["conica","bell","piramidal-quadrada"].includes(item.format);
    let remaining=Math.max(1,Math.floor(n(item.quantity)));
    while(remaining>0){
      let units=Math.min(maxNested,remaining);
      const unitHeight=n(item.height);
      if(!isNestable){
        const fit=Math.max(1,Math.floor((maxDim-heightPadding)/Math.max(1,unitHeight)));
        units=Math.min(units,fit);
      }
      const width=roundDim(base+side);
      const length=roundDim(base+side);
      const height=roundDim(
        isNestable ? unitHeight+heightPadding+Math.max(0,units-1)*nestedInc
        : unitHeight*units+heightPadding
      );
      const requiresManual=Math.max(width,length,height)>maxDim;
      if(requiresManual)manualReview=true;
      packages.push({
        item_id:item.id,format:item.format,units,
        dimensions_cm:{width,length,height},
        stacking:isNestable?"nested":"stacked",
        requires_manual_review:requiresManual
      });
      remaining-=units;
    }
  }
  return {
    status:manualReview?"review":"estimated",
    rule_version:r.rule_version,
    package_count:packages.length,
    packages,
    note:"Prévia logística para planejamento. A embalagem física não é padronizada por este sistema."
  };
}
function sanitizeText(v:unknown,max:number){return String(v||"").trim().replace(/[<>]/g,"").slice(0,max)}
function normalizePhone(v:unknown){return String(v||"").replace(/\D/g,"").slice(0,15)}

Deno.serve(async(req:Request)=>{
  const origin=req.headers.get("origin");
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(origin)});
  if(req.method!=="POST")return json({error:"method_not_allowed"},405,origin);
  if(origin&&!ALLOWED_ORIGINS.has(origin)&&!origin.startsWith("http://localhost:"))return json({error:"origin_not_allowed"},403,origin);

  try{
    const body=await req.json();
    const action=body.action==="payment"?"payment":body.action==="submit"?"submit":"preview";
    const items=Array.isArray(body.items)?body.items:[];
    if(!items.length||items.length>20)return json({error:"invalid_cart"},400,origin);

    const data=await loadData();
    const priced=items.map((x:Item)=>priceItem(x,data));
    // Cost of purchasing the planned boxes is already inside the product lines.
    // The manufacturing discount never discounts that embedded cost.
    const lineBoxes=priced.map(x=>estimateBoxCostForItem(x,data.packaging));
    const threshold=n(data.rules.discount_threshold),discountPct=n(data.rules.discount_pct);
    const pricedQuote=addBoxesToPrices(priced,lineBoxes,threshold,discountPct);
    if(pricedQuote.status!=="ok"){
      return json({error:"packaging_cost_needs_review",requires_review:true},422,origin);
    }
    const pricedFinal=pricedQuote.items;
    const manufacturerSubtotal=pricedQuote.manufacturerSubtotal;
    const subtotalBefore=pricedQuote.subtotalBeforeDiscount;
    const productTotal=pricedQuote.productTotal;
    const unlocked=pricedQuote.discountUnlocked;
    const packaging=estimatePackaging(pricedFinal,data.packaging);
    const boxBudget=calculateBoxPurchaseBudget(packaging,pricedFinal,data.packaging);
    const expectedBoxCost=pricedQuote.totalBoxCost;
    if(boxBudget.status!=="estimate" || Math.abs(n(boxBudget.total_cost_brl)-expectedBoxCost)>0.001){
      return json({error:"packaging_cost_needs_review",requires_review:true},422,origin);
    }

    const preview={
      status:"ok",
      calibration:false,
      engine_version:data.rules.engine_version,
      items:pricedFinal,
      subtotal_before_discount:subtotalBefore,
      product_total:productTotal,
      freight:null,
      total:productTotal,
      packaging,
      discount:{
        unlocked,
        percent:discountPct,
        threshold:round2(threshold),
        amount:pricedQuote.discountAmount,
        amount_to_unlock:round2(Math.max(0,threshold-manufacturerSubtotal))
      },
      note:"Os valores das cúpulas já incluem os custos previstos das caixas. O frete é confirmado separadamente."
    };
    if(action==="preview")return json(preview,200,origin);

    const customer=body.customer||{};
    const name=sanitizeText(customer.name,120);
    const phone=normalizePhone(customer.phone);
    const email=sanitizeText(customer.email,180).toLowerCase();
    const cep=normalizePhone(customer.cep).slice(0,8);
    const street=sanitizeText(customer.street,160);
    const number=sanitizeText(customer.number,30);
    const complement=sanitizeText(customer.complement,120);
    const neighborhood=sanitizeText(customer.neighborhood,100);
    const city=sanitizeText(customer.city,100);
    const state=sanitizeText(customer.state,2).toUpperCase();
    const notes=sanitizeText(customer.notes,600);

    if(name.length<2||phone.length<10)return json({error:"customer_required"},400,origin);
    // No address is needed when the customer collects the order at the factory.
    const pickup=body.shippingSelection?.code==="STORE_PICKUP";
    if(!pickup && (!/^\d{8}$/.test(cep)||!street||!number||!neighborhood||!city||state.length!==2)){
      return json({error:"shipping_address_required"},400,origin);
    }

    const shippingAddress=pickup?null:{cep,street,number,complement:complement||null,neighborhood,city,state,country:"BR"};
    const pickupLocation=pickup?{street:"Rua Cachoeira Buriti",number:"44",neighborhood:"Itaquera",city:"São Paulo",state:"SP",country:"BR",scheduling:"after_purchase"}:null;

    const requestedShipping=body.shippingSelection||null;
    let verifiedFreight:any=null;
    let freightProviderStatus="pending_quote";
    if(pickup){
      // A collection order never calls Frenet and never adds shipment charges.
      verifiedFreight={code:"STORE_PICKUP",price:0,carrier:"Retirada no local",carrier_code:null,service:"Retirada no local",delivery_days:null};
      freightProviderStatus="pickup";
    }else{
    try{
      const freightResponse=await fetch("https://www.centercupulas.com.br/api/frete",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          recipientCep:cep,
          shipmentValue:productTotal,
          packages:packaging.packages
        })
      });
      if(freightResponse.ok){
        const freightData=await freightResponse.json();
        // A real charge requires shipping boxes and carrier rules to be
        // calibrated by the factory. Manual quote requests remain unaffected.
        if(action==="payment" && freightData.calibration!==false) {
          return json({error:"shipping_not_validated",requires_review:true},422,origin);
        }
        const options=Array.isArray(freightData.options)?freightData.options:[];
        if(options.length){
          // A manual request must never require selecting an unapproved tariff.
          // Payment requests are checked again below and always need approval.
          if(action==="submit" && freightData.calibration!==false){
            freightProviderStatus="needs_review";
          } else {
          freightProviderStatus="available";
          if(!requestedShipping?.code){
            return json({error:"shipping_service_required",shipping_options:options},400,origin);
          }
          verifiedFreight=options.find((option:any)=>String(option.code)===String(requestedShipping.code))||null;
          if(!verifiedFreight){
            return json({error:"shipping_service_invalid",shipping_options:options},400,origin);
          }
          freightProviderStatus="quoted";
          }
        }
      }else if(freightResponse.status!==503){
        freightProviderStatus="provider_error";
      }else{
        freightProviderStatus="provider_not_configured";
      }
    }catch{
      freightProviderStatus="provider_unavailable";
    }
    }

    // A paid checkout must never create a payable quote without validated freight and packaging.
    // Keep the original manual quote workflow unchanged for action="submit".
    if(action==="payment" && (packaging.status!=="estimated" || !verifiedFreight || (!pickup && freightProviderStatus!=="quoted") || !Number.isFinite(n(verifiedFreight.price)) || n(verifiedFreight.price)<0)){
      return json({error:"payment_shipping_unavailable",requires_review:true},422,origin);
    }
    const freightValue=verifiedFreight?round2(n(verifiedFreight.price)):0;
    const finalTotal=round2(productTotal+freightValue);

    const sb=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    let leadId:string|null=null;
    const existing=await sb.from("crm_leads").select("id,metadata").eq("organization_id",ORG_ID).eq("phone",phone).order("updated_at",{ascending:false}).limit(1).maybeSingle();
    const leadMetadata={checkout_address:shippingAddress,checkout_packaging:packaging};
    if(existing.data?.id){
      leadId=existing.data.id;
      await sb.from("crm_leads").update({
        display_name:name,email:email||null,last_seen_at:new Date().toISOString(),updated_at:new Date().toISOString(),
        source_detail:"site_cart_checkout",
        metadata:{...(existing.data.metadata||{}),...leadMetadata}
      }).eq("id",leadId);
    }else{
      const inserted=await sb.from("crm_leads").insert({
        organization_id:ORG_ID,source_channel:"website",source_detail:"site_cart_checkout",
        external_id:"checkout-"+crypto.randomUUID(),display_name:name,email:email||null,phone,status:"qualified",score:70,
        metadata:leadMetadata
      }).select("id").single();
      if(inserted.error)throw new Error(inserted.error.message);
      leadId=inserted.data.id;
    }

    const code="WEB-"+new Date().toISOString().slice(2,10).replace(/-/g,"")+"-"+crypto.randomUUID().slice(0,6).toUpperCase();
    const lineItems=pricedFinal.map(x=>({
      description:(x.format_label||x.format)+" "+x.top+"×"+x.bottom+"×"+x.height+" cm",
      format:x.format,material:x.material,color:x.color,reference:x.reference,
      dimensions:{top:x.top,bottom:x.bottom,height:x.height},
      quantity:x.quantity,unit_price:x.unit_price,line_total:x.line_total,
      confidence:x.confidence,exact_reference:x.exact_reference,observations:x.observations
    }));
    const shipping={
      status:pickup?"pickup":verifiedFreight?"quoted":"pending_quote",
      fulfillment:pickup?"pickup":"delivery",
      provider:pickup?"Retirada no local":verifiedFreight?"Frenet":null,
      provider_status:freightProviderStatus,
      address:shippingAddress,
      pickup_location:pickupLocation,
      packaging,
      freight:verifiedFreight?freightValue:null,
      carrier:pickup?null:verifiedFreight?verifiedFreight.carrier:null,
      carrier_code:pickup?null:verifiedFreight?verifiedFreight.carrier_code:null,
      service:pickup?"Retirada no local":verifiedFreight?verifiedFreight.service:null,
      service_code:verifiedFreight?verifiedFreight.code:null,
      delivery_days:pickup?null:verifiedFreight?verifiedFreight.delivery_days:null,
      weight_basis:pickup?null:verifiedFreight?"peso_volumetrico_conservador":null
    };
    // Procurement costs are internal: they are NOT added to the client's total
    // and NEVER substituted for a carrier's freight tariff.
    const insertedQuote=await sb.from("quotes").insert({
      organization_id:ORG_ID,lead_id:leadId,code,status:"draft",line_items:lineItems,
      subtotal:productTotal,freight:freightValue,total:finalTotal,currency:"BRL",
      customer_name:name,customer_phone:phone,shipping:{...shipping,box_purchase_budget:{...boxBudget,included_in_products:true}},
      notes:[
        "Checkout do site — preços calculados pelo motor comercial.",
        pickup?"Retirada na Rua Cachoeira Buriti, 44, Itaquera, São Paulo/SP. Frete R$ 0,00. Agendar após confirmação do pagamento.":
          verifiedFreight?("Frete: "+verifiedFreight.carrier+" / "+verifiedFreight.service+" — R$ "+freightValue.toFixed(2)):"Frete ainda não calculado.",
        "Prévia de embalagem: "+packaging.package_count+" volume(s).",
        "Custo previsto das caixas já embutido nos preços das cúpulas; não acrescentar novamente.",
        boxBudget.status==="estimate"
          ?("Custo interno estimado das caixas: R$ "+boxBudget.total_cost_brl.toFixed(2)+" ("+
            boxBudget.counts.pequena+" pequena(s), "+boxBudget.counts.media+" média(s), "+
            boxBudget.counts.grande+" grande(s)).")
          :"Custo interno de caixas pendente de avaliação.",
        packaging.status==="review"?"Embalagem requer revisão manual.":null,
        unlocked?("Desconto de "+discountPct+"% aplicado por volume."):null,
        email?("E-mail: "+email):null,notes?("Cliente: "+notes):null
      ].filter(Boolean).join(" | ")
    }).select("id,code").single();
    if(insertedQuote.error)throw new Error(insertedQuote.error.message);

    return json({
      ...preview,
      freight:verifiedFreight?freightValue:null,
      total:finalTotal,
      submitted:true,
      quote_id:insertedQuote.data.id,
      quote_code:insertedQuote.data.code,
      shipping
    },200,origin);
  }catch(error){
    console.error("public-cart-checkout",error);
    const msg=String((error as Error)?.message||"");
    if(["unsupported_format","invalid_dimensions","invalid_quantity","low_confidence"].includes(msg)){
      return json({error:msg,requires_review:true},422,origin);
    }
    return json({error:"checkout_unavailable"},500,origin);
  }
});
