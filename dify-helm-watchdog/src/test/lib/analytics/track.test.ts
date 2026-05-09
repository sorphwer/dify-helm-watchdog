import { createHmac } from "node:crypto";

import { trackEvent, queryAnalytics } from "@/lib/analytics/track";

describe("trackEvent", () => {
  const originalEnv = process.env;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    process.env = { ...originalEnv };
    fetchSpy = jest
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response(null, { status: 202 }));
  });

  afterEach(() => {
    process.env = originalEnv;
    fetchSpy.mockRestore();
  });

  it("is a no-op when env vars are missing", async () => {
    delete process.env.ANALYTICS_WORKER_URL;
    delete process.env.ANALYTICS_WORKER_SECRET;
    await trackEvent({ kind: "api", name: "versions", sessionHash: "h" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("posts to /track with HMAC headers when configured", async () => {
    process.env.ANALYTICS_WORKER_URL = "https://analytics.example.com";
    process.env.ANALYTICS_WORKER_SECRET = "secret";

    await trackEvent({
      kind: "mcp",
      name: "list_versions",
      sessionHash: "abc",
      latencyMs: 12.3,
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://analytics.example.com/track");
    expect(init.method).toBe("POST");

    const headers = new Headers(init.headers);
    expect(headers.get("Content-Type")).toBe("application/json");
    const ts = headers.get("X-Timestamp");
    const sig = headers.get("X-Signature");
    expect(ts).toBeTruthy();
    expect(sig).toMatch(/^[a-f0-9]{64}$/);

    // Body shape + signature correctness
    const body = init.body as string;
    const expected = createHmac("sha256", "secret")
      .update(`${ts}.${body}`)
      .digest("hex");
    expect(sig).toBe(expected);

    const parsed = JSON.parse(body);
    expect(parsed).toMatchObject({
      kind: "mcp",
      name: "list_versions",
      sessionHash: "abc",
      latencyMs: 12,
    });
  });

  it("strips trailing slashes from the worker URL", async () => {
    process.env.ANALYTICS_WORKER_URL = "https://analytics.example.com///";
    process.env.ANALYTICS_WORKER_SECRET = "secret";

    await trackEvent({ kind: "page", name: "home", sessionHash: "h" });

    const [url] = fetchSpy.mock.calls[0] as [string];
    expect(url).toBe("https://analytics.example.com/track");
  });

  it("swallows network errors", async () => {
    process.env.ANALYTICS_WORKER_URL = "https://analytics.example.com";
    process.env.ANALYTICS_WORKER_SECRET = "secret";
    fetchSpy.mockRejectedValueOnce(new Error("network down"));

    await expect(
      trackEvent({ kind: "api", name: "versions", sessionHash: "h" }),
    ).resolves.toBeUndefined();
  });

  it("clamps very long names to 256 chars", async () => {
    process.env.ANALYTICS_WORKER_URL = "https://analytics.example.com";
    process.env.ANALYTICS_WORKER_SECRET = "secret";

    const longName = "x".repeat(500);
    await trackEvent({ kind: "api", name: longName, sessionHash: "h" });

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const parsed = JSON.parse(init.body as string);
    expect(parsed.name).toHaveLength(256);
  });
});

describe("queryAnalytics", () => {
  const originalEnv = process.env;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.ANALYTICS_WORKER_URL = "https://analytics.example.com";
    process.env.ANALYTICS_WORKER_SECRET = "secret";
    fetchSpy = jest.spyOn(global, "fetch");
  });

  afterEach(() => {
    process.env = originalEnv;
    fetchSpy.mockRestore();
  });

  it("posts to /query and returns parsed payload", async () => {
    const payload = {
      window: "7d",
      generatedAt: "2026-05-09T00:00:00Z",
      mcp: { total: 10, uv: 3, byName: [{ name: "list_versions", hits: 10 }] },
      api: { total: 5, uv: 2, byName: [] },
      page: { total: 7, uv: 4, byName: [] },
    };
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(payload), { status: 200 }),
    );

    const result = await queryAnalytics("7d");
    expect(result).toEqual(payload);

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://analytics.example.com/query");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ window: "7d" });
  });

  it("throws when worker is not configured", async () => {
    delete process.env.ANALYTICS_WORKER_URL;
    await expect(queryAnalytics("7d")).rejects.toThrow(/not configured/);
  });

  it("throws on non-2xx response", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response("server error", { status: 500 }),
    );
    await expect(queryAnalytics("30d")).rejects.toThrow(/analytics query failed: 500/);
  });
});
