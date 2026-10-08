'use strict';
const crypto = require('node:crypto');

const validId = value => (/^\d{1,32}$/.test(String(value || '')) ? String(value) : null);

function verifyMercadoPagoSignature({ signature, requestId, paymentId, secret }) {
  if (!signature || !requestId || !paymentId || !secret) return false;
  const parts = Object.fromEntries(String(signature).split(',').map(p => p.trim().split('=')));
  const ts = parts.ts;
  const hash = parts.v1;
  if (!ts || !/^\d{1,20}$/.test(ts) || !hash || !/^[0-9a-f]{64}$/i.test(hash)) return false;
  if (!validId(paymentId)) return false;
  // Mesmo modelo HMAC do projeto Métodos Digitais, com dados da Center isolados.
  const manifest = 'id:' + String(paymentId).toLowerCase() + ';request-id:' + requestId + ';ts:' + ts + ';';
  const expected = crypto.createHmac('sha256', secret).update(manifest).digest();
  const supplied = Buffer.from(hash, 'hex');
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}

function reconcileMercadoPagoPayment(order, payment) {
  const reasons = [];
  if (!order || !payment) reasons.push('missing_order_or_payment');
  if (!/^[0-9]+$/.test(String(payment?.id ?? ''))) reasons.push('invalid_mp_payment_id');
  if (payment?.currency_id !== 'BRL') reasons.push('currency_mismatch');
  if (String(payment?.external_reference ?? '') !== String(order?.external_reference ?? '')) {
    reasons.push('external_reference_mismatch');
  }
  const expected = Number(order?.amount_cents);
  const paid = Number(payment?.transaction_amount);
  if (!Number.isSafeInteger(expected) || expected <= 0 || !Number.isFinite(paid) ||
      Math.abs(paid * 100 - expected) > 0.01) {
    reasons.push('amount_mismatch');
  }
  if (order?.project !== 'center-cupulas') reasons.push('wrong_project');
  const status = String(payment?.status || '');
  const statuses = new Set(['approved','pending','in_process','authorized','rejected','cancelled','refunded','charged_back','in_mediation']);
  if (!statuses.has(status)) reasons.push('unexpected_payment_status');
  const mapped = {
    approved: 'paid',
    pending: 'pending',
    in_process: 'pending',
    authorized: 'pending',
    rejected: 'rejected',
    cancelled: 'cancelled',
    refunded: 'refunded',
    charged_back: 'charged_back',
    in_mediation: 'in_mediation'
  }[status] || 'pending';

  return { valid: reasons.length === 0, reasons, status: mapped };
}

function shouldApplyStatus(current, next) {
  if (current === next) return false;
  if (current === 'charged_back' || current === 'refunded') return false;
  if (next === 'charged_back' || next === 'refunded') return true;
  if (current === 'paid') return next === 'in_mediation';
  if (current === 'in_mediation') return next === 'paid';
  if (next === 'pending' && !['pending','checkout_created'].includes(current)) return false;
  return true;
}

module.exports = { validId, verifyMercadoPagoSignature, reconcileMercadoPagoPayment, shouldApplyStatus };
