import { GET, POST } from "@/app/api/v1/mcp/route";
import { trackEvent } from "@/lib/analytics/track";
import { loadCache } from "@/lib/helm";
import type { CachePayload } from "@/lib/types";

// The MCP handler defers analytics via next/server's after(); run the callback
// synchronously so trackEvent assertions are observable within the test.
jest.mock("next/server", () => ({
  after: (fn: () => void) => fn(),
}));

jest.mock("@/lib/analytics/track", () => ({
  trackEvent: jest.fn(() => Promise.resolve()),
}));

jest.mock("@/lib/helm", () => ({
  loadCache: jest.fn(),
}));

const mockedTrack = trackEvent as jest.MockedFunction<typeof trackEvent>;
const mockedLoadCache = loadCache as jest.MockedFunction<typeof loadCache>;

const DEFAULT_PROTOCOL_VERSION = "2026-07-28";

interface JsonRpcResult {
  jsonrpc?: string;
  id?: string | number | null;
  result?: Record<string, unknown>;
  error?: { code?: number; message?: string };
}

const postJson = (
  body: unknown,
  headers: Record<string, string> = {},
): Promise<Response> => {
  const request = new Request("http://localhost/api/v1/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  return POST(request);
};

const postRaw = (
  body: string,
  contentType: string | null = "application/json",
): Promise<Response> => {
  const request = new Request("http://localhost/api/v1/mcp", {
    method: "POST",
    headers: contentType ? { "content-type": contentType } : {},
    body,
  });
  return POST(request);
};

describe("POST /api/v1/mcp — MCP Streamable HTTP", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("initialize protocol negotiation", () => {
    it("echoes a supported client protocol version", async () => {
      const response = await postJson({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-06-18", capabilities: {} },
      });

      expect(response.status).toBe(200);
      const payload = (await response.json()) as JsonRpcResult;
      expect(payload.result?.protocolVersion).toBe("2025-06-18");
    });

    it("falls back to the advertised version for an unsupported client version", async () => {
      const response = await postJson({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "1999-01-01", capabilities: {} },
      });

      const payload = (await response.json()) as JsonRpcResult;
      expect(payload.result?.protocolVersion).toBe(DEFAULT_PROTOCOL_VERSION);
    });
  });

  it("handles server/discover without a prior initialize", async () => {
    const response = await postJson({
      jsonrpc: "2.0",
      id: 42,
      method: "server/discover",
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as JsonRpcResult;
    const result = payload.result as {
      protocolVersion?: string;
      capabilities?: { tools?: unknown };
      serverInfo?: { name?: string };
    };
    expect(result.protocolVersion).toBe(DEFAULT_PROTOCOL_VERSION);
    expect(result.capabilities?.tools).toBeDefined();
    expect(result.serverInfo?.name).toBe("dify-helm-watchdog");
  });

  describe("list results carry cache metadata", () => {
    it("tools/list returns a non-empty tools array with ttl and cache scope", async () => {
      const response = await postJson({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
      });

      const payload = (await response.json()) as JsonRpcResult;
      const result = payload.result as {
        tools?: unknown[];
        ttlMs?: number;
        cacheScope?: string;
      };
      expect(Array.isArray(result.tools)).toBe(true);
      expect(result.tools?.length).toBeGreaterThan(0);
      expect(result.ttlMs).toBe(3600000);
      expect(result.cacheScope).toBe("public");
    });

    it("prompts/list returns a non-empty prompts array with ttl and cache scope", async () => {
      const response = await postJson({
        jsonrpc: "2.0",
        id: 3,
        method: "prompts/list",
      });

      const payload = (await response.json()) as JsonRpcResult;
      const result = payload.result as {
        prompts?: unknown[];
        ttlMs?: number;
        cacheScope?: string;
      };
      expect(Array.isArray(result.prompts)).toBe(true);
      expect(result.prompts?.length).toBeGreaterThan(0);
      expect(result.ttlMs).toBe(3600000);
      expect(result.cacheScope).toBe("public");
    });
  });

  it("works without an Mcp-Method header (header is never required)", async () => {
    const response = await postJson({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/list",
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as JsonRpcResult;
    expect(payload.error).toBeUndefined();
    expect(payload.result).toBeDefined();
  });

  it("uses the Mcp-Method header to override the analytics event name for a tools/call", async () => {
    const cache: CachePayload = {
      updateTime: "2026-01-01T00:00:00.000Z",
      versions: [
        {
          version: "1.0.0",
          appVersion: "0.15.0",
          createTime: "2026-01-01T00:00:00.000Z",
          digest: "sha256:abc",
          status: null,
        } as CachePayload["versions"][number],
      ],
    };
    mockedLoadCache.mockResolvedValue(cache);

    const response = await postJson(
      {
        jsonrpc: "2.0",
        id: 5,
        method: "tools/call",
        params: { name: "list_versions", arguments: {} },
      },
      { "Mcp-Method": "tools.list_versions.custom" },
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as JsonRpcResult;
    expect(payload.error).toBeUndefined();
    expect(payload.result).toBeDefined();

    expect(mockedTrack).toHaveBeenCalled();
    expect(mockedTrack).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "mcp",
        name: "tools.list_versions.custom",
      }),
    );
  });

  it("responds to ping with an empty result object", async () => {
    const response = await postJson({ jsonrpc: "2.0", id: 6, method: "ping" });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as JsonRpcResult;
    expect(payload.result).toEqual({});
  });

  it("returns 204 for a notification (no id)", async () => {
    const response = await postJson({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    });

    expect(response.status).toBe(204);
  });

  it("returns HTTP 200 with a -32700 parse error for malformed JSON", async () => {
    const response = await postRaw("{ not valid json");

    expect(response.status).toBe(200);
    const payload = (await response.json()) as JsonRpcResult;
    expect(payload.error?.code).toBe(-32700);
  });

  it("returns a -32601 error for an unknown method with an id", async () => {
    const response = await postJson({
      jsonrpc: "2.0",
      id: 7,
      method: "does/not/exist",
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as JsonRpcResult;
    expect(payload.error?.code).toBe(-32601);
  });

  it("returns 400 for a non-JSON content type", async () => {
    const response = await postRaw("hello", "text/plain");

    expect(response.status).toBe(400);
  });
});

describe("GET /api/v1/mcp — discovery", () => {
  it("advertises only the streamable HTTP endpoint (no sse)", async () => {
    const request = new Request("http://localhost/api/v1/mcp");
    const response = await GET(request);

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      endpoints?: Record<string, unknown>;
    };
    expect(payload.endpoints?.streamableHttp).toBe("/api/v1/mcp");
    expect(payload.endpoints).not.toHaveProperty("sse");
  });
});
