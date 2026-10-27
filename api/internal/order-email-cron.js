import { timingSafeEqual } from 'node:crypto';
import { processOrderConfirmationEmails } from '../../lib/order-confirmation-email.mjs';

// Only Vercel Cron (or an authorized operator with the secret) may retry receipts.
export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'method_not_allowed'});
  const secret=process.env.CRON_SECRET;
  const actual=String(req.headers?.authorization||'');
  const expected='Bearer '+secret;
  if(!secret||secret.length<16||Buffer.byteLength(actual)!==Buffer.byteLength(expected)||
     !timingSafeEqual(Buffer.from(actual),Buffer.from(expected)))
    return res.status(401).json({error:'unauthorized'});
  try{
    const result=await processOrderConfirmationEmails({limit:5});
    return res.status(result.configured?200:503).json(result.configured
      ?{processed:result.processed,sent:result.sent,retry:result.retry}
      :{error:'email_not_configured'});
  }catch{
    return res.status(503).json({error:'temporarily_unavailable'});
  }
}
