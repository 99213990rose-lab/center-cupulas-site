// Transactional receipts for paid orders. All credentials stay on the server.
// The database outbox and the provider idempotency key prevent ordinary duplicate sends.
const ORG = 'e3cb8002-ebaa-4d3a-acd3-46a678815e7b';
const SITE = 'https://www.centercupulas.com.br';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const emailPattern = /^[^\s@<>]{1,90}@[^\s@<>]{1,90}\.[^\s@<>]{2,30}$/;
const safeText = (value, max = 180) => String(value ?? '').trim().slice(0, max);
const escapeHtml = value => safeText(value, 600).replace(/[&<>"']/g, char =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const money = value => Number.isFinite(Number(value)) ?
  Number(value).toLocaleString('pt-BR', {style:'currency',currency:'BRL'}) : 'valor informado no pedido';

export function buildOrderConfirmationEmail(order) {
  const shipping = order?.shipping && typeof order.shipping === 'object' ? order.shipping : {};
  const metadata = order?.metadata && typeof order.metadata === 'object' ? order.metadata : {};
  const raw = Array.isArray(metadata.line_items) ? metadata.line_items.slice(0, 30) : [];
  const code = /^[A-Za-z0-9-]{4,85}$/.test(String(order?.code || ''))
    ? order.code : 'pedido confirmado';
  const name = safeText(order?.customer_name, 70).split(/\s+/)[0] || 'cliente';
  const items = raw.map(item => {
    const q = Math.max(1, Math.min(999, Math.floor(Number(item?.quantity) || 1)));
    const description = safeText(item?.description || item?.format || 'Cúpula', 120);
    const material = safeText(item?.material, 50);
    const color = safeText(item?.color, 50);
    return q + 'x ' + description + [material,color].filter(Boolean).map(x=>' / '+x).join('');
  });
  const carrier = safeText(shipping.carrier, 80);
  const tracking = SITE + '/meus-pedidos.html';
  const lines = [
    'Olá, ' + name + '!',
    '',
    'Seu pagamento foi aprovado e seu pedido na Center Cúpulas foi registrado.',
    'Pedido: ' + code,
    'Valor pago: ' + money(order.total),
    ...(items.length ? ['', 'Produtos:', ...items] : []),
    '',
    'Próxima etapa: conferência técnica e fabricação da cúpula.',
    'O prazo de fabricação será confirmado pela nossa equipe.',
    ...(carrier ? ['Transportadora escolhida: ' + carrier + '.'] : []),
    'O prazo informado pela transportadora começa após a postagem, não inclui fabricação.',
    '',
    'Acompanhe em Meus Pedidos: ' + tracking,
    'Para consultar seu pedido, entre com o mesmo e-mail utilizado na compra.',
    '',
    'Obrigado por comprar na Center Cúpulas!'
  ];
  return {
    subject: 'Pedido ' + code + ' confirmado | Center Cúpulas',
    text: lines.join('\n'),
    html: '<!doctype html><html lang="pt-BR"><body style="margin:0;padding:30px 15px;background:#f8f5f0;color:#2b211e;font:16px/1.6 Arial,sans-serif">'+
      '<main style="max-width:600px;margin:auto;padding:28px;background:white;border-radius:12px">'+
      '<h1 style="font-size:24px;margin:0 0 14px">Pagamento confirmado!</h1>'+
      '<p>Olá, '+escapeHtml(name)+'!</p>'+
      '<p>Recebemos seu pagamento e seu pedido foi registrado.</p>'+
      '<p><strong>Pedido:</strong> '+escapeHtml(code)+'<br><strong>Total pago:</strong> '+escapeHtml(money(order.total))+'</p>'+
      (items.length ? '<h2 style="font-size:18px">Produtos</h2><ul>'+items.map(x=>'<li>'+escapeHtml(x)+'</li>').join('')+'</ul>':'')+
      '<p><strong>Próxima etapa:</strong> conferência técnica e fabricação. Nossa equipe confirmará o prazo de produção.</p>'+
      (carrier ? '<p><strong>Transportadora escolhida:</strong> '+escapeHtml(carrier)+'</p>':'')+
      '<p>O prazo informado pela transportadora começa após a postagem e não inclui a fabricação.</p>'+
      '<p><a href="'+tracking+'" style="display:inline-block;padding:12px 18px;background:#302019;color:white;border-radius:6px;text-decoration:none">Acompanhar pedido</a></p>'+
      '<p style="font-size:14px;color:#685a53">Acesse com o mesmo e-mail utilizado na compra. Não compartilhe seu código de acesso.</p>'+
      '<p>Center Cúpulas</p></main></body></html>'
  };
}
function authHeaders(key) {
  return {
    apikey:key, 'Content-Type':'application/json',
    ...(!key.startsWith('sb_secret_') ? {Authorization:'Bearer '+key} : {})
  };
}
async function databaseRequest(base, headers, table, params, options = {}) {
  const endpoint = base.replace(/\/$/,'') + '/rest/v1/' + table + '?' + new URLSearchParams(params);
  const response = await fetch(endpoint, {
    ...options, headers:{...headers,...(options.headers || {})},
    signal:AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error('database_unavailable');
  if (response.status === 204) return [];
  const data=await response.json();
  if (!Array.isArray(data)) throw new Error('database_invalid_response');
  return data;
}
function environment() {
  const base=process.env.SUPABASE_URL;
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  const token=process.env.RESEND_API_KEY;
  const from=process.env.CENTER_ORDER_EMAIL_FROM;
  if (!base || !key || !token || !from || /[\r\n]/.test(from) || !from.includes('@'))
    return null;
  return {base,key,token,from,headers:authHeaders(key)};
}
async function patchOutbox(cfg, orderId, status, payload) {
  return databaseRequest(cfg.base,cfg.headers,'center_order_email_outbox',
    {order_id:'eq.'+orderId,status:'eq.'+status,select:'order_id,status,attempts'},
    {method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(payload)});
}
async function sendOne(cfg,row) {
  const now=new Date().toISOString();
  const attempts=(Number(row.attempts)||0)+1;
  const claimed=await patchOutbox(cfg,row.order_id,row.status,
    {status:'sending',attempts,updated_at:now,last_error_code:null});
  if (claimed.length!==1) return 'claimed_elsewhere';
  let state='retry', lastError='delivery_unavailable',providerId=null;
  try {
    const orders=await databaseRequest(cfg.base,cfg.headers,'orders',{
      id:'eq.'+row.order_id,organization_id:'eq.'+ORG,payment_status:'eq.paid',
      select:'id,code,total,customer_name,shipping,metadata',limit:'1'
    });
    const order=orders[0];
    const recipient=safeText(order?.shipping?.customer_email,180).toLowerCase();
    if (!order || !emailPattern.test(recipient)) {
      state='skipped';lastError='recipient_unavailable';
    } else {
      const payload=buildOrderConfirmationEmail(order);
      const response=await fetch('https://api.resend.com/emails',{
        method:'POST',
        headers:{Authorization:'Bearer '+cfg.token,'Content-Type':'application/json',
          'Idempotency-Key':'center-paid-order-'+row.order_id},
        body:JSON.stringify({from:cfg.from,to:[recipient],...payload}),
        signal:AbortSignal.timeout(7000)
      });
      if(response.ok){
        const data=await response.json();
        state='sent';lastError=null;providerId=safeText(data.id,120)||null;
      } else {
        // Never log email addresses, provider error bodies, or API keys.
        lastError='provider_http_'+response.status;
      }
    }
  }catch{
    lastError='network_or_database_failure';
  }
  if(state==='retry' && attempts>=8) state='skipped';
  const changed=await patchOutbox(cfg,row.order_id,'sending',{
    status:state,updated_at:new Date().toISOString(),last_error_code:lastError,
    ...(state==='sent'?{sent_at:new Date().toISOString(),provider_message_id:providerId}:{})
  });
  if(changed.length!==1) throw new Error('notification_state_changed');
  return state;
}

// Called by the verified Mercado Pago webhook immediately, and by a secured daily
// Vercel Cron as recovery. Never called by client-side code.
export async function processOrderConfirmationEmails({quoteId=null,limit=5}={}) {
  const cfg=environment();
  if(!cfg)return {configured:false,processed:0};
  let orderId=null;
  if(quoteId!==null){
    if(!UUID.test(String(quoteId)))return {configured:true,processed:0};
    const orders=await databaseRequest(cfg.base,cfg.headers,'orders',{
      quote_id:'eq.'+quoteId,organization_id:'eq.'+ORG,select:'id',limit:'1'
    });
    if(!orders.length)return {configured:true,processed:0};
    orderId=orders[0].id;
  }
  // Recover interrupted attempts without concurrent double claims.
  const cutoff=new Date(Date.now()-20*60*1000).toISOString();
  await databaseRequest(cfg.base,cfg.headers,'center_order_email_outbox',{
    status:'eq.sending',updated_at:'lt.'+cutoff,
    ...(orderId?{order_id:'eq.'+orderId}:{})
  },{method:'PATCH',headers:{Prefer:'return=representation'},
     body:JSON.stringify({status:'retry',updated_at:new Date().toISOString()})});
  const rows=await databaseRequest(cfg.base,cfg.headers,'center_order_email_outbox',{
    select:'order_id,status,attempts',status:'in.(pending,retry)',
    ...(orderId?{order_id:'eq.'+orderId}:{}),
    order:'created_at.asc',limit:String(Math.max(1,Math.min(10,limit)))
  });
  const results=[];
  for(const row of rows) {
    if(!UUID.test(String(row.order_id)))continue;
    try { results.push(await sendOne(cfg,row)); }
    catch { results.push('failed'); }
  }
  return {configured:true,processed:results.length,sent:results.filter(x=>x==='sent').length,
    retry:results.filter(x=>x==='retry'||x==='failed').length};
}
