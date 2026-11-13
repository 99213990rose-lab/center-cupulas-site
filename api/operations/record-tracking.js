import handleFittings from '../../lib/production-fittings.mjs';

export const config = {maxDuration:30};

// Keep one serverless entrypoint for internal factory operations on Vercel Hobby.
// Existing shipment tracking requests still use the same URL unchanged.
// Owner-only operation to register carrier tracking after the parcel is shipped.
// Existing customer account pages already read orders.shipping.tracking_code.
// Never changes amounts, payment status, production specifications or customers.
const SITE = 'https://www.centercupulas.com.br';
const ORG = 'e3cb8002-ebaa-4d3a-acd3-46a678815e7b';
const ORDER = /^[A-Za-z0-9-]{4,85}$/;
const CODE = /^[A-Za-z0-9._/-]{5,80}$/;
const respond = (res, status, data) => res.status(status)
  .setHeader('Cache-Control', 'private, no-store')
  .setHeader('X-Content-Type-Options', 'nosniff')
  .setHeader('X-Robots-Tag', 'noindex, nofollow').json(data);

export default async function handler(req, res) {
  if (['production_fittings', 'operations_health'].includes(req.query?.operation))
    return handleFittings(req, res);
  if (req.method !== 'POST') return respond(res, 405, {error:'method_not_allowed'});
  if (![SITE,'https://centercupulas.com.br'].includes(req.headers?.origin))
    return respond(res,403,{error:'invalid_origin'});
  const base=String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
  const publishable=String(process.env.SUPABASE_PUBLISHABLE_KEY||'');
  const secret=String(process.env.SUPABASE_SERVICE_ROLE_KEY||'');
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(base) || !publishable || !secret)
    return respond(res,503,{error:'temporarily_unavailable'});
  const bearer=/^Bearer ([A-Za-z0-9._-]{30,5000})$/.exec(String(req.headers?.authorization||''))?.[1];
  if (!bearer) return respond(res,401,{error:'login_required'});

  const orderCode=String(req.body?.order_code||'').trim();
  const codes=Array.isArray(req.body?.tracking_codes) ? req.body.tracking_codes
    : req.body?.tracking_code ? [req.body.tracking_code] : [];
  if (!ORDER.test(orderCode) || codes.length<1 || codes.length>8 ||
    !codes.every(c=>typeof c==='string' && CODE.test(c)) ||
    new Set(codes).size!==codes.length)
    return respond(res,400,{error:'invalid_tracking_input'});

  try {
    // Check the session with Auth itself; a client-provided identity is never
    // accepted as proof of permission.
    const auth=await fetch(base+'/auth/v1/user',{
      headers:{apikey:publishable,Authorization:'Bearer '+bearer},
      signal:AbortSignal.timeout(7000)
    });
    if (!auth.ok) return respond(res,401,{error:'session_expired'});
    const user=await auth.json();
    if (!/^[a-f0-9-]{36}$/i.test(String(user?.id||'')) || !user?.email_confirmed_at)
      return respond(res,403,{error:'verified_login_required'});

    // Resolve organization membership under the caller's own JWT, never
    // a service-role identity.
    const roleReply=await fetch(base+'/rest/v1/rpc/wa_org_role',{
      method:'POST',
      headers:{apikey:publishable,Authorization:'Bearer '+bearer,
        'Content-Type':'application/json'},
      body:JSON.stringify({p_organization_id:ORG}),
      signal:AbortSignal.timeout(7000)
    });
    if (!roleReply.ok) return respond(res,503,{error:'access_check_unavailable'});
    const role=await roleReply.json();
    if (!['owner','admin'].includes(role)) return respond(res,403,{error:'owner_access_required'});

    const headers={apikey:secret,'Content-Type':'application/json'};
    if(!secret.startsWith('sb_secret_'))headers.Authorization='Bearer '+secret;
    const write=await fetch(base+'/rest/v1/rpc/center_record_order_tracking_once',{
      method:'POST',headers,
      body:JSON.stringify({
        p_order_code:orderCode,p_tracking_codes:codes,p_actor_id:user.id
      }),
      signal:AbortSignal.timeout(9000)
    });
    if (!write.ok) {
      let code='tracking_update_unavailable';
      try {
        const data=await write.json();
        // Only known safe SQL exceptions are mapped to public error codes.
        const msg=String(data?.message||'');
        if(msg.includes('tracking_already_registered'))code='tracking_already_registered';
        else if(msg.includes('paid_order_not_found'))code='paid_order_not_found';
        else if(msg.includes('invalid_tracking_input'))code='invalid_tracking_input';
      }catch{}
      return respond(res,code==='tracking_already_registered'?409:
        code==='paid_order_not_found'?404:code==='invalid_tracking_input'?400:503,{error:code});
    }
    const value=await write.json();
    if(value?.ok!==true||!Array.isArray(value.tracking_codes))throw Error('invalid_update_result');
    return respond(res,200,{ok:true,reused:value.reused===true,
      order_code:String(value.order_code||orderCode).slice(0,85),
      tracking_codes:value.tracking_codes.slice(0,8)});
  }catch(error){
    console.error('center-tracking update_failed',error?.name||'request_error');
    return respond(res,503,{error:'temporarily_unavailable'});
  }
}
