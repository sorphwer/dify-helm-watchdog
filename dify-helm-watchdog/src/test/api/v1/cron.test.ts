import { POST } from "@/app/api/v1/cron/route";
import { syncHelmData, MissingBlobTokenError } from "@/lib/helm";
import { revalidatePath } from "next/cache";

jest.mock("@/lib/helm", () => ({
  syncHelmData: jest.fn(),
  MissingBlobTokenError: class MissingBlobTokenError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "MissingBlobTokenError";
    }
  },
}));

jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
}));

const mockedSyncHelmData = syncHelmData as jest.MockedFunction<typeof syncHelmData>;

describe("POST /api/v1/cron", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env.CRON_AUTH_SECRET;
    delete process.env.ENABLE_CACHE_WARMUP;
    delete process.env.VERCEL_URL;
    delete process.env.NEXT_PUBLIC_SITE_URL;
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
    jest.resetAllMocks();
  });

  const streamToText = async (response: Response): Promise<string> => {
    const reader = response.body?.getReader();
    if (!reader) return "";

    const decoder = new TextDecoder();
    let result = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      result += decoder.decode(value, { stream: true });
    }

    return result;
  };

  it("should allow request with x-vercel-cron header without secret", async () => {
    mockedSyncHelmData.mockResolvedValueOnce({
      processed: 1,
      created: 1,
      refreshed: [],
      skipped: 0,
      versions: ["2.5.0"],
      updateTime: "2024-01-01T00:00:00.000Z",
    });

    const request = new Request("http://localhost/api/v1/cron", {
      method: "POST",
      headers: {
        "x-vercel-cron": "true",
      },
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(response.headers.get("Cache-Control")).toBe("no-store");

    const text = await streamToText(response);
    expect(text).toContain("== dify-helm-watchdog cron ==");
    expect(text).toContain("[status] ok");
    expect(text).toContain("processed=1");
    expect(text).toContain("created=1");
    expect(text).toContain("new_versions=v2.5.0");
  });

  it("should return 401 when secret is required but not provided", async () => {
    process.env.CRON_AUTH_SECRET = "my-secret-key";

    const request = new Request("http://localhost/api/v1/cron", {
      method: "POST",
    });

    const response = await POST(request);

    expect(response.status).toBe(401);

    const payload = await response.json() as {
      error: { message: string };
    };
    expect(payload.error.message).toBe("Invalid or missing secret header");
  });

  it("should return 401 when secret is incorrect", async () => {
    process.env.CRON_AUTH_SECRET = "my-secret-key";

    const request = new Request("http://localhost/api/v1/cron", {
      method: "POST",
      headers: {
        secret: "wrong-secret",
      },
    });

    const response = await POST(request);

    expect(response.status).toBe(401);

    const payload = await response.json() as {
      error: { message: string };
    };
    expect(payload.error.message).toBe("Invalid or missing secret header");
  });

  it("should allow request with correct secret", async () => {
    process.env.CRON_AUTH_SECRET = "my-secret-key";

    mockedSyncHelmData.mockResolvedValueOnce({
      processed: 1,
      created: 1,
      refreshed: [],
      skipped: 0,
      versions: ["2.5.0"],
      updateTime: "2024-01-01T00:00:00.000Z",
    });

    const request = new Request("http://localhost/api/v1/cron", {
      method: "POST",
      headers: {
        secret: "my-secret-key",
      },
    });

    const response = await POST(request);

    expect(response.status).toBe(200);

    const text = await streamToText(response);
    expect(text).toContain("[status] ok");
  });

  it("should stream sync progress logs", async () => {
    const mockLogs: string[] = [];
    mockedSyncHelmData.mockImplementation(async (options) => {
      const log = options?.log || (() => {});
      log("Fetching chart index...");
      mockLogs.push("Fetching chart index...");
      log("Processing version 2.5.0...");
      mockLogs.push("Processing version 2.5.0...");
      log("Validating images...");
      mockLogs.push("Validating images...");

      return {
        processed: 1,
        created: 1,
        refreshed: [],
        skipped: 0,
        versions: ["2.5.0"],
        updateTime: "2024-01-01T00:00:00.000Z",
      };
    });

    const request = new Request("http://localhost/api/v1/cron", {
      method: "POST",
      headers: {
        "x-vercel-cron": "true",
      },
    });

    const response = await POST(request);

    expect(response.status).toBe(200);

    const text = await streamToText(response);
    expect(text).toContain("== dify-helm-watchdog cron ==");
    expect(text).toContain("[sync] Fetching chart index...");
    expect(text).toContain("[sync] Processing version 2.5.0...");
    expect(text).toContain("[sync] Validating images...");
    expect(text).toContain("[status] ok");
    expect(mockLogs).toHaveLength(3);
  });

  it("should handle forceVersions query parameter", async () => {
    let capturedOptions: { forceVersions?: string[] } = {};

    mockedSyncHelmData.mockImplementation(async (options) => {
      if (options) {
        capturedOptions = options;
      }
      return {
        processed: 2,
        created: 0,
        refreshed: ["2.5.0", "2.4.0"],
        skipped: 0,
        versions: [],
        updateTime: "2024-01-01T00:00:00.000Z",
      };
    });

    const request = new Request(
      "http://localhost/api/v1/cron?version=2.5.0&version=v2.4.0,2.3.0",
      {
        method: "POST",
        headers: {
          "x-vercel-cron": "true",
        },
      },
    );

    const response = await POST(request);

    expect(response.status).toBe(200);

    const text = await streamToText(response);
    expect(text).toContain("[input] force_versions=v2.5.0, v2.4.0, v2.3.0");
    expect(text).toContain("refreshed=2");
    expect(text).toContain("refreshed_versions=v2.5.0, v2.4.0");
    expect(capturedOptions.forceVersions).toEqual(["2.5.0", "2.4.0", "2.3.0"]);
  });

  it("should report when no new versions are detected", async () => {
    mockedSyncHelmData.mockResolvedValueOnce({
      processed: 3,
      created: 0,
      refreshed: [],
      skipped: 3,
      versions: [],
      updateTime: "2024-01-01T00:00:00.000Z",
    });

    const request = new Request("http://localhost/api/v1/cron", {
      method: "POST",
      headers: {
        "x-vercel-cron": "true",
      },
    });

    const response = await POST(request);

    expect(response.status).toBe(200);

    const text = await streamToText(response);
    expect(text).toContain("[result] processed=3");
    expect(text).toContain("created=0");
    expect(text).toContain("skipped=3");
    expect(text).toContain("[result] no new versions detected");
  });

  it("should handle MissingBlobTokenError gracefully", async () => {
    mockedSyncHelmData.mockRejectedValueOnce(
      new MissingBlobTokenError(),
    );

    const request = new Request("http://localhost/api/v1/cron", {
      method: "POST",
      headers: {
        "x-vercel-cron": "true",
      },
    });

    const response = await POST(request);

    expect(response.status).toBe(200);

    const text = await streamToText(response);
    expect(text).toContain("[error] Blob storage token is not configured");
    expect(text).toContain("[status] failed");
  });

  it("should handle generic errors", async () => {
    mockedSyncHelmData.mockRejectedValueOnce(new Error("Network connection failed"));

    const request = new Request("http://localhost/api/v1/cron", {
      method: "POST",
      headers: {
        "x-vercel-cron": "true",
      },
    });

    const response = await POST(request);

    expect(response.status).toBe(200);

    const text = await streamToText(response);
    expect(text).toContain("[error] Network connection failed");
    expect(text).toContain("[status] failed");
  });

  it("should handle unknown errors", async () => {
    mockedSyncHelmData.mockRejectedValueOnce("Unknown error");

    const request = new Request("http://localhost/api/v1/cron", {
      method: "POST",
      headers: {
        "x-vercel-cron": "true",
      },
    });

    const response = await POST(request);

    expect(response.status).toBe(200);

    const text = await streamToText(response);
    expect(text).toContain("[error] Unknown error occurred while syncing Helm data.");
    expect(text).toContain("[status] failed");
  });

  it("should trigger ISR revalidation on success", async () => {
    mockedSyncHelmData.mockResolvedValueOnce({
      processed: 1,
      created: 1,
      refreshed: [],
      skipped: 0,
      versions: ["2.5.0"],
      updateTime: "2024-01-01T00:00:00.000Z",
    });

    const request = new Request("http://localhost/api/v1/cron", {
      method: "POST",
      headers: {
        "x-vercel-cron": "true",
      },
    });

    const response = await POST(request);

    expect(response.status).toBe(200);

    const text = await streamToText(response);
    expect(text).toContain("[revalidate] Triggering ISR revalidation for homepage...");
    expect(text).toContain("[revalidate] Successfully cleared ISR cache for homepage");
    expect(revalidatePath).toHaveBeenCalledWith("/", "page");
  });

  it("should skip cache warmup when ENABLE_CACHE_WARMUP is false", async () => {
    process.env.ENABLE_CACHE_WARMUP = "false";

    mockedSyncHelmData.mockResolvedValueOnce({
      processed: 1,
      created: 1,
      refreshed: [],
      skipped: 0,
      versions: ["2.5.0"],
      updateTime: "2024-01-01T00:00:00.000Z",
    });

    const request = new Request("http://localhost/api/v1/cron", {
      method: "POST",
      headers: {
        "x-vercel-cron": "true",
      },
    });

    const response = await POST(request);

    expect(response.status).toBe(200);

    const text = await streamToText(response);
    expect(text).toContain(
      "[revalidate] Cache warmup disabled via ENABLE_CACHE_WARMUP=false",
    );
  });

  it("should attempt cache warmup when enabled", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";

    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
    } as Response);

    mockedSyncHelmData.mockResolvedValueOnce({
      processed: 1,
      created: 1,
      refreshed: [],
      skipped: 0,
      versions: ["2.5.0"],
      updateTime: "2024-01-01T00:00:00.000Z",
    });

    const request = new Request("http://localhost/api/v1/cron", {
      method: "POST",
      headers: {
        "x-vercel-cron": "true",
      },
    });

    const response = await POST(request);

    expect(response.status).toBe(200);

    const text = await streamToText(response);
    expect(text).toContain("[revalidate] Warming up cache...");
    expect(text).toContain("[revalidate] Cache warmed up successfully (status: 200)");
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("http://localhost:3000/?_warmup="),
      expect.objectContaining({
        headers: expect.objectContaining({
          "User-Agent": "dify-helm-watchdog-cron",
        }),
      }),
    );
  });

  it("should handle warmup failure gracefully", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";

    const fetchSpy = jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
      } as Response);

    mockedSyncHelmData.mockResolvedValueOnce({
      processed: 1,
      created: 1,
      refreshed: [],
      skipped: 0,
      versions: ["2.5.0"],
      updateTime: "2024-01-01T00:00:00.000Z",
    });

    const request = new Request("http://localhost/api/v1/cron", {
      method: "POST",
      headers: {
        "x-vercel-cron": "true",
      },
    });

    const response = await POST(request);

    expect(response.status).toBe(200);

    const text = await streamToText(response);
    expect(text).toContain("[revalidate] Warning: Warmup returned status 500");
    expect(fetchSpy).toHaveBeenCalled();
  });

  it("should normalize version parameter by removing v prefix", async () => {
    let capturedOptions: { forceVersions?: string[] } = {};

    mockedSyncHelmData.mockImplementation(async (options) => {
      if (options) {
        capturedOptions = options;
      }
      return {
        processed: 1,
        created: 0,
        refreshed: ["2.5.0"],
        skipped: 0,
        versions: [],
        updateTime: "2024-01-01T00:00:00.000Z",
      };
    });

    const request = new Request("http://localhost/api/v1/cron?version=V2.5.0", {
      method: "POST",
      headers: {
        "x-vercel-cron": "true",
      },
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(capturedOptions.forceVersions).toEqual(["2.5.0"]);
  });

  it("should deduplicate version parameters", async () => {
    let capturedOptions: { forceVersions?: string[] } = {};

    mockedSyncHelmData.mockImplementation(async (options) => {
      if (options) {
        capturedOptions = options;
      }
      return {
        processed: 2,
        created: 0,
        refreshed: ["2.5.0"],
        skipped: 0,
        versions: [],
        updateTime: "2024-01-01T00:00:00.000Z",
      };
    });

    const request = new Request(
      "http://localhost/api/v1/cron?version=2.5.0&version=v2.5.0&version=2.5.0",
      {
        method: "POST",
        headers: {
          "x-vercel-cron": "true",
        },
      },
    );

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(capturedOptions.forceVersions).toEqual(["2.5.0"]);

    const text = await streamToText(response);
    expect(text).toContain("[input] force_versions=v2.5.0");
  });
});

