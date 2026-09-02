import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Rate-limit guard that identifies the REAL visitor IP when the app runs
 * behind proxies (Vercel rewrite proxy today, Cloudflare later).
 *
 * A direct `req.ip` would resolve to the proxy's address, so every visitor
 * would share a single rate-limit bucket and legitimate users would block
 * each other. Instead we read the forwarded client IP, preferring the most
 * trustworthy header first:
 *   1. cf-connecting-ip  — set by Cloudflare, not client-spoofable through it
 *   2. x-real-ip         — set by Vercel / most reverse proxies
 *   3. x-forwarded-for   — first entry is the original client
 *   4. req.ip / req.ips  — last-resort fallback
 */
@Injectable()
export class ThrottlerBehindProxyGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const headers = req.headers ?? {};

    const cf = headers['cf-connecting-ip'];
    if (typeof cf === 'string' && cf.length > 0) return cf;

    const realIp = headers['x-real-ip'];
    if (typeof realIp === 'string' && realIp.length > 0) return realIp;

    const xff = headers['x-forwarded-for'];
    const xffValue = Array.isArray(xff) ? xff[0] : xff;
    if (typeof xffValue === 'string' && xffValue.length > 0) {
      const first = xffValue.split(',')[0].trim();
      if (first) return first;
    }

    if (Array.isArray(req.ips) && req.ips.length > 0) return req.ips[0];
    return req.ip ?? 'unknown';
  }
}
