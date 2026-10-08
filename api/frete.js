import packagingLib from '../lib/center-packaging.cjs';
import freightGate from '../lib/center-shipping-gate.cjs';
const { estimateCenterPackaging } = packagingLib;
const { normalizeVerifiedPackages } = freightGate;
const QUOTE_URL='https://nygjkojgvbdhemvfsqug.supabase.co/functions/v1/public-cart-checkout';
const ORIGIN_CEP=String(process.env.CENTER_CUPULAS_ORIGIN_CEP || '08265220').replace(/\D/g,'');
const FRENET_TOKEN=process.env.FRENET_TOKEN || '';
const asCep = v => String(v || '').replace(/\D/g,'');
const round = x => Math.round((Number(x)+Number.EPSILON)*100)/100;

export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='POST')return res.status(405).json({error:'method_not_allowed'});
  if(Number(req.headers['content-length']||0)>40000)return res.status(413).json({error:'request_too_large'});

  const cep=asCep(req.body?.recipientCep);
  const items=req.body?.items;
  if(!/^\d{8}$/.test(cep))return res.status(400).json({error:'invalid_recipient_cep'});
  if(!/^\d{8}$/.test(ORIGIN_CEP))return res.status(503).json({error:'invalid_origin_cep'});
  if(!Array.isArray(items) || items.length<1 || items.length>20)return res.status(400).json({error:'invalid_cart'});
  // Nem dimensões, nem preços, nem peso podem ser injetados pelo navegador.
  // A tabela de embalagem da própria fábrica é a única fonte para o frete.
  let packaging;
  try{packaging=estimateCenterPackaging(items)}catch(error){
    return res.status(400).json({error:String(error?.message||'invalid_cart')});
  }
  const physical=normalizeVerifiedPackages(packaging);
  if(!physical.ready)return res.status(409).json({
    error:'freight_calibration_pending',
    reason:physical.reason,
    missing_box_id:physical.missing_box_id||null,
    provider:'Frenet',
    calibration:true,
    message:'Caixas ainda não tiveram medidas externas e pesos reais aferidos.'
  });

  if(!FRENET_TOKEN)return res.status(503).json({error:'frenet_not_configured',provider:'Frenet'});

  try{
    const qr=await fetch(QUOTE_URL,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'preview',items}),
      signal:AbortSignal.timeout(12000)
    });
    if(!qr.ok)return res.status(422).json({error:'product_pricing_review_required'});
    const quote=await qr.json();
    if(quote?.status!=='ok'||quote.calibration!==false || quote.pricing_approved!==true){
      return res.status(409).json({error:'product_pricing_not_approved'});
    }
    const subtotal=round(Number(quote.product_total)+Number(packaging.packaging_fee));
    if(!Number.isFinite(subtotal)||subtotal<=0||subtotal>500000){
      return res.status(502).json({error:'invalid_server_pricing'});
    }
    const payload={
      SellerCEP:ORIGIN_CEP,RecipientCEP:cep,
      ShipmentInvoiceValue:subtotal,RecipientCountry:'BR',
      ShippingServiceCode:null,Coupom:null,ShippingItemArray:physical.packages
    };
    const r=await fetch('https://api.frenet.com.br/shipping/quote',{
      method:'POST',headers:{accept:'application/json','content-type':'application/json',token:FRENET_TOKEN},
      body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)
    });
    const data=await r.json().catch(()=>({}));
    if(!r.ok)return res.status(502).json({error:'freight_provider_error',provider:'Frenet'});
    const services=Array.isArray(data.ShippingSevicesArray)?data.ShippingSevicesArray:
      Array.isArray(data.ShippingServicesArray)?data.ShippingServicesArray:[];
    const options=services.filter(s=>!s?.Error && Number.isFinite(Number(s?.ShippingPrice)) && Number(s.ShippingPrice)>=0 && String(s?.ServiceCode||'')).map(s=>({
      code:String(s.ServiceCode),
      carrier:String(s.Carrier||'').slice(0,100),
      service:String(s.ServiceDescription||'').slice(0,100),
      price:round(Number(s.ShippingPrice)),
      delivery_days:Math.max(0,Math.ceil(Number(s.DeliveryTime)||0)),
      allow_buy_label:Boolean(s.AllowBuyLabel)
    })).sort((a,b)=>a.price-b.price||a.delivery_days-b.delivery_days);
    return res.status(200).json({
      status:options.length?'ok':'no_options',
      provider:'Frenet',
      calibration:false,freight_basis:'measured_verified_packages',
      origin_cep:ORIGIN_CEP,recipient_cep:cep,
      package_count:physical.packages.length,options
    });
  }catch(error){
    console.error('Center freight failed:',error?.name||'unknown');
    return res.status(502).json({error:'freight_unavailable',provider:'Frenet'});
  }
}
