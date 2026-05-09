import { computeSessionHashFromHeaders } from "@/lib/analytics/session";

describe("computeSessionHashFromHeaders", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.ANALYTICS_SESSION_SALT = "test-salt";
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("produces a stable 64-char hex hash for the same headers", async () => {
    const headers = new Headers({
      "x-forwarded-for": "1.2.3.4",
      "user-agent": "mcp-client/1.0",
    });
    const a = await computeSessionHashFromHeaders(headers);
    const b = await computeSessionHashFromHeaders(headers);
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it("changes when the IP changes", async () => {
    const ua = "mcp-client/1.0";
    const a = await computeSessionHashFromHeaders(
      new Headers({ "x-forwarded-for": "1.1.1.1", "user-agent": ua }),
    );
    const b = await computeSessionHashFromHeaders(
      new Headers({ "x-forwarded-for": "2.2.2.2", "user-agent": ua }),
    );
    expect(a).not.toBe(b);
  });

  it("changes when the salt rotates", async () => {
    const headers = new Headers({
      "x-forwarded-for": "1.1.1.1",
      "user-agent": "x",
    });
    const before = await computeSessionHashFromHeaders(headers);
    process.env.ANALYTICS_SESSION_SALT = "different-salt";
    const after = await computeSessionHashFromHeaders(headers);
    expect(before).not.toBe(after);
  });

  it("falls back to 0.0.0.0 when no IP header is present", async () => {
    const headers = new Headers({ "user-agent": "x" });
    const a = await computeSessionHashFromHeaders(headers);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it("uses the first IP from x-forwarded-for chain", async () => {
    const headers = new Headers({
      "x-forwarded-for": "5.5.5.5, 10.0.0.1, 10.0.0.2",
      "user-agent": "x",
    });
    const a = await computeSessionHashFromHeaders(headers);
    const single = await computeSessionHashFromHeaders(
      new Headers({ "x-forwarded-for": "5.5.5.5", "user-agent": "x" }),
    );
    expect(a).toBe(single);
  });
});
