const crypto = require('crypto');

function clean(value, max = 180) {
  const text = String(value || '').trim();
  return text ? text.slice(0, max) : '';
}

function referrerAttribution(req) {
  const ref = clean(req.headers.referer || req.headers.referrer || '', 500);
  let host = '';
  try { host = new URL(ref).hostname.replace(/^www\./i, '').toLowerCase(); } catch {}
  if (!host) return { source: 'direct', medium: 'none', referrer_host: '' };
  if (/(^|\.)google\./.test(host)) return { source: 'google', medium: 'organic', referrer_host: host };
  if (host === 'bing.com' || host.endsWith('.bing.com')) return { source: 'bing', medium: 'organic', referrer_host: host };
  if (host === 'mail.google.com' || host === 'com.google.android.gm') return { source: 'gmail', medium: 'email', referrer_host: host };
  return { source: host, medium: 'referral', referrer_host: host };
}

module.exports = async function handler(req, res) {
  const fallback = referrerAttribution(req);
  const q = req.query || {};
  const hasGoogleClick = Boolean(q.gclid || q.gbraid || q.wbraid);
  const source = clean(q.utm_source, 120) || (hasGoogleClick ? 'google' : fallback.source);
  const medium = clean(q.utm_medium, 120) || (hasGoogleClick ? 'cpc' : fallback.medium);

  const payload = {
    event_id: 'cc-catalog-' + crypto.randomUUID().replace(/-/g, '').slice(0, 20),
    event_type: 'contact_click',
    page: '/catalogo',
    placement: 'catalog_download',
    source,
    medium,
    campaign: clean(q.utm_campaign, 180),
    content: clean(q.utm_content, 180),
    term: clean(q.utm_term, 180),
    referrer_host: fallback.referrer_host,
    landing_page: '/catalogo',
    occurred_at: new Date().toISOString(),
    metadata: {
      has_google_click_id: hasGoogleClick,
      has_meta_click_id: Boolean(q.fbclid),
      cta_text: 'Download do catálogo',
      page_title: 'Catálogo Center Cúpulas'
    }
  };

  try {
    await fetch('https://nygjkojgvbdhemvfsqug.supabase.co/functions/v1/center-web-event', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(900)
    });
  } catch {}

  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Location', '/catalogo.pdf');
  res.statusCode = 302;
  res.end();
};
