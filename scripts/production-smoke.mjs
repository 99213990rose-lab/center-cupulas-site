// Production smoke checks are deliberately read-only. They never submit a
// cart, create a Mercado Pago preference, look up a buyer or mutate an order.
// Safe to run from GitHub Actions without any credentials or private data.
const DEFAULT_BASE = 'https://www.centercupulas.com.br';
const MAX_PARALLEL = 3;
const CHECKS = Object.freeze([
  {path:'/', kind:'html', expected:200},
  {path:'/carrinho.html', kind:'html', expected:200},
  {path:'/meus-pedidos.html', kind:'html', expected:200},
  {path:'/api/mercadopago/status', kind:'payment_status', expected:200},
  {path:'/api/internal/checkout-audit', kind:'blocked', expected:401},
  {path:'/api/internal/provider-audit', kind:'blocked', expected:401},
  {path:'/api/internal/order-email-cron', kind:'blocked', expected:401},
  {path:'/api/mercadopago/status?diagnose=connection', kind:'blocked', expected:401},
  {path:'/api/operations/record-tracking?operation=operations_health', kind:'blocked', expected:401},
  {path:'/api/mercadopago/create-checkout', kind:'method', expected:405},
  {path:'/api/mercadopago/webhook', kind:'method', expected:405},
  {path:'/api/mercadopago/order-status', kind:'method', expected:405}
]);

function validBase(raw){
  const candidate=new URL(raw);
  if(candidate.protocol!=='https:'||
    !['www.centercupulas.com.br','centercupulas.com.br'].includes(candidate.hostname)||
    candidate.username||candidate.password||candidate.search||candidate.hash||
    candidate.pathname!=='/'||candidate.port)
    throw Error('production_smoke_invalid_target');
  return candidate.origin;
}

async function checkOne(base, spec, request, timeoutMs){
  const target=new URL(spec.path,base);
  const response=await request(target.toString(),{
    method:'GET',
    headers:{accept:spec.kind==='html'?'text/html':'application/json'},
    cache:'no-store',
    redirect:'follow',
    signal:AbortSignal.timeout(timeoutMs)
  });
  if(response.status!==spec.expected)
    throw Error(`expected HTTP ${spec.expected}; got ${response.status}`);
  const type=String(response.headers.get('content-type')||'').toLowerCase();
  if(spec.kind==='html'){
    if(!type.includes('text/html'))throw Error('unexpected html content-type');
    // Limit reads: a misconfigured proxy must not use unbounded RAM.
    if(Number(response.headers.get('content-length')||'0')>3_000_000)
      throw Error('oversize html response');
    const html=(await response.text()).slice(0,3_000_000);
    if(!/<!doctype html>/i.test(html)||!/<html[\s>]/i.test(html)||
      !/center c[úu]pulas/i.test(html))
      throw Error('unexpected page contents');
  }else if(spec.kind==='payment_status'){
    if(!type.includes('application/json'))throw Error('unexpected json content-type');
    const data=await response.json();
    if(data?.checkout_enabled!==true||data?.pickup_enabled!==false||
       data?.flow!=='mercadopago')
      throw Error('public checkout not ready');
    const serialized=JSON.stringify(data);
    if(/access_token|service_role_key|webhook_secret|password/i.test(serialized))
      throw Error('secret-like field exposed');
  }else if(spec.kind==='blocked'){
    if(!type.includes('application/json'))throw Error('unexpected blocked response');
    const body=await response.json();
    if(body?.error!=='unauthorized' && body?.error!=='login_required')
      throw Error('private endpoint does not return a safe auth rejection');
  }else if(spec.kind==='method'){
    if(!type.includes('application/json'))throw Error('unexpected method response');
    const body=await response.json();
    if(body?.error!=='method_not_allowed')
      throw Error('endpoint method guard missing');
  }
  return {path:spec.path,status:response.status};
}

export async function runProductionSmoke({
  baseUrl=DEFAULT_BASE,
  request=fetch,
  timeoutMs=12000,
  checks=CHECKS
}={}){
  const base=validBase(baseUrl);
  if(!Array.isArray(checks)||!checks.length||checks.length>30)
    throw Error('invalid_smoke_checks');
  const outcomes=[];
  for(let i=0;i<checks.length;i+=MAX_PARALLEL){
    const batch=checks.slice(i,i+MAX_PARALLEL);
    const results=await Promise.all(batch.map(async spec=>{
      try{return {ok:true,...await checkOne(base,spec,request,timeoutMs)}}
      catch(error){
        return {ok:false,path:spec.path,error:(
          error?.name==='TimeoutError'?'deadline_exceeded':
          String(error?.message||'probe_failed').slice(0,120)
        )};
      }
    }));
    outcomes.push(...results);
  }
  return {ok:outcomes.every(x=>x.ok),checked:outcomes.length,outcomes};
}

if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
  try{
    const report=await runProductionSmoke();
    for(const x of report.outcomes){
      const summary=x.ok?'HTTP '+x.status:x.error;
      process.stdout.write((x.ok?'PASS ':'FAIL ')+x.path+' — '+summary+'\n');
    }
    process.stdout.write(`Production checks passed: ${report.outcomes.filter(x=>x.ok).length}/${report.checked}\n`);
    if(!report.ok)process.exitCode=1;
  }catch(error){
    console.error('Production smoke failed:',error?.message||'unknown');
    process.exitCode=1;
  }
}
