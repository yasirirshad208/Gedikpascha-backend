import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Verify an Iyzico webhook HMAC signature.
 *
 * Iyzico signs webhook payloads with HMAC-SHA256 using the merchant's webhook secret.
 * The signature is sent in the `x-iyz-signature` (or similar) header. We compare
 * with `timingSafeEqual` to avoid timing-attack leaks.
 *
 * The exact header name and signing-payload shape may differ slightly per Iyzico
 * product (Marketplace v1 / v2). When wiring real webhooks in Phase 6, confirm
 * the contract from the merchant panel and adjust `payloadFor()` if needed.
 */
export function verifyIyzicoSignature(opts: {
  rawBody: string;
  signature: string | undefined;
  secret: string;
}): boolean {
  if (!opts.signature || !opts.secret) return false;

  const expected = createHmac('sha256', opts.secret)
    .update(opts.rawBody, 'utf8')
    .digest('hex');

  const given = opts.signature.trim();
  if (expected.length !== given.length) return false;

  try {
    return timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(given, 'utf8'));
  } catch {
    return false;
  }
}
