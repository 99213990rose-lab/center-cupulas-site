// Shared, auditable proof verification. Price previews remain public;
// only payment-quote preparation requires a server-issued, one-time proof.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function checkoutPayloadDigest(rawBody) {
  if(typeof rawBody!=='string' || !rawBody.length || rawBody.length>64000)
    throw Error('invalid_checkout_payload_length');
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(rawBody));
  return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
}

export async function verifyCheckoutAttestation({rawBody,token,consume}) {
  if(typeof token!=='string'||!UUID.test(token)||typeof consume!=='function')
    return false;
  let digest;
  try{digest=await checkoutPayloadDigest(rawBody);}
  catch{return false;}
  try{return await consume(token,digest)===true;}
  catch{return false;}
}
