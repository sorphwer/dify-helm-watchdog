import { NextRequest, type NextFetchEvent } from "next/server";

import { middleware } from "@/middleware";
import { trackEvent } from "@/lib/analytics/track";
import { __resetRateLimit } from "@/lib/api/rate-limit";

jest.mock("@/lib/analytics/track", () => ({
  trackEvent: jest.fn(() => Promise.resolve()),
}));

const mockedTrack = trackEvent as jest.MockedFunction<typeof trackEvent>;

const flushMicrotasks = () => new Promise((r) => setImmediate(r));

const buildReq = (path: string, headers: Record<string, string> = {}) => {
  return new NextRequest(`http://localhost${path}`, {
    headers: {
      "x-forwarded-for": "1.2.3.4",
      "user-agent": "test-agent",
      "x-vercel-ip-country": "US",
      ...headers,
    },
  });
};

const buildEvent = () => {
  const waitUntil = jest.fn();
  return {
    fetchEvent: { waitUntil } as unknown as NextFetchEvent,
    waitUntil,
  };
};

describe("middleware", () => {
  beforeEach(() => {
    process.env.ANALYTICS_SESSION_SALT = "test";
  });

  afterEach(() => {
    // clearAllMocks preserves the mock implementation between tests;
    // resetAllMocks would strip Promise.resolve() and trackEvent(...).catch()
    // would then throw on undefined.
    jest.clearAllMocks();
    // The rate limiter holds module-scope state across calls; reset it so
    // request counts don't leak between tests.
    __resetRateLimit();
  });

  it("tracks homepage via waitUntil as kind=page name=home", async () => {
    const evt = buildEvent();
    await middleware(buildReq("/"), evt.fetchEvent);
    await flushMicrotasks();
    expect(evt.waitUntil).toHaveBeenCalledTimes(1);
    expect(mockedTrack).toHaveBeenCalledTimes(1);
    expect(mockedTrack.mock.calls[0][0]).toMatchObject({
      kind: "page",
      name: "home",
      country: "US",
    });
    expect(mockedTrack.mock.calls[0][0].sessionHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("tracks v1 API endpoint as kind=api with the path tail", async () => {
    const evt = buildEvent();
    await middleware(buildReq("/api/v1/versions/3.9.0/values"), evt.fetchEvent);
    await flushMicrotasks();
    expect(evt.waitUntil).toHaveBeenCalledTimes(1);
    expect(mockedTrack).toHaveBeenCalledTimes(1);
    expect(mockedTrack.mock.calls[0][0]).toMatchObject({
      kind: "api",
      name: "versions/3.9.0/values",
      country: "US",
    });
  });

  it("falls back to country=XX when no geo header is present", async () => {
    const evt = buildEvent();
    // Override the default test header with empty string to clear it.
    await middleware(
      buildReq("/", { "x-vercel-ip-country": "" }),
      evt.fetchEvent,
    );
    await flushMicrotasks();
    expect(mockedTrack).toHaveBeenCalledTimes(1);
    expect(mockedTrack.mock.calls[0][0]).toMatchObject({ country: "XX" });
  });

  it.each(["cron", "mcp", "sse", "analytics"])(
    "skips /api/v1/%s (already instrumented or non-user)",
    async (prefix) => {
      const evt = buildEvent();
      await middleware(buildReq(`/api/v1/${prefix}`), evt.fetchEvent);
      await middleware(buildReq(`/api/v1/${prefix}/foo`), evt.fetchEvent);
      await flushMicrotasks();
      expect(evt.waitUntil).not.toHaveBeenCalled();
      expect(mockedTrack).not.toHaveBeenCalled();
    },
  );

  it("does not track unrelated paths", async () => {
    const evt = buildEvent();
    await middleware(buildReq("/dashboard"), evt.fetchEvent);
    await middleware(buildReq("/swagger"), evt.fetchEvent);
    await flushMicrotasks();
    expect(evt.waitUntil).not.toHaveBeenCalled();
    expect(mockedTrack).not.toHaveBeenCalled();
  });

  it("never throws even if trackEvent rejects", async () => {
    mockedTrack.mockRejectedValueOnce(new Error("boom"));
    const evt = buildEvent();
    await expect(middleware(buildReq("/"), evt.fetchEvent)).resolves.toBeDefined();
  });

  it.each([
    "/api/v1/versions/%2e%2e%2fetc%2fpasswd/values",
    "/api/v1/releases/3.10.0%2f..%2f..%2f..%2fblog",
    "/api/v1/versions/%252f",
    "/api/v1/releases/localhost:8080",
    "/api/v1/versions/%00",
  ])("short-circuits suspicious path %s with 400 and never tracks", async (path) => {
    const evt = buildEvent();
    const res = await middleware(buildReq(path), evt.fetchEvent);
    await flushMicrotasks();
    expect(res.status).toBe(400);
    expect(evt.waitUntil).not.toHaveBeenCalled();
    expect(mockedTrack).not.toHaveBeenCalled();
  });

  it("rate-limits a single IP past the limit with 429 and stops tracking", async () => {
    const { RATE_LIMIT_MAX_HITS } = await import("@/lib/api/rate-limit");
    const evt = buildEvent();

    for (let i = 0; i < RATE_LIMIT_MAX_HITS; i++) {
      const ok = await middleware(buildReq("/api/v1/versions"), evt.fetchEvent);
      expect(ok.status).not.toBe(429);
    }
    expect(mockedTrack).toHaveBeenCalledTimes(RATE_LIMIT_MAX_HITS);

    const blocked = await middleware(buildReq("/api/v1/versions"), evt.fetchEvent);
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBeTruthy();
    // No new track call for the throttled request.
    expect(mockedTrack).toHaveBeenCalledTimes(RATE_LIMIT_MAX_HITS);
  });
});
