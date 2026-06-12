import {
  checkRateLimit,
  RATE_LIMIT_MAX_HITS,
  RATE_LIMIT_WINDOW_MS,
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
});
