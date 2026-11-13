import { isInternalCronAuthorized } from '../../lib/cron-auth.mjs';
import { processOrderConfirmationEmails } from '../../lib/order-confirmation-email.mjs';

// Recovery worker. The payment webhook never waits on this email provider.
// Protected by the same private CRON_SECRET as the checkout health checks.
export default async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('X-Robots-Tag','noindex, nofollow');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='GET')return res.status(405).json({error:'method_not_allowed'});
  if(String(process.env.CRON_SECRET||'').length<20)
    return res.status(503).json({error:'cron_not_configured'});
  if(!isInternalCronAuthorized(req))
    return res.status(401).json({error:'unauthorized'});
  try{
    const result=await processOrderConfirmationEmails({limit:5});
    if(!result.configured)return res.status(503).json({error:'email_delivery_not_enabled'});
    return res.status(200).json({
      processed:result.processed,sent:result.sent,retry:result.retry
    });
  }catch(error){
    console.error('center-email cron_unavailable',error?.name||'request_error');
    return res.status(503).json({error:'temporarily_unavailable'});
  }
}
