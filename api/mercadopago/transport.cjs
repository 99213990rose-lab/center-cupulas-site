// Mercado Pago HTTPS fallback when Vercel's fetch/Undici cannot connect.
// Server-only CommonJS avoids the Vercel ESM loader issue encountered with .mjs.
const https = require('node:https');

function requestJson(url, options={}) {
  const target=new URL(url);
  if(target.origin!=='https://api.mercadopago.com')throw Error('provider_host_not_allowed');
  const body=typeof options.body==='string'?options.body:null;
  const headers={...(options.headers||{})};
  if(body&&!Object.keys(headers).some(k=>k.toLowerCase()==='content-length')){
    headers['Content-Length']=Buffer.byteLength(body);
  }
  return new Promise((resolve,reject)=>{
    const req=https.request(target,{
      method:options.method||'GET',
      headers,
      timeout:options.timeoutMs||6500
    },response=>{
      const chunks=[];
      let size=0;
      response.on('data',chunk=>{
        size+=chunk.length;
        if(size>262144){
          req.destroy(Error('provider_response_too_large'));
        } else chunks.push(chunk);
      });
      response.on('error',reject);
      response.on('end',()=>{
        const raw=Buffer.concat(chunks).toString('utf8');
        const status=response.statusCode||502;
        resolve({
          ok:status>=200&&status<300,
          status,
          json:async()=>JSON.parse(raw||'{}')
        });
      });
    });
    req.on('timeout',()=>req.destroy(Error('provider_https_timeout')));
    req.on('error',reject);
    if(body)req.write(body);
    req.end();
  });
}
module.exports={requestJson};
