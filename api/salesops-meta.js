// Only authenticated requests are forwarded to allowlisted Supabase management functions.
// Never surface upstream raw error bodies or exception text to the browser.
const BASE = 'https://nygjkojgvbdhemvfsqug.supabase.co/functions/v1/';
const ACTIONS = Object.freeze({
  start: 'meta-oauth-start',
  activate: 'center-meta-account-activate',
  appWebhooks: 'meta-app-webhooks'
});
const fail = (res, status, code) => res.status(status).json({ error: code });
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return fail(res, 405, 'method_not_allowed');
  }

  const auth = String(req.headers?.authorization || '').trim();
  if (!/^Bearer [A-Za-z0-9._~-]{20,4096}$/.test(auth)) return fail(res, 401, 'unauthorized');
  const action = String(req.query?.action || '');
  const fn = ACTIONS[action];
  if (!fn) return fail(res, 400, 'invalid_action');

  let payload;
  try {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body))
      return fail(res, 400, 'invalid_body');
    payload = JSON.stringify(req.body);
    if (Buffer.byteLength(payload) > 16384) return fail(res, 413, 'payload_too_large');
  } catch {
    return fail(res, 400, 'invalid_body');
  }

  try {
    const upstream = await fetch(BASE + fn, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: payload,
      signal: AbortSignal.timeout(12000)
    });
    // Do not return raw third-party validation payloads; they sometimes contain
    // access tokens, personal details or diagnostic stack traces.
    if (!upstream.ok) {
      console.warn('center-salesops upstream_rejected', action, upstream.status);
      return fail(res, upstream.status === 401 || upstream.status === 403 ? upstream.status
        : upstream.status === 429 ? 429 : 502,
        upstream.status === 401 || upstream.status === 403 ? 'unauthorized'
        : upstream.status === 429 ? 'too_many_requests' : 'upstream_rejected');
    }
    const body = await upstream.text();
    if (Buffer.byteLength(body) > 65536) throw Error('upstream_response_too_large');
    let data;
    try { data = JSON.parse(body); } catch { throw Error('invalid_json'); }
    return res.status(200).json(data);
  } catch (error) {
    console.error('center-salesops upstream_unavailable', action, error?.name || 'request_error');
    return fail(res, 502, 'upstream_unavailable');
  }
};
