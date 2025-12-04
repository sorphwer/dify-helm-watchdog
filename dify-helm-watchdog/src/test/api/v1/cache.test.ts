import { GET } from "@/app/api/v1/cache/route";
import { loadCache } from "@/lib/helm";

jest.mock("@/lib/helm", () => ({
  loadCache: jest.fn(),
}));

const mockedLoadCache = loadCache as jest.MockedFunction<typeof loadCache>;

describe("GET /api/v1/cache", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.resetAllMocks();
  });

  it("should return empty cache when cache is null", async () => {
    mockedLoadCache.mockResolvedValueOnce(null);

    const request = new Request("http://localhost/api/v1/cache");
    const response = await GET(request);

    expect(response.status).toBe(200);

    const payload = await response.json() as {
      updateTime: string | null;
      versions: unknown[];
    };

    expect(payload).toEqual({
      updateTime: null,
      versions: [],
    });
  });

  it("should return full cache with all version data", async () => {
    const mockCache = {
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
            inline: "global:\n  image:\n    tag: 0.10.0",
          },
          images: {
            path: "images/2.5.0.yaml",
            url: "https://example.com/images-2.5.0.yaml",
            hash: "images-hash-1",
            inline: "api:\n  repository: langgenius/dify-api\n  tag: 0.10.0",
          },
          imageValidation: {
            path: "validation/2.5.0.json",
            url: "https://example.com/validation-2.5.0.json",
            hash: "validation-hash-1",
            inline: '{"images":[]}',
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
    };

    mockedLoadCache.mockResolvedValueOnce(mockCache);

    const request = new Request("http://localhost/api/v1/cache");
    const response = await GET(request);

    expect(response.status).toBe(200);

    const payload = await response.json() as typeof mockCache;

    expect(payload).toEqual(mockCache);
    expect(payload.updateTime).toBe("2024-01-01T00:00:00.000Z");
    expect(payload.versions).toHaveLength(2);
    expect(payload.versions[0].version).toBe("2.5.0");
    expect(payload.versions[0].values.inline).toBe("global:\n  image:\n    tag: 0.10.0");
    expect(payload.versions[0].imageValidation?.inline).toBe('{"images":[]}');
    expect(payload.versions[1].version).toBe("2.4.0");
  });

  it("should include inline content when available", async () => {
    const inlineValuesContent = "global:\n  debug: true";
    const inlineImagesContent = "api:\n  repository: test/api\n  tag: latest";
    const inlineValidationContent = '{"images":[{"status":"ALL_FOUND"}]}';

    mockedLoadCache.mockResolvedValueOnce({
      updateTime: "2024-01-01T00:00:00.000Z",
      versions: [
        {
          version: "3.0.0",
          appVersion: "1.0.0",
          createTime: "2024-01-15T00:00:00.000Z",
          chartUrl: "https://example.com/chart-3.0.0.tgz",
          digest: "sha256:ghi789",
          values: {
            path: "values/3.0.0.yaml",
            url: "https://example.com/values-3.0.0.yaml",
            hash: "values-hash-3",
            inline: inlineValuesContent,
          },
          images: {
            path: "images/3.0.0.yaml",
            url: "https://example.com/images-3.0.0.yaml",
            hash: "images-hash-3",
            inline: inlineImagesContent,
          },
          imageValidation: {
            path: "validation/3.0.0.json",
            url: "https://example.com/validation-3.0.0.json",
            hash: "validation-hash-3",
            inline: inlineValidationContent,
          },
        },
      ],
    });

    const request = new Request("http://localhost/api/v1/cache");
    const response = await GET(request);

    expect(response.status).toBe(200);

    const payload = await response.json() as {
      versions: Array<{
        version: string;
        values: { inline?: string };
        images: { inline?: string };
        imageValidation?: { inline?: string };
      }>;
    };

    expect(payload.versions[0].values.inline).toBe(inlineValuesContent);
    expect(payload.versions[0].images.inline).toBe(inlineImagesContent);
    expect(payload.versions[0].imageValidation?.inline).toBe(inlineValidationContent);
  });

  it("should handle versions without imageValidation", async () => {
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

    const request = new Request("http://localhost/api/v1/cache");
    const response = await GET(request);

    expect(response.status).toBe(200);

    const payload = await response.json() as {
      versions: Array<{
        imageValidation?: unknown;
      }>;
    };

    expect(payload.versions[0].imageValidation).toBeUndefined();
  });

  it("should handle versions with null optional fields", async () => {
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

    const request = new Request("http://localhost/api/v1/cache");
    const response = await GET(request);

    expect(response.status).toBe(200);

    const payload = await response.json() as {
      versions: Array<{
        version: string;
        appVersion: string | null;
        createTime: string | null;
        digest?: string;
      }>;
    };

    expect(payload.versions[0].appVersion).toBeNull();
    expect(payload.versions[0].createTime).toBeNull();
    expect(payload.versions[0].digest).toBeUndefined();
  });

  it("should return empty versions array when cache has no versions", async () => {
    mockedLoadCache.mockResolvedValueOnce({
      updateTime: "2024-01-01T00:00:00.000Z",
      versions: [],
    });

    const request = new Request("http://localhost/api/v1/cache");
    const response = await GET(request);

    expect(response.status).toBe(200);

    const payload = await response.json() as {
      updateTime: string;
      versions: unknown[];
    };

    expect(payload.updateTime).toBe("2024-01-01T00:00:00.000Z");
    expect(payload.versions).toEqual([]);
  });
});

