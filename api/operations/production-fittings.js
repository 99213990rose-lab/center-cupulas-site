// Private factory workflow: inspect missing fittings and record a human-verified
// fitting per item without changing original orders, prices or payment status.
const ORG = 'e3cb8002-ebaa-4d3a-acd3-46a678815e7b';
const ALLOWED_ORIGINS = new Set([
  'https://www.centercupulas.com.br',
  'https://centercupulas.com.br'
]);
const ORDER_CODE = /^[A-Za-z0-9-]{4,85}$/;
const FITTINGS = new Set(['nacional','importado','colonial','lira','sem_encaixe']);
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const reply = (res, code, data) => res.status(code)
  .setHeader('Cache-Control','private, no-store')
  .setHeader('X-Robots-Tag','noindex, nofollow')
  .setHeader('X-Content-Type-Options','nosniff')
  .json(data);

function serviceHeaders(key) {
  return {
    apikey: key, 'Content-Type': 'application/json',
    ...(!key.startsWith('sb_secret_') ? {Authorization:'Bearer '+key} : {})
  };
}

async function requireOperator(req,base,publishable) {
  // Never accept a user ID, role or email supplied in request.body.
  const bearer = /^Bearer ([A-Za-z0-9._-]{30,5000})$/
    .exec(String(req.headers?.authorization || ''))?.[1];
  if (!bearer) return {error:'login_required',code:401};

  const auth = await fetch(base + '/auth/v1/user', {
    headers:{apikey:publishable,Authorization:'Bearer '+bearer},
    signal:AbortSignal.timeout(7000)
  });
  if (!auth.ok) return {error:'session_expired',code:401};
  const user = await auth.json();
  if (!UUID.test(String(user?.id||'')) || !user.email_confirmed_at)
    return {error:'verified_login_required',code:403};

  const role = await fetch(base+'/rest/v1/rpc/wa_org_role', {
    method:'POST',
    headers:{apikey:publishable,Authorization:'Bearer '+bearer,
      'Content-Type':'application/json'},
    body:JSON.stringify({p_organization_id:ORG}),
    signal:AbortSignal.timeout(7000)
  });
  if (!role.ok) return {error:'access_check_unavailable',code:503};
  if (!['owner','admin'].includes(await role.json()))
    return {error:'owner_access_required',code:403};
  return {userId:user.id};
}

export const config = {maxDuration:30};
export default async function handler(req,res) {
  if (!['GET','POST'].includes(req.method))
    return reply(res,405,{error:'method_not_allowed'});
  if (req.headers?.origin && !ALLOWED_ORIGINS.has(req.headers.origin))
    return reply(res,403,{error:'invalid_origin'});
  if (req.method==='POST' && !ALLOWED_ORIGINS.has(req.headers?.origin))
    return reply(res,403,{error:'invalid_origin'});

  const base=String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
  const publishable=String(process.env.SUPABASE_PUBLISHABLE_KEY||'');
  const secret=String(process.env.SUPABASE_SERVICE_ROLE_KEY||'');
  if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(base) || !publishable || !secret)
    return reply(res,503,{error:'temporarily_unavailable'});

  const code = String(req.body?.order_code||'').trim();
  const fittings = req.body?.fittings;
  if (req.method==='POST' && (
    !ORDER_CODE.test(code) || !Array.isArray(fittings) ||
    fittings.length<1 || fittings.length>25 ||
    !fittings.every(f=>typeof f==='string' && FITTINGS.has(f))
  )) return reply(res,400,{error:'invalid_fitting_input'});

  try {
    const actor=await requireOperator(req,base,publishable);
    if (actor.error) return reply(res,actor.code,{error:actor.error});

    const endpoint=req.method==='GET'
      ?'center_pending_production_fitting_reviews'
      :'center_record_production_fittings_once';
    const body=req.method==='GET' ? {} : {
      p_order_code:code,
      p_fittings:fittings,
      p_actor_id:actor.userId
    };
    const response=await fetch(base+'/rest/v1/rpc/'+endpoint,{
      method:'POST',headers:serviceHeaders(secret),
      body:JSON.stringify(body),
      signal:AbortSignal.timeout(9000)
    });
    if(!response.ok) {
      if(req.method==='POST') {
        let message='';
        try {message=String((await response.json())?.message||'');}catch{}
        const mapping=[
          ['fittings_already_confirmed',409],
          ['existing_fitting_conflict',409],
          ['active_paid_job_not_found',404],
          ['fitting_quantity_mismatch',400],
          ['invalid_fitting_input',400],
          ['invalid_job_items',422],
          ['not_authorized',403]
        ];
        const match=mapping.find(([name])=>message.includes(name));
        if(match)return reply(res,match[1],{error:match[0]});
      }
      return reply(res,503,{error:'production_review_unavailable'});
    }

    const result=await response.json();
    if(req.method==='GET') {
      if(!Array.isArray(result) || result.length>40)throw Error('invalid_review_queue');
      return reply(res,200,{reviews:result,has_more:result.length===40});
    }
    if(result?.ok!==true || !Array.isArray(result.fittings) ||
       result.fittings.length!==fittings.length)throw Error('invalid_review_confirmation');
    return reply(res,200,{
      ok:true,reused:result.reused===true,
      order_code:String(result.order_code||code).slice(0,85),
      fittings:result.fittings
    });
  } catch(error) {
    console.error('center-production-review unavailable',error?.name||'request_error');
    return reply(res,503,{error:'temporarily_unavailable'});
  }
}
