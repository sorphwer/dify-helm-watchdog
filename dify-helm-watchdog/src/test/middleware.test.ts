import { NextRequest, type NextFetchEvent } from "next/server";

import { middleware } from "@/middleware";
import { trackEvent } from "@/lib/analytics/track";

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
});
