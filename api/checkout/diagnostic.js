import pkg from '../../lib/center-packaging.cjs';

const { estimateCenterPackaging } = pkg;
const UPSTREAM='https://nygjkojgvbdhemvfsqug.supabase.co/functions/v1/public-cart-checkout';

export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  if (req.method!=='GET') return res.status(405).json({error:'method_not_allowed'});
  // Diagnóstico pontual, sem dados pessoais ou credenciais, exclusivo da prévia.
  const host=String(req.headers['x-forwarded-host'] || req.headers.host || '').toLowerCase();
  if (!/^center-cupulas-site-[a-z0-9-]+\.vercel\.app$/.test(host))
    return res.status(403).json({error:'preview_only'});
  const item={id:'diagnostic',format:'conica',format_label:'Cônica',material:'Juta',
    color:'Juta natural',top:20,bottom:20,height:20,quantity:20};
  let packaging;
  try{
    packaging=estimateCenterPackaging([item]);
  }catch(e){
    return res.status(200).json({stage:'packaging',error:String(e?.message||'unknown')});
  }
  try{
    const response=await fetch(UPSTREAM,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'preview',items:[item]}),
      signal:AbortSignal.timeout(12000)
    });
    const data=await response.json().catch(()=>({}));
    return res.status(200).json({
      stage:'server_quote',upstream_status:response.status,
      upstream_error:data?.error||null,upstream_type:data?.status||null,
      product_total:response.ok?data?.product_total:null,
      packaging_status:packaging.status,
      packaging_count:packaging.package_count,
      packaging_fee:packaging.packaging_fee,
      no_payment:true
    });
  }catch(e){
    return res.status(200).json({stage:'fetch',error:String(e?.name||'unknown')});
  }
}
