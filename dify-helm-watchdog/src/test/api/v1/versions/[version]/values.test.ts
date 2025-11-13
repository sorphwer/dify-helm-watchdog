import { GET } from "@/app/api/v1/versions/[version]/values/route";
import { loadCache } from "@/lib/helm";

jest.mock("@/lib/helm", () => ({
  loadCache: jest.fn(),
}));

const mockedLoadCache = loadCache as jest.MockedFunction<typeof loadCache>;

describe("GET /api/v1/versions/{version}/values", () => {
  const mockValuesYaml = `
global:
  image:
    tag: 0.10.0
api:
  replicas: 2
  resources:
    limits:
      memory: 2Gi
web:
  replicas: 1
`;

  afterEach(() => {
    jest.restoreAllMocks();
    jest.resetAllMocks();
  });

  it("should return 404 when cache is not available", async () => {
    mockedLoadCache.mockResolvedValueOnce(null);

    const request = new Request("http://localhost/api/v1/versions/2.5.0/values");
    const params = Promise.resolve({ version: "2.5.0" });
    const response = await GET(request, { params });

    expect(response.status).toBe(404);

    const payload = await response.json() as {
      error: { message: string; details: Array<{ reason: string }> };
    };
    expect(payload.error.message).toBe("Cache not available. Trigger the cron job first.");
    expect(payload.error.details[0].reason).toBe("CACHE_NOT_INITIALIZED");
  });

  it("should return 404 when version is not found", async () => {
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

    const request = new Request("http://localhost/api/v1/versions/2.6.0/values");
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

  it("should return values.yaml content from inline", async () => {
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
            inline: mockValuesYaml,
          },
          images: {
            path: "images/2.5.0.yaml",
            url: "https://example.com/images-2.5.0.yaml",
            hash: "images-hash-1",
          },
        },
      ],
    });

    const fetchSpy = jest
      .spyOn(global, "fetch")
      .mockRejectedValue(new Error("fetch should not be called"));

    const request = new Request("http://localhost/api/v1/versions/2.5.0/values");
    const params = Promise.resolve({ version: "2.5.0" });
    const response = await GET(request, { params });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/x-yaml; charset=utf-8");
    expect(response.headers.get("Cache-Control")).toBe(
      "public, s-maxage=3600, stale-while-revalidate=86400",
    );
    expect(response.headers.get("Content-Disposition")).toBe(
      'inline; filename="values-2.5.0.yaml"',
    );
    expect(fetchSpy).not.toHaveBeenCalled();

    const yamlContent = await response.text();
    expect(yamlContent).toBe(mockValuesYaml);
    expect(yamlContent).toContain("global:");
    expect(yamlContent).toContain("api:");
    expect(yamlContent).toContain("replicas: 2");
  });

  it("should fetch values.yaml from URL when inline is not available", async () => {
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

    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      text: async () => mockValuesYaml,
    } as Response);

    const request = new Request("http://localhost/api/v1/versions/2.5.0/values");
    const params = Promise.resolve({ version: "2.5.0" });
    const response = await GET(request, { params });

    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledWith("https://example.com/values-2.5.0.yaml");

    const yamlContent = await response.text();
    expect(yamlContent).toBe(mockValuesYaml);
  });

  it("should return 500 when fetch values.yaml fails", async () => {
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

    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 404,
    } as Response);

    const request = new Request("http://localhost/api/v1/versions/2.5.0/values");
    const params = Promise.resolve({ version: "2.5.0" });
    const response = await GET(request, { params });

    expect(response.status).toBe(500);
    expect(fetchSpy).toHaveBeenCalledWith("https://example.com/values-2.5.0.yaml");

    const payload = await response.json() as {
      error: { message: string };
    };
    expect(payload.error.message).toBe("Failed to fetch values.yaml");
  });

  it("should return 500 when loadCache throws an error", async () => {
    mockedLoadCache.mockRejectedValueOnce(new Error("Cache load failed"));

    const request = new Request("http://localhost/api/v1/versions/2.5.0/values");
    const params = Promise.resolve({ version: "2.5.0" });
    const response = await GET(request, { params });

    expect(response.status).toBe(500);

    const payload = await response.json() as {
      error: { message: string };
    };
    expect(payload.error.message).toBe("Cache load failed");
  });

  it("should handle empty values.yaml content", async () => {
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

    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      text: async () => "",
    } as Response);

    const request = new Request("http://localhost/api/v1/versions/2.5.0/values");
    const params = Promise.resolve({ version: "2.5.0" });
    const response = await GET(request, { params });

    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalled();
    const content = await response.text();
    expect(content).toBe("");
  });
});

