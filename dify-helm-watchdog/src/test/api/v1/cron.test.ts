import { POST } from "@/app/api/v1/cron/route";
import {
  HELM_CACHE_TAG,
  MissingStorageCredentialsError,
  syncHelmData,
} from "@/lib/helm";
import { revalidatePath, revalidateTag } from "next/cache";
import { after } from "next/server";

jest.mock("@/lib/helm", () => ({
  syncHelmData: jest.fn(),
  HELM_CACHE_TAG: "helm-cache-manifest",
  MissingStorageCredentialsError: class MissingStorageCredentialsError extends Error {
    constructor() {
      super(
        "Storage credentials are not configured. Please set the R2_* environment variables before triggering the cron job.",
      );
      this.name = "MissingStorageCredentialsError";
    }
  },
}));

jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
  revalidateTag: jest.fn(),
}));

// Capture after() callbacks instead of running them so tests can prove the
// revalidation is deferred rather than executed inside the stream body.
jest.mock("next/server", () => ({
  after: jest.fn(),
}));

const mockedAfter = after as jest.MockedFunction<typeof after>;

const mockedSyncHelmData = syncHelmData as jest.MockedFunction<typeof syncHelmData>;

describe("POST /api/v1/cron", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env.CRON_API_KEY;
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
    process.env.CRON_API_KEY = "my-secret-key";

    const request = new Request("http://localhost/api/v1/cron", {
      method: "POST",
    });

    const response = await POST(request);

    expect(response.status).toBe(401);

    const payload = await response.json() as {
      error: { message: string };
    };
    expect(payload.error.message).toBe(
      "Missing or invalid Authorization header. Expected: Bearer <token>",
    );
    expect(response.headers.get("WWW-Authenticate")).toBe('Bearer realm="cron"');
  });

  it("should return 401 when secret is incorrect", async () => {
    process.env.CRON_API_KEY = "my-secret-key";

    const request = new Request("http://localhost/api/v1/cron", {
      method: "POST",
      headers: {
        authorization: "Bearer wrong-secret",
      },
    });

    const response = await POST(request);

    expect(response.status).toBe(401);

    const payload = await response.json() as {
      error: { message: string };
    };
    expect(payload.error.message).toBe("Invalid authorization token");
    expect(response.headers.get("WWW-Authenticate")).toContain('Bearer realm="cron"');
  });

  it("should allow request with correct secret", async () => {
    process.env.CRON_API_KEY = "my-secret-key";

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
        authorization: "Bearer my-secret-key",
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

  it("should handle MissingStorageCredentialsError gracefully", async () => {
    mockedSyncHelmData.mockRejectedValueOnce(
      new MissingStorageCredentialsError(),
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
    expect(text).toContain("[error] Storage credentials are not configured");
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

  it("should defer ISR revalidation until the response closes", async () => {
    let afterRegisteredBeforeSync = false;
    mockedSyncHelmData.mockImplementationOnce(async () => {
      afterRegisteredBeforeSync = mockedAfter.mock.calls.length === 1;
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
    expect(text).toContain(
      "[revalidate] Cache revalidation scheduled; it runs when this log stream closes",
    );
    expect(text).toContain("[status] ok");

    // Registered before the sync so an early client disconnect (which closes
    // the response) cannot outrun it, and nothing is revalidated while the
    // stream is still being produced.
    expect(afterRegisteredBeforeSync).toBe(true);
    expect(mockedAfter).toHaveBeenCalledTimes(1);
    expect(revalidateTag).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();

    // Once Next runs the deferred task, both caches are invalidated.
    const deferred = mockedAfter.mock.calls[0][0];
    expect(typeof deferred).toBe("function");
    await (deferred as () => void | Promise<void>)();
    expect(revalidateTag).toHaveBeenCalledWith(HELM_CACHE_TAG);
    expect(revalidatePath).toHaveBeenCalledWith("/", "page");
  });

  it("should still schedule revalidation when the sync fails", async () => {
    mockedSyncHelmData.mockRejectedValueOnce(new Error("boom"));

    const request = new Request("http://localhost/api/v1/cron", {
      method: "POST",
      headers: {
        "x-vercel-cron": "true",
      },
    });

    const response = await POST(request);
    const text = await streamToText(response);

    expect(text).toContain("[status] failed");
    expect(mockedAfter).toHaveBeenCalledTimes(1);
  });

  it("should report a failed status when after() cannot be registered", async () => {
    mockedAfter.mockImplementationOnce(() => {
      throw new Error("`after` was called outside a request scope");
    });

    const request = new Request("http://localhost/api/v1/cron", {
      method: "POST",
      headers: {
        "x-vercel-cron": "true",
      },
    });

    const response = await POST(request);
    const text = await streamToText(response);

    expect(text).toContain(
      "[error] `after` was called outside a request scope",
    );
    expect(text).toContain("[status] failed");
    expect(mockedSyncHelmData).not.toHaveBeenCalled();
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

