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

const MODERN_PROTOCOL_VERSION = "2026-07-28";
const LEGACY_PROTOCOL_VERSION = "2025-11-25";

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

  describe("initialize (legacy handshake, 2025-11-25 and earlier)", () => {
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

    it("echoes 2025-11-25, the version new Claude Code sends on fallback", async () => {
      const response = await postJson({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "claude-code", version: "2.1.278" },
        },
      });

      const payload = (await response.json()) as JsonRpcResult;
      expect(payload.result?.protocolVersion).toBe("2025-11-25");
      expect(payload.result?.capabilities).toMatchObject({ tools: {} });
      expect(payload.result?.serverInfo).toMatchObject({
        name: "dify-helm-watchdog",
      });
    });

    it("falls back to the newest legacy version for an unsupported client version", async () => {
      const response = await postJson({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "1999-01-01", capabilities: {} },
      });

      const payload = (await response.json()) as JsonRpcResult;
      expect(payload.result?.protocolVersion).toBe(LEGACY_PROTOCOL_VERSION);
    });

    it("never answers initialize with a 2026-era version", async () => {
      const response = await postJson({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: MODERN_PROTOCOL_VERSION, capabilities: {} },
      });

      const payload = (await response.json()) as JsonRpcResult;
      expect(payload.result?.protocolVersion).toBe(LEGACY_PROTOCOL_VERSION);
    });

    it("reads the protocol version from the _meta envelope", async () => {
      const response = await postJson({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          _meta: { "io.modelcontextprotocol/protocolVersion": "2025-03-26" },
        },
      });

      const payload = (await response.json()) as JsonRpcResult;
      expect(payload.result?.protocolVersion).toBe("2025-03-26");
    });
  });

  it("answers server/discover with a 2026-07-28 DiscoverResult", async () => {
    const response = await postJson({
      jsonrpc: "2.0",
      id: 42,
      method: "server/discover",
      params: {
        _meta: {
          "io.modelcontextprotocol/protocolVersion": MODERN_PROTOCOL_VERSION,
          "io.modelcontextprotocol/clientInfo": {
            name: "claude-code",
            version: "2.1.278",
          },
          "io.modelcontextprotocol/clientCapabilities": {},
        },
      },
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as JsonRpcResult;
    expect(payload.id).toBe(42);
    const result = payload.result as {
      resultType?: string;
      supportedVersions?: string[];
      capabilities?: { tools?: unknown; prompts?: unknown };
      ttlMs?: number;
      cacheScope?: string;
      protocolVersion?: string;
      _meta?: Record<string, { name?: string; version?: string }>;
    };
    expect(result.resultType).toBe("complete");
    expect(result.supportedVersions).toContain(MODERN_PROTOCOL_VERSION);
    expect(result.supportedVersions).toContain(LEGACY_PROTOCOL_VERSION);
    expect(result.capabilities?.tools).toBeDefined();
    expect(result.capabilities?.prompts).toBeDefined();
    expect(result.cacheScope).toBe("public");
    expect(typeof result.ttlMs).toBe("number");
    expect(result._meta?.["io.modelcontextprotocol/serverInfo"]).toMatchObject({
      name: "dify-helm-watchdog",
    });
    // DiscoverResult has no protocolVersion; the client picks from the list.
    expect(result.protocolVersion).toBeUndefined();
  });

  it("marks every result as resultType complete for 2026-07-28 clients", async () => {
    for (const method of ["ping", "tools/list", "prompts/list"]) {
      const response = await postJson({ jsonrpc: "2.0", id: 7, method });
      const payload = (await response.json()) as JsonRpcResult;
      expect(payload.result?.resultType).toBe("complete");
      expect(payload.result?._meta).toMatchObject({
        "io.modelcontextprotocol/serverInfo": { name: "dify-helm-watchdog" },
      });
    }
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
        } as unknown as CachePayload["versions"][number],
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

  it("responds to ping with a complete result", async () => {
    const response = await postJson({ jsonrpc: "2.0", id: 6, method: "ping" });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as JsonRpcResult;
    expect(payload.result).toMatchObject({ resultType: "complete" });
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
