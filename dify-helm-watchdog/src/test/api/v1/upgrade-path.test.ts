import { GET } from "@/app/api/v1/upgrade-path/route";
import { EE_CATALOG_URL } from "@/lib/ee-catalog";

const makeRelease = (version: string, unskippable: boolean) => ({
  version,
  track: "regular",
  releaseDate: "2026-01-01",
  eolDate: null,
  archived: false,
  unskippable,
  stopKinds: unskippable
    ? [{ kind: "migration", label: "Database migration" }]
    : [],
  stopSummary: unskippable
    ? "Database migration — back up before upgrade."
    : null,
  notesUrl: `https://ee.dify.ai/releases/${version}`,
  lockUrl: `https://ee.dify.ai/version-locks/${version}.yaml`,
});

const CATALOG_PAYLOAD = {
  schemaVersion: 1,
  generatedAt: "2026-01-01T00:00:00.000Z",
  releases: [
    makeRelease("v3.9.0", true),
    makeRelease("v3.9.5", false),
    makeRelease("v3.10.0", true),
    makeRelease("v3.11.0", true),
    makeRelease("v3.11.1", false),
  ],
};

describe("GET /api/v1/upgrade-path", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.resetAllMocks();
  });

  const serveCatalog = (response: {
    ok: boolean;
    status?: number;
    json?: () => Promise<unknown>;
  }) => {
    global.fetch = jest.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === EE_CATALOG_URL) {
        return Promise.resolve({
          ok: response.ok,
          status: response.status ?? 200,
          json: response.json ?? (async () => CATALOG_PAYLOAD),
        });
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    }) as unknown as typeof fetch;
  };

  it("returns the ordered hops, note kinds, and cache header for a valid range", async () => {
    serveCatalog({ ok: true });

    const request = new Request(
      "http://localhost/api/v1/upgrade-path?from=3.9.5&to=3.11.1",
    );
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(
      "public, s-maxage=3600, stale-while-revalidate=86400",
    );

    const payload = (await response.json()) as {
      hops: Array<{ version: string; isTarget: boolean }>;
      notes: Array<{ kind: string }>;
    };
    expect(payload.hops.map((h) => h.version)).toEqual([
      "v3.10.0",
      "v3.11.0",
      "v3.11.1",
    ]);
    expect(payload.hops[2]).toMatchObject({ version: "v3.11.1", isTarget: true });
    expect(payload.notes).toEqual([]);
  });

  it("returns 400 when the 'to' parameter is missing", async () => {
    const request = new Request("http://localhost/api/v1/upgrade-path?from=3.9.5");
    const response = await GET(request);

    expect(response.status).toBe(400);
    const payload = (await response.json()) as { error: { status: string } };
    expect(payload.error.status).toBe("INVALID_ARGUMENT");
  });

  it("returns 400 for path-traversal junk in 'from'", async () => {
    const request = new Request(
      "http://localhost/api/v1/upgrade-path?from=..%2f&to=3.11.1",
    );
    const response = await GET(request);

    expect(response.status).toBe(400);
  });

  it("returns 404 for an unknown target version", async () => {
    serveCatalog({ ok: true });

    const request = new Request(
      "http://localhost/api/v1/upgrade-path?from=3.9.5&to=9.9.9",
    );
    const response = await GET(request);

    expect(response.status).toBe(404);
    const payload = (await response.json()) as { error: { status: string } };
    expect(payload.error.status).toBe("NOT_FOUND");
  });

  it("returns 502 when the upstream catalog fetch rejects", async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error("network down")) as unknown as typeof fetch;

    const request = new Request(
      "http://localhost/api/v1/upgrade-path?from=3.9.5&to=3.11.1",
    );
    const response = await GET(request);

    expect(response.status).toBe(502);
    const payload = (await response.json()) as { error: { status: string } };
    expect(payload.error.status).toBe("UNAVAILABLE");
  });

  it("returns 400 when 'from' is at or above 'to'", async () => {
    serveCatalog({ ok: true });

    const request = new Request(
      "http://localhost/api/v1/upgrade-path?from=3.11.0&to=3.10.0",
    );
    const response = await GET(request);

    expect(response.status).toBe(400);
    const payload = (await response.json()) as { error: { status: string } };
    expect(payload.error.status).toBe("INVALID_ARGUMENT");
  });
});
