import { timingSafeEqual } from 'node:crypto';

// Shared authentication for all internal, cron-only endpoints.
// A missing secret must never accidentally authorize "Bearer undefined".
export function isInternalCronAuthorized(req) {
  const secret = String(process.env.CRON_SECRET || '');
  const supplied = String(req.headers?.authorization || '');
  const expected = 'Bearer ' + secret;
  return secret.length >= 20 &&
    Buffer.byteLength(supplied) === Buffer.byteLength(expected) &&
    timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}
