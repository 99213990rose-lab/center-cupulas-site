// Private, read-only daily health check for Center Cúpulas production orders.
// Vercel Cron sends Authorization: Bearer $CRON_SECRET.
// All cross-table counting runs inside Postgres, with no customer data exported.
import { timingSafeEqual } from 'node:crypto';

const COUNT_KEYS = Object.freeze([
  'paid_quotes_without_orders',
  'paid_checkout_orders_without_jobs',
  'applied_payments_without_paid_order',
  'duplicate_approved_charges',
  'pending_email_notifications',
  'stale_email_notifications',
  'pending_emails_never_attempted'
]);

const reply = (res, code, data) => res.status(code)
  .setHeader('Cache-Control', 'private, no-store')
  .setHeader('X-Robots-Tag', 'noindex, nofollow')
  .setHeader('X-Content-Type-Options', 'nosniff')
  .json(data);

function authorized(req) {
  const secret = String(process.env.CRON_SECRET || '');
  const provided = String(req.headers?.authorization || '');
  const expected = 'Bearer ' + secret;
  return secret.length >= 20 &&
    Buffer.byteLength(provided) === Buffer.byteLength(expected) &&
    timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return reply(res, 405, { error: 'method_not_allowed' });
  if (String(process.env.CRON_SECRET || '').length < 20)
    return reply(res, 503, { error: 'audit_not_configured' });
  if (!authorized(req)) return reply(res, 401, { error: 'unauthorized' });

  const base = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '');
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(base) || !key)
    return reply(res, 503, { error: 'database_not_configured' });

  const headers = { apikey: key, 'Content-Type': 'application/json' };
  if (!key.startsWith('sb_secret_')) headers.Authorization = 'Bearer ' + key;
  try {
    const upstream = await fetch(base + '/rest/v1/rpc/center_checkout_integrity_snapshot', {
      method: 'POST',
      headers,
      body: '{}',
      signal: AbortSignal.timeout(9000)
    });
    if (!upstream.ok) throw Error('snapshot_request_failed');
    const counts = await upstream.json();
    if (!counts || typeof counts !== 'object' || Array.isArray(counts) ||
      !COUNT_KEYS.every(k => Number.isSafeInteger(counts[k]) && counts[k] >= 0)) {
      throw Error('snapshot_invalid');
    }

    const critical = counts.paid_quotes_without_orders > 0 ||
      counts.paid_checkout_orders_without_jobs > 0 ||
      counts.applied_payments_without_paid_order > 0 ||
      counts.duplicate_approved_charges > 0;
    const attention = counts.pending_email_notifications > 0;
    if (critical) console.error('center-checkout-audit reconciliation_problem', counts);
    else if (attention) console.warn('center-checkout-audit email_delivery_pending', counts);

    return reply(res, critical ? 503 : 200, {
      ok: !critical,
      status: critical ? 'critical' : attention ? 'attention' : 'healthy',
      ...counts
    });
  } catch (error) {
    console.error('center-checkout-audit dependency_unavailable', error?.name || 'request_error');
    return reply(res, 503, { ok: false, status: 'unavailable' });
  }
}
