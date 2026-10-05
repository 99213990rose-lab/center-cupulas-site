module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const auth = String(req.headers.authorization || '').trim();
  if (!auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const action = String(req.query.action || '');
  const allowed = {
    start: 'meta-oauth-start',
    activate: 'center-meta-account-activate',
    appWebhooks: 'meta-app-webhooks'
  };
  const fn = allowed[action];
  if (!fn) return res.status(400).json({ error: 'invalid_action' });

  try {
    const upstream = await fetch(
      'https://nygjkojgvbdhemvfsqug.supabase.co/functions/v1/' + fn,
      {
        method: 'POST',
        headers: {
          Authorization: auth,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(req.body || {}),
        signal: AbortSignal.timeout(12000)
      }
    );

    const text = await upstream.text();
    res.setHeader('Cache-Control', 'no-store');
    res.status(upstream.status);

    try {
      return res.json(JSON.parse(text || '{}'));
    } catch {
      return res.json({ error: 'invalid_upstream_response', detail: text.slice(0, 500) });
    }
  } catch (error) {
    return res.status(502).json({
      error: 'upstream_unavailable',
      detail: error && error.message ? error.message : 'Falha ao conectar ao backend'
    });
  }
};
