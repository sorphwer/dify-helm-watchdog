import { GET } from "@/app/api/v1/versions/[version]/images/route";
import { loadCache } from "@/lib/helm";

jest.mock("@/lib/helm", () => ({
  loadCache: jest.fn(),
}));

const mockedLoadCache = loadCache as jest.MockedFunction<typeof loadCache>;

describe("GET /api/v1/versions/{version}/images", () => {
  const mockImagesYaml = `
api:
  repository: langgenius/dify-api
  tag: 0.10.0
web:
  repository: langgenius/dify-web
  tag: 0.10.0
worker:
  repository: langgenius/dify-api
  tag: 0.10.0
`;

  const mockValidationJson = JSON.stringify({
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
      {
        sourceRepository: "langgenius/dify-web",
        sourceTag: "0.10.0",
        targetImageName: "langgenius/dify-web:0.10.0",
        status: "PARTIAL",
        variants: [
          { platform: "linux/amd64", digest: "sha256:ghi789", found: true },
          { platform: "linux/arm64", digest: null, found: false },
        ],
      },
    ],
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.resetAllMocks();
  });

  it("should return 404 when cache is not available", async () => {
    mockedLoadCache.mockResolvedValueOnce(null);

    const request = new Request("http://localhost/api/v1/versions/2.5.0/images");
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

    const request = new Request("http://localhost/api/v1/versions/2.6.0/images");
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

  it("should return images list in JSON format without validation", async () => {
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
            inline: mockImagesYaml,
          },
        },
      ],
    });

    const request = new Request("http://localhost/api/v1/versions/2.5.0/images");
    const params = Promise.resolve({ version: "2.5.0" });
    const response = await GET(request, { params });

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(
      "public, s-maxage=3600, stale-while-revalidate=86400",
    );

    const payload = await response.json() as {
      version: string;
      appVersion: string | null;
      total: number;
      images: Array<{
        path: string;
        repository: string;
        tag: string;
        targetImageName?: string;
        validation?: unknown;
      }>;
    };

    expect(payload.version).toBe("2.5.0");
    expect(payload.appVersion).toBe("0.10.0");
    expect(payload.total).toBe(3);
    expect(payload.images).toHaveLength(3);

    const apiImage = payload.images.find((img) => img.path === "api");
    expect(apiImage).toBeDefined();
    expect(apiImage?.repository).toBe("langgenius/dify-api");
    expect(apiImage?.tag).toBe("0.10.0");
    expect(apiImage?.validation).toBeUndefined();
  });

  it("should return images list with validation when includeValidation=true", async () => {
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
            inline: mockImagesYaml,
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

    const request = new Request(
      "http://localhost/api/v1/versions/2.5.0/images?includeValidation=true",
    );
    const params = Promise.resolve({ version: "2.5.0" });
    const response = await GET(request, { params });

    expect(response.status).toBe(200);

    const payload = await response.json() as {
      version: string;
      appVersion: string | null;
      total: number;
      images: Array<{
        path: string;
        repository: string;
        tag: string;
        targetImageName?: string;
        validation?: {
          status: string;
          variants: Array<{
            platform: string;
            digest: string | null;
            found: boolean;
          }>;
        };
      }>;
    };

    expect(payload.images).toHaveLength(3);

    const apiImage = payload.images.find((img) => img.path === "api");
    expect(apiImage).toBeDefined();
    expect(apiImage?.targetImageName).toBe("langgenius/dify-api:0.10.0");
    expect(apiImage?.validation?.status).toBe("ALL_FOUND");
    expect(apiImage?.validation?.variants).toHaveLength(2);

    const webImage = payload.images.find((img) => img.path === "web");
    expect(webImage).toBeDefined();
    expect(webImage?.validation?.status).toBe("PARTIAL");
  });

  it("should support deprecated include_validation parameter", async () => {
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
            inline: mockImagesYaml,
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

    const request = new Request(
      "http://localhost/api/v1/versions/2.5.0/images?include_validation=true",
    );
    const params = Promise.resolve({ version: "2.5.0" });
    const response = await GET(request, { params });

    expect(response.status).toBe(200);

    const payload = await response.json() as {
      images: Array<{
        validation?: unknown;
      }>;
    };

    const imageWithValidation = payload.images.find((img) => img.validation);
    expect(imageWithValidation).toBeDefined();
  });

  it("should return images in YAML format when format=yaml", async () => {
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
            inline: mockImagesYaml,
          },
        },
      ],
    });

    const request = new Request(
      "http://localhost/api/v1/versions/2.5.0/images?format=yaml",
    );
    const params = Promise.resolve({ version: "2.5.0" });
    const response = await GET(request, { params });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/x-yaml; charset=utf-8");
    expect(response.headers.get("Cache-Control")).toBe(
      "public, s-maxage=3600, stale-while-revalidate=86400",
    );

    const yamlText = await response.text();
    expect(yamlText).toContain("api:");
    expect(yamlText).toContain("repository: langgenius/dify-api");
    expect(yamlText).toContain("tag: 0.10.0");
  });

  it("should fetch images from URL when inline is not available", async () => {
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
      text: async () => mockImagesYaml,
    } as Response);

    const request = new Request("http://localhost/api/v1/versions/2.5.0/images");
    const params = Promise.resolve({ version: "2.5.0" });
    const response = await GET(request, { params });

    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledWith("https://example.com/images-2.5.0.yaml");

    const payload = await response.json() as {
      total: number;
      images: Array<unknown>;
    };

    expect(payload.total).toBe(3);
    expect(payload.images).toHaveLength(3);
  });

  it("should return 500 when fetch images fails", async () => {
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

    const request = new Request("http://localhost/api/v1/versions/2.5.0/images");
    const params = Promise.resolve({ version: "2.5.0" });
    const response = await GET(request, { params });

    expect(response.status).toBe(500);
    expect(fetchSpy).toHaveBeenCalledWith("https://example.com/images-2.5.0.yaml");

    const payload = await response.json() as {
      error: { message: string };
    };
    expect(payload.error.message).toBe("Failed to fetch images data");
  });

  it("should gracefully handle missing validation data when includeValidation=true", async () => {
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
            inline: mockImagesYaml,
          },
        },
      ],
    });

    const request = new Request(
      "http://localhost/api/v1/versions/2.5.0/images?includeValidation=true",
    );
    const params = Promise.resolve({ version: "2.5.0" });
    const response = await GET(request, { params });

    expect(response.status).toBe(200);

    const payload = await response.json() as {
      images: Array<{
        validation?: unknown;
      }>;
    };

    payload.images.forEach((img) => {
      expect(img.validation).toBeUndefined();
    });
  });
});

