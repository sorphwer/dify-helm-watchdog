import { GET } from "@/app/api/v1/versions/route";
import { loadCache } from "@/lib/helm";

jest.mock("@/lib/helm", () => ({
  loadCache: jest.fn(),
}));

const mockedLoadCache = loadCache as jest.MockedFunction<typeof loadCache>;

describe("GET /api/v1/versions", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.resetAllMocks();
  });

  it("should return empty cache result and set cache headers", async () => {
    mockedLoadCache.mockResolvedValueOnce(null);

    const request = new Request("http://localhost/api/v1/versions");
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(
      "public, s-maxage=3600, stale-while-revalidate=86400",
    );

    const payload = (await response.json()) as unknown;
    expect(payload).toEqual({
      updateTime: null,
      total: 0,
      versions: [],
    });
  });

  it("should return version summary by default without validation data", async () => {
    mockedLoadCache.mockResolvedValueOnce({
      updateTime: "2024-01-01T00:00:00.000Z",
      versions: [
        {
          version: "1.0.0",
          appVersion: "1.0.0",
          createTime: "2024-01-01T00:00:00.000Z",
          chartUrl: "https://example.com/chart.tgz",
          digest: "sha256:123",
          values: {
            path: "values/1.0.0.yaml",
            url: "https://example.com/values.yaml",
            hash: "values-hash",
          },
          images: {
            path: "images/1.0.0.yaml",
            url: "https://example.com/images.yaml",
            hash: "images-hash",
          },
        },
      ],
    });

    const request = new Request("http://localhost/api/v1/versions");
    const response = await GET(request);
    const payload = (await response.json()) as {
      updateTime: string | null;
      total: number;
      versions: Array<Record<string, unknown>>;
    };

    expect(payload).toEqual({
      updateTime: "2024-01-01T00:00:00.000Z",
      total: 1,
      versions: [
        {
          version: "1.0.0",
          appVersion: "1.0.0",
          createTime: "2024-01-01T00:00:00.000Z",
          digest: "sha256:123",
        },
      ],
    });
  });

  it("should aggregate image validation status when request includes includeValidation=true", async () => {
    const imageValidationInline = JSON.stringify({
      images: [
        { status: "ALL_FOUND" },
        { status: "PARTIAL" },
        { status: "MISSING" },
        { status: "ERROR" },
      ],
    });

    mockedLoadCache.mockResolvedValueOnce({
      updateTime: "2024-02-01T00:00:00.000Z",
      versions: [
        {
          version: "2.0.0",
          appVersion: null,
          createTime: null,
          chartUrl: "https://example.com/chart-2.0.0.tgz",
          digest: undefined,
          values: {
            path: "values/2.0.0.yaml",
            url: "https://example.com/values-2.0.0.yaml",
            hash: "values-hash-2",
          },
          images: {
            path: "images/2.0.0.yaml",
            url: "https://example.com/images-2.0.0.yaml",
            hash: "images-hash-2",
          },
          imageValidation: {
            path: "validation/2.0.0.json",
            url: "https://example.com/validation-2.0.0.json",
            hash: "validation-hash-2",
            inline: imageValidationInline,
          },
        },
      ],
    });

    const fetchSpy = jest
      .spyOn(global, "fetch")
      .mockRejectedValue(new Error("fetch should not be called"));

    const request = new Request(
      "http://localhost/api/v1/versions?includeValidation=true",
    );
    const response = await GET(request);
    const payload = (await response.json()) as {
      versions: Array<{
        version: string;
        imageValidation?: {
          total: number;
          allFound: number;
          partial: number;
          missing: number;
          error: number;
        };
      }>;
    };

    expect(payload.versions[0]).toMatchObject({
      version: "2.0.0",
      imageValidation: {
        total: 4,
        allFound: 1,
        partial: 1,
        missing: 1,
        error: 1,
      },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

