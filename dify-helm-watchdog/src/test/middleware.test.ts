import { NextRequest } from "next/server";

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
      ...headers,
    },
  });
};

describe("middleware", () => {
  beforeEach(() => {
    process.env.ANALYTICS_SESSION_SALT = "test";
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it("tracks homepage as kind=page name=home", async () => {
    await middleware(buildReq("/"));
    await flushMicrotasks();
    expect(mockedTrack).toHaveBeenCalledTimes(1);
    expect(mockedTrack.mock.calls[0][0]).toMatchObject({
      kind: "page",
      name: "home",
    });
    expect(mockedTrack.mock.calls[0][0].sessionHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("tracks v1 API endpoint as kind=api with the path tail", async () => {
    await middleware(buildReq("/api/v1/versions/3.9.0/values"));
    await flushMicrotasks();
    expect(mockedTrack).toHaveBeenCalledTimes(1);
    expect(mockedTrack.mock.calls[0][0]).toMatchObject({
      kind: "api",
      name: "versions/3.9.0/values",
    });
  });

  it.each(["cron", "mcp", "sse", "analytics"])(
    "skips /api/v1/%s (already instrumented or non-user)",
    async (prefix) => {
      await middleware(buildReq(`/api/v1/${prefix}`));
      await middleware(buildReq(`/api/v1/${prefix}/foo`));
      await flushMicrotasks();
      expect(mockedTrack).not.toHaveBeenCalled();
    },
  );

  it("does not track unrelated paths", async () => {
    await middleware(buildReq("/dashboard"));
    await middleware(buildReq("/swagger"));
    await flushMicrotasks();
    expect(mockedTrack).not.toHaveBeenCalled();
  });

  it("never throws even if trackEvent rejects", async () => {
    mockedTrack.mockRejectedValueOnce(new Error("boom"));
    await expect(middleware(buildReq("/"))).resolves.toBeDefined();
  });
});
