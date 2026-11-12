// Private, read-only daily health check for Center Cúpulas production orders.
// Invoked by Vercel Cron with Authorization: Bearer $CRON_SECRET.
import { timingSafeEqual } from 'node:crypto';

const ORG = 'e3cb8002-ebaa-4d3a-acd3-46a678815e7b';
const reply = (res, code, data) => res.status(code)
  .setHeader('Cache-Control', 'private, no-store')
  .setHeader('X-Robots-Tag', 'noindex, nofollow')
  .setHeader('X-Content-Type-Options', 'nosniff')
  .json(data);

function isAuthorized(req) {
  const secret = String(process.env.CRON_SECRET || '');
  const supplied = String(req.headers?.authorization || '');
  const expected = 'Bearer ' + secret;
  return secret.length >= 20 &&
    Buffer.byteLength(supplied) === Buffer.byteLength(expected) &&
    timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return reply(res, 405, { error: 'method_not_allowed' });
  if (!process.env.CRON_SECRET || String(process.env.CRON_SECRET).length < 20)
    return reply(res, 503, { error: 'audit_not_configured' });
  if (!isAuthorized(req)) return reply(res, 401, { error: 'unauthorized' });

  const base = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '');
  if (!base || !key) return reply(res, 503, { error: 'database_not_configured' });

  const headers = { apikey: key };
  if (!key.startsWith('sb_secret_')) headers.Authorization = 'Bearer ' + key;
  const deadline = AbortSignal.timeout(9000);

  async function rows(table, filters, select) {
    const params = new URLSearchParams({ ...filters, select, limit: '1000' });
    const response = await fetch(base + '/rest/v1/' + table + '?' + params, {
      headers, signal: deadline
    });
    if (!response.ok) throw Error('database_unavailable');
    const data = await response.json();
    if (!Array.isArray(data) || data.length >= 1000) throw Error('audit_incomplete');
    return data;
  }

  try {
    const [quotes, orders, jobs, emailQueue] = await Promise.all([
      rows('quotes', { organization_id: 'eq.' + ORG, status: 'eq.paid' }, 'id'),
      rows('orders', { organization_id: 'eq.' + ORG, payment_status: 'eq.paid' }, 'id,quote_id'),
      rows('production_jobs', { organization_id: 'eq.' + ORG }, 'order_id'),
      rows('center_order_email_outbox', { status: 'eq.pending' }, 'id')
    ]);
    const orderQuoteIds = new Set(orders.map(o => o.quote_id).filter(Boolean));
    const productionOrderIds = new Set(jobs.map(j => j.order_id).filter(Boolean));
    // Historical manually-entered orders need not have an online production job.
    const missingOrders = quotes.filter(q => !orderQuoteIds.has(q.id)).length;
    const missingJobs = orders.filter(o => o.quote_id && !productionOrderIds.has(o.id)).length;
    const pendingEmails = emailQueue.length;
    const counts = { paid_quotes_without_orders: missingOrders,
      paid_checkout_orders_without_jobs: missingJobs,
      pending_email_notifications: pendingEmails };
    const critical = missingOrders > 0 || missingJobs > 0;
    if (critical) console.error('center-checkout-audit reconciliation_problem', counts);
    else if (pendingEmails) console.warn('center-checkout-audit email_delivery_pending', counts);
    return reply(res, critical ? 503 : 200, {
      ok: !critical, status: critical ? 'critical' : pendingEmails ? 'attention' : 'healthy',
      ...counts
    });
  } catch (error) {
    console.error('center-checkout-audit dependency_unavailable', error?.name || 'request_error');
    return reply(res, 503, { ok: false, status: 'unavailable' });
  }
}
