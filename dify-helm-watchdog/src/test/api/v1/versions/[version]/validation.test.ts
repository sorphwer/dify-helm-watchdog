import { GET } from "@/app/api/v1/versions/[version]/validation/route";
import { loadCache } from "@/lib/helm";

jest.mock("@/lib/helm", () => ({
  loadCache: jest.fn(),
}));

const mockNormalizeValidationPayload = jest.fn();

jest.mock("@/lib/validation", () => ({
  normalizeValidationPayload: (...args: unknown[]) => mockNormalizeValidationPayload(...args),
  normalizeValidationRecord: jest.fn((data) => data),
  countValidationStatuses: jest.fn((images) => ({
    total: images.length,
    allFound: images.filter((img: { status: string }) => img.status === "ALL_FOUND").length,
    partial: images.filter((img: { status: string }) => img.status === "PARTIAL").length,
    missing: images.filter((img: { status: string }) => img.status === "MISSING").length,
    error: images.filter((img: { status: string }) => img.status === "ERROR").length,
  })),
}));

const mockedLoadCache = loadCache as jest.MockedFunction<typeof loadCache>;

describe("GET /api/v1/versions/{version}/validation", () => {
  const mockValidationData = {
    images: [
      {
        sourceRepository: "langgenius/dify-api",
        sourceTag: "0.10.0",
        targetImageName: "langgenius/dify-api:0.10.0",
        status: "ALL_FOUND",
        variants: [
          { platform: "linux/amd64", digest: "sha256:abc123", found: true },
          { platform: "linux/arm64", digest: "sha256:def456", found: true },
        ],
      },
    ],
  };
  
  const mockValidationJson = JSON.stringify(mockValidationData);

  beforeEach(() => {
    mockNormalizeValidationPayload.mockImplementation((data) => data);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.resetAllMocks();
  });

  it("should return 404 when cache is not available", async () => {
    mockedLoadCache.mockResolvedValueOnce(null);

    const request = new Request("http://localhost/api/v1/versions/2.5.0/validation");
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

    const request = new Request("http://localhost/api/v1/versions/2.6.0/validation");
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

  it("should return 404 when validation data is not available for the version", async () => {
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

    const request = new Request("http://localhost/api/v1/versions/2.5.0/validation");
    const params = Promise.resolve({ version: "2.5.0" });
    const response = await GET(request, { params });

    expect(response.status).toBe(404);

    const payload = await response.json() as {
      error: { message: string; details: Array<{ reason: string }> };
    };
    expect(payload.error.message).toBe(
      "Image validation data is not available for version 2.5.0.",
    );
    expect(payload.error.details[0].reason).toBe("VALIDATION_NOT_AVAILABLE");
  });

  it("should return validation data from inline content", async () => {
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
            inline: mockValidationJson,
          },
        },
      ],
    });

    const fetchSpy = jest
      .spyOn(global, "fetch")
      .mockRejectedValue(new Error("fetch should not be called"));

    const request = new Request("http://localhost/api/v1/versions/2.5.0/validation");
    const params = Promise.resolve({ version: "2.5.0" });
    const response = await GET(request, { params });

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(
      "public, s-maxage=3600, stale-while-revalidate=86400",
    );
    expect(fetchSpy).not.toHaveBeenCalled();

    const payload = await response.json() as {
      images: Array<{
        sourceRepository: string;
        sourceTag: string;
        targetImageName: string;
        status: string;
        variants: Array<{
          platform: string;
          digest: string;
          found: boolean;
        }>;
      }>;
    };

    expect(payload.images).toHaveLength(1);
    expect(payload.images[0].sourceRepository).toBe("langgenius/dify-api");
    expect(payload.images[0].sourceTag).toBe("0.10.0");
    expect(payload.images[0].status).toBe("ALL_FOUND");
    expect(payload.images[0].variants).toHaveLength(2);
  });

  it("should fetch validation data from URL when inline is not available", async () => {
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

    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      text: async () => mockValidationJson,
    } as Response);

    const request = new Request("http://localhost/api/v1/versions/2.5.0/validation");
    const params = Promise.resolve({ version: "2.5.0" });
    const response = await GET(request, { params });

    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledWith("https://example.com/validation-2.5.0.json");

    const payload = await response.json() as {
      images: Array<{
        sourceRepository: string;
        sourceTag: string;
      }>;
    };

    expect(payload.images).toHaveLength(1);
    expect(payload.images[0].sourceRepository).toBe("langgenius/dify-api");
  });

  it("should return 500 when fetch validation data fails", async () => {
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

    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 404,
    } as Response);

    const request = new Request("http://localhost/api/v1/versions/2.5.0/validation");
    const params = Promise.resolve({ version: "2.5.0" });
    const response = await GET(request, { params });

    expect(response.status).toBe(500);
    expect(fetchSpy).toHaveBeenCalledWith("https://example.com/validation-2.5.0.json");

    const payload = await response.json() as {
      error: { message: string };
    };
    expect(payload.error.message).toBe("Failed to fetch validation data");
  });

  it("should return 500 when loadCache throws an error", async () => {
    mockedLoadCache.mockRejectedValueOnce(new Error("Cache load failed"));

    const request = new Request("http://localhost/api/v1/versions/2.5.0/validation");
    const params = Promise.resolve({ version: "2.5.0" });
    const response = await GET(request, { params });

    expect(response.status).toBe(500);

    const payload = await response.json() as {
      error: { message: string };
    };
    expect(payload.error.message).toBe("Cache load failed");
  });
});

