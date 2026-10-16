import {createHmac,timingSafeEqual} from 'node:crypto';

// Private, read-only lookup for the buyer who initiated a Center checkout.
// Checkout proof stays in sessionStorage (never query string or referrer).
const ORG='e3cb8002-ebaa-4d3a-acd3-46a678815e7b';
const SITE='https://www.centercupulas.com.br';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const reply=(res,code,data)=>res.status(code).setHeader('Cache-Control','private, no-store').json(data);

export default async function handler(req,res) {
  if(req.method!=='POST')return reply(res,405,{error:'method_not_allowed'});
  if(![SITE,'https://centercupulas.com.br'].includes(req.headers?.origin))return reply(res,403,{error:'invalid_origin'});
  const secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url=String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
  if(!secret||!url)return reply(res,503,{error:'status_temporarily_unavailable'});
  const id=String(req.body?.reference||'');
  const proof=String(req.body?.proof||'');
  if(!UUID.test(id)||!/^[a-f0-9]{64}$/i.test(proof))return reply(res,400,{error:'invalid_receipt'});
  const expected=createHmac('sha256',secret).update('center-status-v1:'+id).digest();
  const provided=Buffer.from(proof,'hex');
  if(provided.length!==expected.length||!timingSafeEqual(provided,expected)){
    return reply(res,403,{error:'invalid_receipt'});
  }
  // Only send the service key from the server, never from the shopper's browser.
  const headers={apikey:secret};
  if(!secret.startsWith('sb_secret_'))headers.Authorization='Bearer '+secret;
  async function list(table,filters,columns){
    const query=new URLSearchParams({...filters,select:columns,limit:'1'});
    const response=await fetch(url+'/rest/v1/'+table+'?'+query.toString(),{
      headers,signal:AbortSignal.timeout(7000)
    });
    if(!response.ok)throw Error('read_failed');
    const data=await response.json();
    if(!Array.isArray(data))throw Error('invalid_read');
    return data[0]||null;
  }
  try{
    const quote=await list('quotes',{id:'eq.'+id,organization_id:'eq.'+ORG},'id,status,code');
    if(!quote)return reply(res,404,{error:'order_not_found'});
    if(quote.status!=='paid')return reply(res,200,{state:'pending',reference_code:quote.code});
    const order=await list('orders',{quote_id:'eq.'+id,organization_id:'eq.'+ORG},'id,payment_status,code');
    if(!order||order.payment_status!=='paid')return reply(res,200,{state:'processing',reference_code:quote.code});
    const job=await list('production_jobs',{order_id:'eq.'+order.id,organization_id:'eq.'+ORG},'id,status');
    if(!job)return reply(res,200,{state:'processing',reference_code:quote.code});
    return reply(res,200,{state:'confirmed',reference_code:quote.code,order_code:order.code,
      production_status:'registered'});
  }catch{
    return reply(res,503,{error:'status_temporarily_unavailable'});
  }
}
