/**
 * Tiny, memory-BOUNDED in-memory TTL cache for hot PUBLIC read endpoints.
 *
 * Purpose: cut Supabase egress. Public homepage/shop/category endpoints are hit
 * constantly (visitors, crawlers/bots, repeated navigation). Without caching,
 * every hit re-queries Supabase and re-transfers the same rows — which blew past
 * the free-tier egress limit. A short TTL cache serves repeats from memory.
 *
 * SAFETY (important on a 512 MB free Render instance): the cache can NEVER grow
 * unbounded. Three hard limits keep total memory tiny (~25 MB worst case):
 *   1. MAX_VALUE_BYTES  — never cache a single response bigger than this.
 *   2. MAX_TOTAL_BYTES  — hard ceiling on the whole cache; oldest entries are
 *                         evicted to stay under it.
 *   3. MAX_ENTRIES      — hard cap on the number of entries.
 * Expired entries are dropped on access. So it cannot fill RAM or crash.
 *
 * Only use for PUBLIC, non-user-specific, read-only data. Never cache
 * per-user, cart, checkout, auth, or write results.
 */
interface CacheEntry {
  value: unknown;
  expires: number;
  size: number; // approx bytes
}

// Hard memory ceiling for the WHOLE cache (all endpoints share this one store),
// tuned to be safe on a 512 MB free Render instance while still caching the
// larger social feed/shop responses. Worst case ~30 MB (~6% of 512 MB).
const MAX_ENTRIES = 300;
const MAX_VALUE_BYTES = 1024 * 1024; // 1 MB — don't cache a single huge response
const MAX_TOTAL_BYTES = 30 * 1024 * 1024; // 30 MB hard ceiling for whole cache

const store = new Map<string, CacheEntry>();
let totalBytes = 0;

function approxSize(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value) ?? '', 'utf8');
  } catch {
    return 0;
  }
}

function drop(key: string): void {
  const e = store.get(key);
  if (e) {
    totalBytes -= e.size;
    store.delete(key);
  }
}

/**
 * Returns the cached value for `key`, or computes it via `fn`, caches it for
 * `ttlMs` (subject to the size/memory limits), and returns it.
 */
export async function cached<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit) {
    if (hit.expires > now) return hit.value as T;
    drop(key); // expired — free its memory
  }

  const value = await fn();

  const size = approxSize(value);
  // Too big to cache safely — return it but don't store (protects RAM).
  if (size <= 0 || size > MAX_VALUE_BYTES) {
    return value;
  }

  // Make room: evict oldest entries until under both caps.
  drop(key); // replace any stale copy
  while (
    store.size > 0 &&
    (store.size >= MAX_ENTRIES || totalBytes + size > MAX_TOTAL_BYTES)
  ) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    drop(oldest);
  }

  // If a single entry still wouldn't fit the total budget, skip storing.
  if (totalBytes + size > MAX_TOTAL_BYTES) {
    return value;
  }

  store.set(key, { value, expires: now + ttlMs, size });
  totalBytes += size;
  return value;
}

/** Clear the whole cache, or only keys starting with `prefix`. */
export function clearCache(prefix?: string): void {
  if (!prefix) {
    store.clear();
    totalBytes = 0;
    return;
  }
  for (const key of [...store.keys()]) {
    if (key.startsWith(prefix)) drop(key);
  }
}

// Common TTLs (ms)
export const TTL = {
  short: 60_000, // 1 min  — product listings
  medium: 180_000, // 3 min — categories, brands
  long: 300_000, // 5 min — rarely-changing lookups
};
