// Server-only WhatsApp sale alerts. No token or phone number is sent to the browser.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function headers(){
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  const h={apikey:key,'Content-Type':'application/json'};
  if(!key.startsWith('sb_secret_')) h.Authorization='Bearer '+key;
  return h;
}
function config(){
  if(process.env.CENTER_SALE_ALERT_ENABLED!=='true') return null;
  const recipient=String(process.env.CENTER_SALE_ALERT_RECIPIENT||'').replace(/\D/g,'');
  const phoneId=String(process.env.META_WA_PHONE_NUMBER_ID||'');
  const token=process.env.META_WA_ACCESS_TOKEN;
  const template=String(process.env.CENTER_SALE_ALERT_TEMPLATE||'');
  const version=String(process.env.META_GRAPH_API_VERSION||'v25.0');
  const base=String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
  if(!/^55\d{10,11}$/.test(recipient) || !/^\d+$/.test(phoneId)
     || !/^[a-z0-9_]{1,128}$/.test(template) || !/^v\d+\.\d+$/.test(version)
     || !token || !base.startsWith('https://') || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return {recipient,phoneId,token,template,version,base};
}
function idFromMeta(json){return json?.messages?.[0]?.id||null}
async function updateStatus(c,orderId,status,providerId=null,errorCode=null){
  const res=await fetch(c.base+'/rest/v1/center_sale_whatsapp_outbox?order_id=eq.'+orderId+'&status=eq.sending',{
    method:'PATCH',headers:{...headers(),Prefer:'return=minimal'},
    body:JSON.stringify({status,provider_message_id:providerId,last_error_code:errorCode,
      updated_at:new Date().toISOString(),...(status==='sent'?{sent_at:new Date().toISOString()}:{})}),
    signal:AbortSignal.timeout(4000)
  });
  if(!res.ok) throw new Error('alert_status_update_'+res.status);
}
export function saleAlertIsConfigured(){return !!config()}
export async function notifyCenterPaidSale(orderId){
  const c=config();
  if(!c) return {status:'disabled'};
  if(!UUID.test(String(orderId||''))) return {status:'invalid_order'};
  const claim=await fetch(c.base+'/rest/v1/rpc/claim_center_sale_whatsapp_alert',{
    method:'POST',headers:headers(),body:JSON.stringify({p_order_id:orderId}),
    signal:AbortSignal.timeout(4000)
  });
  if(!claim.ok) throw new Error('alert_claim_'+claim.status);
  const order=await claim.json();
  if(!order) return {status:'already_claimed'};
  const amount=Number(order.amount);
  if(!Number.isFinite(amount)||amount<=0) {
    await updateStatus(c,orderId,'needs_review',null,'invalid_amount');
    return {status:'needs_review'};
  }
  const body={
    messaging_product:'whatsapp',to:c.recipient,type:'template',
    template:{
      name:c.template,language:{code:'pt_BR'},
      components:[{type:'body',parameters:[
        {type:'text',text:String(order.code||'').slice(0,100)},
        {type:'text',text:new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(amount)},
        {type:'text',text:String(Math.max(0,Number(order.quantity)||0))}
      ]}]
    }
  };
  let result,send;
  try {
    send=await fetch('https://graph.facebook.com/'+c.version+'/'+c.phoneId+'/messages',{
      method:'POST',headers:{Authorization:'Bearer '+c.token,'Content-Type':'application/json'},
      body:JSON.stringify(body),signal:AbortSignal.timeout(6000)
    });
    result=await send.json().catch(()=>({}));
  } catch(err) {
    // Network timeout is ambiguous: Meta may have accepted the message.
    // Never auto-retry an unknown outcome (prevents duplicate owner alerts).
    await updateStatus(c,orderId,'needs_review',null,'unknown_provider_outcome');
    return {status:'needs_review'};
  }
  if(!send.ok) {
    const code='meta_'+String(result?.error?.code||send.status).replace(/[^0-9]/g,'').slice(0,10);
    await updateStatus(c,orderId,'retry',null,code);
    return {status:'retry'};
  }
  const messageId=idFromMeta(result);
  if(!messageId) {
    await updateStatus(c,orderId,'needs_review',null,'missing_message_id');
    return {status:'needs_review'};
  }
  await updateStatus(c,orderId,'sent',String(messageId).slice(0,240));
  return {status:'sent'};
}
