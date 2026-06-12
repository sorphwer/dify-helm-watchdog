import {
  checkRateLimit,
  RATE_LIMIT_MAX_HITS,
  RATE_LIMIT_MAX_KEYS,
  RATE_LIMIT_WINDOW_MS,
  __rateLimitSize,
  __resetRateLimit,
} from "@/lib/api/rate-limit";

describe("checkRateLimit", () => {
  afterEach(() => {
    __resetRateLimit();
  });

  it("allows requests up to the limit, then denies", () => {
    const now = 1_000_000;
    for (let i = 0; i < RATE_LIMIT_MAX_HITS; i++) {
      expect(checkRateLimit("1.2.3.4", now).ok).toBe(true);
    }
    const denied = checkRateLimit("1.2.3.4", now);
    expect(denied.ok).toBe(false);
    expect(denied.retryAfter).toBeGreaterThan(0);
  });

  it("keeps separate buckets per key", () => {
    const now = 1_000_000;
    for (let i = 0; i < RATE_LIMIT_MAX_HITS; i++) {
      checkRateLimit("1.1.1.1", now);
    }
    expect(checkRateLimit("1.1.1.1", now).ok).toBe(false);
    // A different IP is unaffected.
    expect(checkRateLimit("2.2.2.2", now).ok).toBe(true);
  });

  it("frees the window once old hits age out", () => {
    const now = 1_000_000;
    for (let i = 0; i < RATE_LIMIT_MAX_HITS; i++) {
      checkRateLimit("9.9.9.9", now);
    }
    expect(checkRateLimit("9.9.9.9", now).ok).toBe(false);
    const later = now + RATE_LIMIT_WINDOW_MS + 1;
    expect(checkRateLimit("9.9.9.9", later).ok).toBe(true);
  });

  it("never throttles unidentifiable callers", () => {
    const now = 1_000_000;
    for (let i = 0; i < RATE_LIMIT_MAX_HITS * 2; i++) {
      expect(checkRateLimit("0.0.0.0", now).ok).toBe(true);
      expect(checkRateLimit("", now).ok).toBe(true);
    }
  });

  it("bounds memory to MAX_KEYS under a many-IP flood", () => {
    const now = 1_000_000;
    for (let i = 0; i < RATE_LIMIT_MAX_KEYS + 500; i++) {
      checkRateLimit(`10.${(i >> 16) & 255}.${(i >> 8) & 255}.${i & 255}`, now);
    }
    expect(__rateLimitSize()).toBeLessThanOrEqual(RATE_LIMIT_MAX_KEYS);
  });

  it("keeps a recently-active key alive under eviction pressure (LRU, not FIFO)", () => {
    const now = 1_000_000;
    // Drive "attacker" to its limit, inserted first so naive FIFO would evict it.
    for (let i = 0; i < RATE_LIMIT_MAX_HITS; i++) checkRateLimit("attacker", now);
    expect(checkRateLimit("attacker", now).ok).toBe(false);

    // Flood with distinct keys, touching "attacker" each round to keep it recent.
    for (let i = 0; i < RATE_LIMIT_MAX_KEYS + 100; i++) {
      checkRateLimit(`flood-${i}`, now);
      checkRateLimit("attacker", now);
    }

    // It survived eviction, so its bucket is intact and still over the limit.
    expect(checkRateLimit("attacker", now).ok).toBe(false);
  });
});
