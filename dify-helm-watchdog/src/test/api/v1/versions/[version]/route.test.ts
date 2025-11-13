import { GET } from "@/app/api/v1/versions/[version]/route";
import { loadCache } from "@/lib/helm";

jest.mock("@/lib/helm", () => ({
  loadCache: jest.fn(),
}));

const mockedLoadCache = loadCache as jest.MockedFunction<typeof loadCache>;

describe("GET /api/v1/versions/{version}", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.resetAllMocks();
  });

  it("should return 404 when cache is not available", async () => {
    mockedLoadCache.mockResolvedValueOnce(null);

    const request = new Request("http://localhost/api/v1/versions/2.5.0");
    const params = Promise.resolve({ version: "2.5.0" });
    const response = await GET(request, { params });

    expect(response.status).toBe(404);

    const payload = await response.json() as {
      error: { message: string; details: Array<{ reason: string }> };
    };
    expect(payload.error.message).toBe("Cache not available. Trigger the cron job first.");
    expect(payload.error.details[0].reason).toBe("CACHE_NOT_INITIALIZED");
  });

  it("should return 404 when version is not found in cache", async () => {
    mockedLoadCache.mockResolvedValueOnce({
      updateTime: "2024-01-01T00:00:00.000Z",
      versions: [
        {
          version: "2.5.0",
          appVersion: "0.10.0",
          createTime: "2024-01-01T00:00:00.000Z",
          chartUrl: "https://example.com/chart-2.5.0.tgz",
          digest: "sha256:abc123",
          values: {
            path: "values/2.5.0.yaml",
            url: "https://example.com/values-2.5.0.yaml",
            hash: "values-hash-1",
          },
          images: {
            path: "images/2.5.0.yaml",
            url: "https://example.com/images-2.5.0.yaml",
            hash: "images-hash-1",
          },
        },
      ],
    });

    const request = new Request("http://localhost/api/v1/versions/2.6.0");
    const params = Promise.resolve({ version: "2.6.0" });
    const response = await GET(request, { params });

    expect(response.status).toBe(404);

    const payload = await response.json() as {
      error: { message: string; details: Array<{ reason: string; availableVersions: string[] }> };
    };

    expect(payload.error.message).toBe("Version 2.6.0 does not exist in the cache.");
    expect(payload.error.details[0].reason).toBe("VERSION_NOT_FOUND");
    expect(payload.error.details[0].availableVersions).toEqual(["2.5.0"]);
  });

  it("should return version details with all assets and URLs", async () => {
    mockedLoadCache.mockResolvedValueOnce({
      updateTime: "2024-01-01T00:00:00.000Z",
      versions: [
        {
          version: "2.5.0",
          appVersion: "0.10.0",
          createTime: "2024-01-01T00:00:00.000Z",
          chartUrl: "https://example.com/chart-2.5.0.tgz",
          digest: "sha256:abc123",
          values: {
            path: "values/2.5.0.yaml",
            url: "https://example.com/values-2.5.0.yaml",
            hash: "values-hash-1",
          },
          images: {
            path: "images/2.5.0.yaml",
            url: "https://example.com/images-2.5.0.yaml",
            hash: "images-hash-1",
          },
          imageValidation: {
            path: "validation/2.5.0.json",
            url: "https://example.com/validation-2.5.0.json",
            hash: "validation-hash-1",
          },
        },
      ],
    });

    const request = new Request("http://localhost/api/v1/versions/2.5.0");
    const params = Promise.resolve({ version: "2.5.0" });
    const response = await GET(request, { params });

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(
      "public, s-maxage=3600, stale-while-revalidate=86400",
    );

    const payload = await response.json() as {
      version: string;
      appVersion: string | null;
      createTime: string | null;
      chartUrl: string;
      digest?: string;
      assets: {
        values: { path: string; url: string; hash: string };
        images: { path: string; url: string; hash: string };
        validation?: { path: string; url: string; hash: string };
      };
      urls: {
        self: string;
        images: string;
        values: string;
        validation?: string;
      };
    };

    expect(payload.version).toBe("2.5.0");
    expect(payload.appVersion).toBe("0.10.0");
    expect(payload.createTime).toBe("2024-01-01T00:00:00.000Z");
    expect(payload.chartUrl).toBe("https://example.com/chart-2.5.0.tgz");
    expect(payload.digest).toBe("sha256:abc123");

    expect(payload.assets.values).toEqual({
      path: "values/2.5.0.yaml",
      url: "https://example.com/values-2.5.0.yaml",
      hash: "values-hash-1",
    });

    expect(payload.assets.images).toEqual({
      path: "images/2.5.0.yaml",
      url: "https://example.com/images-2.5.0.yaml",
      hash: "images-hash-1",
    });

    expect(payload.assets.validation).toEqual({
      path: "validation/2.5.0.json",
      url: "https://example.com/validation-2.5.0.json",
      hash: "validation-hash-1",
    });

    expect(payload.urls).toEqual({
      self: "/api/v1/versions/2.5.0",
      images: "/api/v1/versions/2.5.0/images",
      values: "/api/v1/versions/2.5.0/values",
      validation: "/api/v1/versions/2.5.0/validation",
    });
  });

  it("should return version details without validation when not available", async () => {
    mockedLoadCache.mockResolvedValueOnce({
      updateTime: "2024-01-01T00:00:00.000Z",
      versions: [
        {
          version: "2.5.0",
          appVersion: "0.10.0",
          createTime: "2024-01-01T00:00:00.000Z",
          chartUrl: "https://example.com/chart-2.5.0.tgz",
          digest: "sha256:abc123",
          values: {
            path: "values/2.5.0.yaml",
            url: "https://example.com/values-2.5.0.yaml",
            hash: "values-hash-1",
          },
          images: {
            path: "images/2.5.0.yaml",
            url: "https://example.com/images-2.5.0.yaml",
            hash: "images-hash-1",
          },
        },
      ],
    });

    const request = new Request("http://localhost/api/v1/versions/2.5.0");
    const params = Promise.resolve({ version: "2.5.0" });
    const response = await GET(request, { params });

    expect(response.status).toBe(200);

    const payload = await response.json() as {
      assets: {
        validation?: unknown;
      };
      urls: {
        validation?: unknown;
      };
    };

    expect(payload.assets.validation).toBeUndefined();
    expect(payload.urls.validation).toBeUndefined();
  });

  it("should handle null appVersion and createTime and undefined digest", async () => {
    mockedLoadCache.mockResolvedValueOnce({
      updateTime: "2024-01-01T00:00:00.000Z",
      versions: [
        {
          version: "2.5.0",
          appVersion: null,
          createTime: null,
          chartUrl: "https://example.com/chart-2.5.0.tgz",
          digest: undefined,
          values: {
            path: "values/2.5.0.yaml",
            url: "https://example.com/values-2.5.0.yaml",
            hash: "values-hash-1",
          },
          images: {
            path: "images/2.5.0.yaml",
            url: "https://example.com/images-2.5.0.yaml",
            hash: "images-hash-1",
          },
        },
      ],
    });

    const request = new Request("http://localhost/api/v1/versions/2.5.0");
    const params = Promise.resolve({ version: "2.5.0" });
    const response = await GET(request, { params });

    expect(response.status).toBe(200);

    const payload = await response.json() as {
      version: string;
      appVersion: string | null;
      createTime: string | null;
      digest?: string;
    };

    expect(payload.version).toBe("2.5.0");
    expect(payload.appVersion).toBeNull();
    expect(payload.createTime).toBeNull();
    expect(payload.digest).toBeUndefined();
  });

  it("should return 500 when loadCache throws an error", async () => {
    mockedLoadCache.mockRejectedValueOnce(new Error("Cache load failed"));

    const request = new Request("http://localhost/api/v1/versions/2.5.0");
    const params = Promise.resolve({ version: "2.5.0" });
    const response = await GET(request, { params });

    expect(response.status).toBe(500);

    const payload = await response.json() as {
      error: { message: string };
    };
    expect(payload.error.message).toBe("Cache load failed");
  });
});

