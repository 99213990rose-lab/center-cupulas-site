// Read-only reconciliation of the Center ledger with Mercado Pago.
// Vercel Cron only: never creates, captures, refunds or modifies a payment.
import mpTransport from '../mercadopago/transport.cjs';
import { isInternalCronAuthorized } from '../../lib/cron-auth.mjs';

const REF_PREFIX = 'CENTER_CUPULAS:';
const MAX_ROWS = 50;
const HOURS_24 = 24 * 60 * 60 * 1000;
const reply = (res, status, data) => res.status(status)
  .setHeader('Cache-Control', 'private, no-store')
  .setHeader('X-Robots-Tag', 'noindex, nofollow')
  .setHeader('X-Content-Type-Options', 'nosniff')
  .json(data);
const cleanToken = raw => String(raw || '').trim()
  .replace(/^['"]|['"]$/g, '').replace(/^Bearer\s+/i, '').replace(/[\r\n\t ]/g, '');

async function providerRead(url, token) {
  const opts = { method: 'GET', headers: { Authorization: 'Bearer ' + token } };
  try {
    return await fetch(url, { ...opts, signal: AbortSignal.timeout(7000) });
  } catch {
    // Use the existing HTTPS fallback for transient Undici connection errors.
    return mpTransport.requestJson(url, { ...opts, timeoutMs: 7000 });
  }
}

export const config = { maxDuration: 30 };
export default async function handler(req, res) {
  if (req.method !== 'GET') return reply(res, 405, { error: 'method_not_allowed' });
  if (String(process.env.CRON_SECRET || '').length < 20)
    return reply(res, 503, { error: 'audit_not_configured' });
  if (!isInternalCronAuthorized(req)) return reply(res, 401, { error: 'unauthorized' });

  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '');
  const base = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const token = cleanToken(process.env.MERCADO_PAGO_ACCESS_TOKEN);
  if (!key || !token || !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(base))
    return reply(res, 503, { ok: false, status: 'not_configured' });

  try {
    // Bounded 90-day window keeps daily checks fast even after years of sales.
    // The database integrity snapshot independently checks the entire ledger.
    const since = new Date(Date.now() - 90 * HOURS_24).toISOString();
    const query = new URLSearchParams({
      select: 'payment_id,quote_id,amount_cents,currency,reconciliation_status',
      confirmed_at: 'gte.' + since,
      order: 'confirmed_at.desc',
      limit: String(MAX_ROWS + 1)
    });
    const headers = { apikey: key };
    if (!key.startsWith('sb_secret_')) headers.Authorization = 'Bearer ' + key;
    const ledgerResponse = await fetch(base + '/rest/v1/center_checkout_payments?' + query, {
      headers, signal: AbortSignal.timeout(8500)
    });
    if (!ledgerResponse.ok) throw Error('ledger_read_failed');
    const ledger = await ledgerResponse.json();
    if (!Array.isArray(ledger) || ledger.length > MAX_ROWS) throw Error('ledger_incomplete');

    // Always validate provider authorization, including days without sales.
    const probe = await providerRead('https://api.mercadopago.com/v1/payment_methods', token);
    if (!probe.ok) return reply(res, 503, { ok: false, status: 'provider_unavailable' });

    let checked = 0, mismatches = 0, lookupFailures = 0, duplicateCharges = 0;
    // Small batches avoid flooding the provider with concurrent requests.
    for (let i = 0; i < ledger.length; i += 4) {
      const batch = ledger.slice(i, i + 4);
      const results = await Promise.all(batch.map(async record => {
        const id = String(record.payment_id || '');
        if (!/^\d{1,30}$/.test(id)) return 'mismatch';
        try {
          const response = await providerRead('https://api.mercadopago.com/v1/payments/' + id, token);
          if (!response.ok) return 'lookup_failed';
          const payment = await response.json();
          const cents = Math.round(Number(payment.transaction_amount) * 100);
          return String(payment.id) === id &&
            payment.status === 'approved' &&
            payment.currency_id === 'BRL' &&
            payment.external_reference === REF_PREFIX + record.quote_id &&
            Number.isSafeInteger(cents) &&
            cents === Number(record.amount_cents) &&
            record.currency === 'BRL' ? 'verified' : 'mismatch';
        } catch { return 'lookup_failed'; }
      }));
      for (let j = 0; j < results.length; j++) {
        checked++;
        if (batch[j].reconciliation_status === 'duplicate_charge') duplicateCharges++;
        if (results[j] === 'mismatch') mismatches++;
        if (results[j] === 'lookup_failed') lookupFailures++;
      }
    }
    const status = lookupFailures ? 'provider_unavailable'
      : mismatches || duplicateCharges ? 'critical' : 'healthy';
    const counts = { checked_payments: checked, mismatched_payments: mismatches,
      provider_lookup_failures: lookupFailures, duplicate_approved_charges: duplicateCharges };
    if (status !== 'healthy') console.error('center-provider-audit attention', status, counts);
    return reply(res, status === 'healthy' ? 200 : 503,
      { ok: status === 'healthy', status, ...counts });
  } catch (error) {
    console.error('center-provider-audit unavailable', error?.name || 'request_error');
    return reply(res, 503, { ok: false, status: 'unavailable' });
  }
}
