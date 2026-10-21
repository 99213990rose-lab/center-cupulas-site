// Customer-only purchase history. A verified Supabase identity is required.
// Orders are selected by an immutable checkout email snapshot, never mutable CRM data.
const ORG = 'e3cb8002-ebaa-4d3a-acd3-46a678815e7b';
const UUID = /^[0-9a-f-]{36}$/i;
const respond = (res,status,payload) => res.status(status)
  .setHeader('Cache-Control','private, no-store')
  .setHeader('X-Content-Type-Options','nosniff').json(payload);
const str = (x,max=160) => String(x||'').slice(0,max);
const price = (v) => Number.isFinite(Number(v)) ? Math.round(Number(v)*100)/100 : 0;
const allow = (o,k) => o && typeof o === 'object' ? o[k] : null;

export default async function handler(req,res) {
  if(req.method!=='GET') return respond(res,405,{error:'method_not_allowed'});
  const supabase = String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const publishable = process.env.SUPABASE_PUBLISHABLE_KEY;
  if(!supabase||!secret||!publishable) return respond(res,503,{error:'temporarily_unavailable'});
  const header = String(req.headers?.authorization||'');
  const token = /^Bearer ([A-Za-z0-9._-]{30,5000})$/.exec(header)?.[1];
  if(!token) return respond(res,401,{error:'login_required'});
  try {
    // Validate the access token against Supabase Auth, never trust client-supplied email.
    const auth = await fetch(supabase+'/auth/v1/user',{
      headers: { apikey:publishable, Authorization:'Bearer '+token },
      signal:AbortSignal.timeout(7000)
    });
    if(!auth.ok) return respond(res,401,{error:'session_expired'});
    const user = await auth.json();
    const email = typeof user?.email==='string' ? user.email.trim().toLowerCase() : '';
    if(!UUID.test(String(user?.id||''))||!email||!user.email_confirmed_at)
      return respond(res,403,{error:'verified_email_required'});
    const headers={apikey:secret};
    if(!secret.startsWith('sb_secret_'))headers.Authorization='Bearer '+secret;
    const query = new URLSearchParams({
      select:'id,code,status,total,payment_status,created_at,shipping,metadata',
      organization_id:'eq.'+ORG,
      payment_status:'eq.paid',
      'shipping->>customer_email':'eq.'+email,
      order:'created_at.desc',limit:'50'
    });
    const response = await fetch(supabase+'/rest/v1/orders?'+query,{
      headers,signal:AbortSignal.timeout(9000)
    });
    if(!response.ok) throw Error('orders_unavailable');
    const records = await response.json();
    if(!Array.isArray(records)) throw Error('unexpected_orders');
    let jobs=[];
    const ids=records.map(row=>String(row.id||'')).filter(id=>UUID.test(id));
    if(ids.length){
      const jq=new URLSearchParams({
        select:'order_id,status,updated_at',
        organization_id:'eq.'+ORG,
        order_id:'in.('+ids.join(',')+')',
        order:'updated_at.desc',
        limit:'100'
      });
      const p=await fetch(supabase+'/rest/v1/production_jobs?'+jq,{
        headers,signal:AbortSignal.timeout(9000)
      });
      if(p.ok){const data=await p.json();if(Array.isArray(data))jobs=data;}
    }
    const jobMap=new Map();
    for(const job of jobs) if(!jobMap.has(job.order_id))jobMap.set(job.order_id,str(job.status,60));
    const orders=records.map(row=>{
      const ship=row.shipping&&typeof row.shipping==='object'?row.shipping:{};
      const meta=row.metadata&&typeof row.metadata==='object'?row.metadata:{};
      const rawItems=Array.isArray(meta.line_items)?meta.line_items:[];
      return {
        code:str(row.code,85),date:str(row.created_at,45),
        status:str(row.status,45),payment_status:'paid',total:price(row.total),
        production_status:jobMap.get(row.id)||null,
        shipping:{
          fulfillment:ship.fulfillment==='pickup'?'pickup':'delivery',
          freight:price(ship.freight),
          carrier:str(ship.carrier,80),service:str(ship.service,80),
          tracking_code:str(ship.tracking_code,110),
          delivery_days:Number.isFinite(Number(ship.delivery_days))?Number(ship.delivery_days):null,
          address:allow(ship,'address')?{
            street:str(ship.address.street,160),number:str(ship.address.number,35),
            neighborhood:str(ship.address.neighborhood,100),
            city:str(ship.address.city,100),state:str(ship.address.state,3),
            cep:str(ship.address.cep,10)
          }:null,
          pickup_location:ship.fulfillment==='pickup' ? {
            street:'Rua Cachoeira Buriti',number:'44',neighborhood:'Itaquera',
            city:'São Paulo',state:'SP'
          }:null
        },
        items:rawItems.slice(0,25).map(item=>({
          description:str(item.description||item.format,170),
          material:str(item.material,70),color:str(item.color,70),
          quantity:Math.max(1,Math.min(500,Math.trunc(Number(item.quantity)||1))),
          unit_price:price(item.unit_price),line_total:price(item.line_total),
          dimensions:item.dimensions&&typeof item.dimensions==='object'?{
            top:price(item.dimensions.top),bottom:price(item.dimensions.bottom),
            height:price(item.dimensions.height)
          }:null
        }))
      };
    });
    return respond(res,200,{orders});
  }catch{
    return respond(res,503,{error:'temporarily_unavailable'});
  }
}
