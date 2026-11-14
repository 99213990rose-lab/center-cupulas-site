// Vercel Cron fallback for transient WhatsApp failures. Protected with CRON_SECRET.
import {notifyCenterPaidSale,saleAlertIsConfigured} from '../mercadopago/sale-alert.js';
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET') return res.status(405).json({error:'method_not_allowed'});
  if(!process.env.CRON_SECRET||req.headers.authorization!=='Bearer '+process.env.CRON_SECRET)
    return res.status(401).json({error:'unauthorized'});
  if(!saleAlertIsConfigured()) return res.status(200).json({status:'not_configured'});
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  const base=String(process.env.SUPABASE_URL).replace(/\/$/,'');
  const headers={apikey:key};
  if(!key.startsWith('sb_secret_'))headers.Authorization='Bearer '+key;
  const query=new URLSearchParams({
    select:'order_id',status:'in.(pending,retry)',order:'created_at.asc',limit:'10'
  });
  try{
    const pending=await fetch(base+'/rest/v1/center_sale_whatsapp_outbox?'+query,{
      headers,signal:AbortSignal.timeout(4000)
    });
    if(!pending.ok) throw new Error('pending_list_'+pending.status);
    const orders=await pending.json();
    let sent=0,skipped=0,failed=0;
    for(const order of orders){
      try{
        const result=await notifyCenterPaidSale(order.order_id);
        if(result.status==='sent')sent++;
        else skipped++;
      }catch(error){
        failed++;
        console.error('center-sale retry failed',error?.message||'error');
      }
    }
    return res.status(200).json({processed:orders.length,sent,skipped,failed});
  }catch(error){
    console.error('center-sale cron failure',error?.message||'error');
    return res.status(503).json({error:'alert_queue_unavailable'});
  }
}
