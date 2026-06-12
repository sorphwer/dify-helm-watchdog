// Best-effort in-memory sliding-window rate limiter for the public read API.
// State lives in module scope, so on Vercel it is PER-INSTANCE (Fluid Compute
// reuses instances but does not share memory across them) — it throttles a
// single aggressive client hitting a warm instance without any external store.
// The hard, global cap belongs in Vercel Firewall; this is a cheap first line.

const resolveWindowMs = (): number => {
  const raw = Number(process.env.RATE_LIMIT_WINDOW_S);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) * 1000 : 60_000;
};

const resolveMaxHits = (): number => {
  const raw = Number(process.env.RATE_LIMIT_MAX);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 100;
};

export const RATE_LIMIT_WINDOW_MS = resolveWindowMs();
export const RATE_LIMIT_MAX_HITS = resolveMaxHits();

// Guard against an unbounded map when a flood arrives from many distinct IPs.
export const RATE_LIMIT_MAX_KEYS = 10_000;

const hits = new Map<string, number[]>();

export interface RateLimitResult {
  ok: boolean;
  retryAfter: number; // seconds until the window frees up
}

export const checkRateLimit = (
  key: string,
  now: number = Date.now(),
): RateLimitResult => {
  // Unknown / unroutable callers collapse onto the same key ("0.0.0.0" is the
  // session.extractIp fallback). Never let one shared bucket throttle everyone
  // — skip limiting when we cannot identify the caller.
  if (!key || key === "0.0.0.0") return { ok: true, retryAfter: 0 };

  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const recent = (hits.get(key) ?? []).filter((t) => t > cutoff);

  // delete + re-set moves this key to the most-recently-used end of the Map, so
  // insertion order tracks recency and the overflow eviction below is true LRU.
  hits.delete(key);

  if (recent.length >= RATE_LIMIT_MAX_HITS) {
    hits.set(key, recent);
    const retryAfter = Math.max(
      1,
      Math.ceil((recent[0] + RATE_LIMIT_WINDOW_MS - now) / 1000),
    );
    return { ok: false, retryAfter };
  }

  recent.push(now);
  hits.set(key, recent);

  // Bound memory in O(1): when over capacity, evict the least-recently-used key
  // (first in insertion order). A full O(N) sweep on every request would block
  // the event loop under a many-IP flood — the exact abuse this guards against.
  if (hits.size > RATE_LIMIT_MAX_KEYS) {
    const oldest = hits.keys().next().value;
    if (oldest !== undefined) hits.delete(oldest);
  }

  return { ok: true, retryAfter: 0 };
};

// Test-only: clear module state between cases.
export const __resetRateLimit = (): void => {
  hits.clear();
};

// Test-only: current number of tracked keys.
export const __rateLimitSize = (): number => hits.size;
