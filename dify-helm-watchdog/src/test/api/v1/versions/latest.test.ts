import { GET } from "@/app/api/v1/versions/latest/route";
import { loadCache } from "@/lib/helm";

jest.mock("@/lib/helm", () => ({
  loadCache: jest.fn(),
}));

const mockedLoadCache = loadCache as jest.MockedFunction<typeof loadCache>;

describe("GET /api/v1/versions/latest", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.resetAllMocks();
  });

  it("should return 404 when cache is null", async () => {
    mockedLoadCache.mockResolvedValueOnce(null);

    const request = new Request("http://localhost/api/v1/versions/latest");
    const response = await GET(request);

    expect(response.status).toBe(404);

    const payload = await response.json() as {
      error: { message: string; details: Array<{ reason: string }> };
    };

    expect(payload.error.message).toBe("No cached versions found. Trigger the cron job first.");
    expect(payload.error.details[0].reason).toBe("NO_VERSIONS_AVAILABLE");
  });

  it("should return 404 when cache has no versions", async () => {
    mockedLoadCache.mockResolvedValueOnce({
      updateTime: "2024-01-01T00:00:00.000Z",
      versions: [],
    });

    const request = new Request("http://localhost/api/v1/versions/latest");
    const response = await GET(request);

    expect(response.status).toBe(404);

    const payload = await response.json() as {
      error: { message: string };
    };

    expect(payload.error).toBeDefined();
  });

  it("should return the first version from cache with URLs", async () => {
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
        {
          version: "2.4.0",
          appVersion: "0.9.0",
          createTime: "2023-12-01T00:00:00.000Z",
          chartUrl: "https://example.com/chart-2.4.0.tgz",
          digest: "sha256:def456",
          values: {
            path: "values/2.4.0.yaml",
            url: "https://example.com/values-2.4.0.yaml",
            hash: "values-hash-2",
          },
          images: {
            path: "images/2.4.0.yaml",
            url: "https://example.com/images-2.4.0.yaml",
            hash: "images-hash-2",
          },
        },
      ],
    });

    const request = new Request("http://localhost/api/v1/versions/latest");
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(
      "public, s-maxage=1800, stale-while-revalidate=3600",
    );

    const payload = await response.json() as {
      version: string;
      appVersion: string | null;
      createTime: string | null;
      digest?: string;
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
    expect(payload.digest).toBe("sha256:abc123");
    expect(payload.urls).toEqual({
      self: "/api/v1/versions/2.5.0",
      images: "/api/v1/versions/2.5.0/images",
      values: "/api/v1/versions/2.5.0/values",
      validation: "/api/v1/versions/2.5.0/validation",
    });
  });

  it("should return latest version without validation URL when imageValidation is not available", async () => {
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
          imageValidation: undefined,
        },
      ],
    });

    const request = new Request("http://localhost/api/v1/versions/latest");
    const response = await GET(request);

    expect(response.status).toBe(200);

    const payload = await response.json() as {
      urls: {
        self: string;
        images: string;
        values: string;
        validation?: string;
      };
    };

    expect(payload.urls.validation).toBeUndefined();
  });

  it("should handle null appVersion and createTime", async () => {
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

    const request = new Request("http://localhost/api/v1/versions/latest");
    const response = await GET(request);

    expect(response.status).toBe(200);

    const payload = await response.json() as {
      version: string;
      appVersion: string | null;
      createTime: string | null;
      digest?: string;
    };

    expect(payload.appVersion).toBeNull();
    expect(payload.createTime).toBeNull();
    expect(payload.digest).toBeUndefined();
  });

  it("should return 500 when loadCache throws an error", async () => {
    mockedLoadCache.mockRejectedValueOnce(new Error("Cache load failed"));

    const request = new Request("http://localhost/api/v1/versions/latest");
    const response = await GET(request);

    expect(response.status).toBe(500);

    const payload = await response.json() as {
      error: { message: string };
    };

    expect(payload.error.message).toBe("Cache load failed");
  });
});

