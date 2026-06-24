import { GET } from "@/app/api/v1/versions/[version]/images/route";
import { loadCache } from "@/lib/helm";
import type { CachePayload } from "@/lib/types";
import YAML from "yaml";

jest.mock("@/lib/helm", () => ({
  loadCache: jest.fn(),
}));

const mockedLoadCache = loadCache as jest.MockedFunction<typeof loadCache>;

// `worker` deliberately shares the `dify-ee-api` repository with `api`; `redis`
// is a third-party image with no component in the lock.
const IMAGES_YAML = `api:
  repository: langgenius/dify-ee-api
  tag: 3.9.6
gateway:
  repository: langgenius/dify-ee-gateway
  tag: 3.9.6
worker:
  repository: langgenius/dify-ee-api
  tag: 3.9.6
redis:
  repository: langgenius/redis
  tag: 6.2.16
`;

const LOCK_YAML = `version: 3.9.6
releaseTrack: lts
sources:
  - id: dify
    repo: https://github.com/langgenius/dify.git
    ref: lts/1.13.x
    ref_type: branch
    commit: 18211c159ed2af9fbf7b03a025db04c1f6dcc068
  - id: dify-enterprise
    repo: https://github.com/langgenius/dify-enterprise.git
    ref: lts/0.16.x
    ref_type: branch
    commit: 57bb36dd499e28888bc9b673af3d8e33528fa2e3
components:
  - id: api
    source: dify
    image: langgenius/dify-ee-api
  - id: gateway
    source: dify-enterprise
    image: langgenius/dify-ee-gateway
`;

const cacheWith396 = (): CachePayload =>
  ({
    updateTime: null,
    versions: [
      {
        version: "3.9.6",
        appVersion: "3.9.6",
        images: {
          path: "helm-watchdog/images/3.9.6.yaml",
          url: "https://r2.example/helm-watchdog/images/3.9.6.yaml",
          hash: "h",
          inline: IMAGES_YAML,
        },
        values: {
          path: "helm-watchdog/values/3.9.6.yaml",
          url: "https://r2.example/helm-watchdog/values/3.9.6.yaml",
          hash: "h2",
        },
      },
    ],
  }) as unknown as CachePayload;

type ImageEntry = {
  path: string;
  repository: string;
  tag: string;
  repo?: string;
  ref?: string;
  ref_type?: string;
  commit?: string;
};

describe("GET /api/v1/versions/{version}/images — release-lock enrichment", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.resetAllMocks();
  });

  const serveLock = (lock: { ok: boolean; status: number; text?: string }) => {
    global.fetch = jest.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/release-locks/3.9.6.yaml")) {
        return Promise.resolve({
          ok: lock.ok,
          status: lock.status,
          text: async () => lock.text ?? "",
        });
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    }) as unknown as typeof fetch;
  };

  it("adds repo/ref/ref_type/commit to images built from Dify source (json)", async () => {
    mockedLoadCache.mockResolvedValue(cacheWith396());
    serveLock({ ok: true, status: 200, text: LOCK_YAML });

    const response = await GET(
      new Request("http://localhost/api/v1/versions/3.9.6/images?format=json"),
      { params: Promise.resolve({ version: "3.9.6" }) },
    );
    expect(response.status).toBe(200);

    const body = (await response.json()) as { images: ImageEntry[] };
    const byPath = Object.fromEntries(body.images.map((i) => [i.path, i]));

    expect(byPath.api).toMatchObject({
      repo: "https://github.com/langgenius/dify.git",
      ref: "lts/1.13.x",
      ref_type: "branch",
      commit: "18211c159ed2af9fbf7b03a025db04c1f6dcc068",
    });
    // Shares the dify-ee-api repository, so inherits the same source ref.
    expect(byPath.worker.commit).toBe(
      "18211c159ed2af9fbf7b03a025db04c1f6dcc068",
    );
    expect(byPath.gateway.commit).toBe(
      "57bb36dd499e28888bc9b673af3d8e33528fa2e3",
    );
    // Third-party image: no source ref fields.
    expect(byPath.redis.commit).toBeUndefined();
    expect(byPath.redis.repo).toBeUndefined();
  });

  it("includes the source refs in the yaml output", async () => {
    mockedLoadCache.mockResolvedValue(cacheWith396());
    serveLock({ ok: true, status: 200, text: LOCK_YAML });

    const response = await GET(
      new Request("http://localhost/api/v1/versions/3.9.6/images?format=yaml"),
      { params: Promise.resolve({ version: "3.9.6" }) },
    );
    expect(response.status).toBe(200);

    const text = await response.text();
    const parsed = YAML.parse(text) as Record<string, ImageEntry>;
    expect(parsed.gateway.ref_type).toBe("branch");
    expect(parsed.gateway.commit).toBe(
      "57bb36dd499e28888bc9b673af3d8e33528fa2e3",
    );
    expect(parsed.redis.commit).toBeUndefined();
  });

  it("degrades to plain images when the lock cannot be loaded", async () => {
    mockedLoadCache.mockResolvedValue(cacheWith396());
    serveLock({ ok: false, status: 500 });

    const response = await GET(
      new Request("http://localhost/api/v1/versions/3.9.6/images?format=json"),
      { params: Promise.resolve({ version: "3.9.6" }) },
    );
    expect(response.status).toBe(200);

    const body = (await response.json()) as { images: ImageEntry[] };
    const api = body.images.find((i) => i.path === "api");
    expect(api?.repository).toBe("langgenius/dify-ee-api");
    expect(api?.commit).toBeUndefined();
  });

  it("falls back to plain repository/tag when the lock file is gone from R2 (404)", async () => {
    mockedLoadCache.mockResolvedValue(cacheWith396());
    serveLock({ ok: false, status: 404 });

    const response = await GET(
      new Request("http://localhost/api/v1/versions/3.9.6/images?format=json"),
      { params: Promise.resolve({ version: "3.9.6" }) },
    );
    expect(response.status).toBe(200);

    const body = (await response.json()) as { images: ImageEntry[] };
    expect(body.images.length).toBeGreaterThan(0);
    for (const image of body.images) {
      expect(image.repository).toBeTruthy();
      expect(image.tag).toBeTruthy();
      expect(image.repo).toBeUndefined();
      expect(image.ref).toBeUndefined();
      expect(image.ref_type).toBeUndefined();
      expect(image.commit).toBeUndefined();
    }
  });
});
