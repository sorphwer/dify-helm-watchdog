import type { SyncOptions, SyncResult } from "@/lib/helm";
import type {
  CachePayload,
  HeadResult,
  ImageValidationPayload,
  StoredAsset,
} from "@/lib/types";

const HELM_INDEX_URL = "https://langgenius.github.io/dify-helm/index.yaml";
const MIRROR_INDEX_URL =
  "https://g-hsod9681-helm.pkg.coding.net/dify-artifact/dify-helm/index.yaml";
const BLOB_BASE = "https://blob.test";

// In-memory blob store shared by the storage mock. Keys are storage paths.
const mockFiles = new Map<string, string>();

const asset = (path: string): StoredAsset => ({
  path,
  url: `${BLOB_BASE}/${path}`,
  hash: "hash",
});

jest.mock("@/services/storage", () => ({
  createStorageService: () => ({
    ensureAccess: async () => {},
    read: async (path: string): Promise<HeadResult | null> => {
      if (!mockFiles.has(path)) return null;
      return {
        url: `${BLOB_BASE}/${path}`,
        pathname: path,
        size: mockFiles.get(path)!.length,
        uploadedAt: new Date(),
        downloadUrl: `${BLOB_BASE}/${path}`,
      };
    },
    readContent: async (url: string): Promise<string> => {
      const key = url.replace(`${BLOB_BASE}/`, "");
      const content = mockFiles.get(key);
      if (content === undefined) throw new Error(`missing blob: ${url}`);
      return content;
    },
    write: async (path: string, content: string): Promise<StoredAsset> => {
      mockFiles.set(path, content);
      return asset(path);
    },
  }),
}));

const HELM_INDEX_YAML = `apiVersion: v1
entries:
  dify:
  - apiVersion: v2
    version: 2.8.0
    appVersion: "1.0.0"
    created: "2024-01-01T00:00:00Z"
    urls:
    - dify-2.8.0.tgz
`;

const mirrorIndexYaml = (versions: string[]) =>
  [
    "apiVersion: v1",
    "entries:",
    "  dify:",
    ...versions.flatMap((version) => [
      "  - apiVersion: v2",
      `    version: ${version}`,
    ]),
    "",
  ].join("\n");

const textResponse = (body: string) =>
  ({ ok: true, status: 200, text: async () => body }) as Response;

let mirrorVersions: string[] = [];

const routeFetch = (input: RequestInfo | URL): Response => {
  const url = String(input);
  if (url === HELM_INDEX_URL) return textResponse(HELM_INDEX_YAML);
  if (url === MIRROR_INDEX_URL)
    return textResponse(mirrorIndexYaml(mirrorVersions));
  // Docs sidebar and ee.dify.ai release feed: empty payloads keep the
  // status map empty without exercising those code paths.
  if (url.includes("_sidebar.md")) return textResponse("");
  return textResponse(JSON.stringify({ version: "https://jsonfeed.org/version/1.1", items: [] }));
};

const seedCache = (chartMirrorStatus?: "FOUND" | "MISSING" | "ERROR") => {
  const validation: ImageValidationPayload = {
    version: "2.8.0",
    checkTime: "2024-01-01T00:00:00.000Z",
    host: "g-hsod9681-docker.pkg.coding.net",
    namespace: "dify-artifact/dify",
    images: [],
    chartMirror: {
      repoUrl:
        "https://g-hsod9681-helm.pkg.coding.net/dify-artifact/dify-helm",
      status: chartMirrorStatus ?? "MISSING",
      checkTime: "2024-01-01T00:00:00.000Z",
    },
  };
  const cache: CachePayload & { versions: Array<Record<string, unknown>> } = {
    updateTime: "2024-01-01T00:00:00.000Z",
    versions: [
      {
        version: "2.8.0",
        appVersion: "1.0.0",
        createTime: "2024-01-01T00:00:00.000Z",
        chartUrl: "https://langgenius.github.io/dify-helm/dify-2.8.0.tgz",
        values: asset("helm-watchdog/values/2.8.0.yaml"),
        images: asset("helm-watchdog/images/2.8.0.yaml"),
        imageValidation: asset("helm-watchdog/image-validation/2.8.0.json"),
        ...(chartMirrorStatus ? { chartMirrorStatus } : {}),
      },
    ],
  };
  mockFiles.set("helm-watchdog/cache.json", JSON.stringify(cache));
  mockFiles.set(
    "helm-watchdog/image-validation/2.8.0.json",
    JSON.stringify(validation),
  );
};

const readStoredValidation = (): ImageValidationPayload =>
  JSON.parse(
    mockFiles.get("helm-watchdog/image-validation/2.8.0.json")!,
  ) as ImageValidationPayload;

const readStoredManifest = (): CachePayload =>
  JSON.parse(mockFiles.get("helm-watchdog/cache.json")!) as CachePayload;

describe("syncHelmData mirror re-check for cached versions", () => {
  const originalEnv = process.env;
  let syncHelmData: (options?: SyncOptions) => Promise<SyncResult>;

  beforeAll(() => {
    process.env = {
      ...originalEnv,
      VERCEL: "1",
      DISABLE_LOCAL_CACHE: "true",
      ENABLE_LOCAL_MODE: "false",
    };
    global.fetch = jest.fn(async (input: RequestInfo | URL) =>
      routeFetch(input),
    ) as unknown as typeof fetch;
    jest.resetModules();
    // Deferred require so the module-level env checks in helm.ts see the
    // test environment above.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    ({ syncHelmData } = require("@/lib/helm"));
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  beforeEach(() => {
    mockFiles.clear();
  });

  it("flips a cached MISSING mirror status to FOUND once the mirror catches up", async () => {
    seedCache("MISSING");
    mirrorVersions = ["2.8.0"];

    const result = await syncHelmData();

    expect(result.created).toBe(0);
    const validation = readStoredValidation();
    expect(validation.chartMirror?.status).toBe("FOUND");
    const manifest = readStoredManifest();
    expect(manifest.versions[0]).toMatchObject({
      version: "2.8.0",
      chartMirrorStatus: "FOUND",
    });
  });

  it("re-checks and bumps checkTime when the version is still missing", async () => {
    seedCache("MISSING");
    mirrorVersions = [];

    await syncHelmData();

    const validation = readStoredValidation();
    expect(validation.chartMirror?.status).toBe("MISSING");
    expect(validation.chartMirror?.checkTime).not.toBe(
      "2024-01-01T00:00:00.000Z",
    );
  });

  it("re-checks legacy manifests without a chartMirrorStatus field", async () => {
    seedCache(undefined);
    mirrorVersions = ["2.8.0"];

    await syncHelmData();

    expect(readStoredValidation().chartMirror?.status).toBe("FOUND");
    expect(readStoredManifest().versions[0]).toMatchObject({
      chartMirrorStatus: "FOUND",
    });
  });

  it("flips FOUND back to MISSING when the mirror drops the version", async () => {
    seedCache("FOUND");
    mirrorVersions = [];

    await syncHelmData();

    expect(readStoredValidation().chartMirror?.status).toBe("MISSING");
    expect(readStoredManifest().versions[0]).toMatchObject({
      chartMirrorStatus: "MISSING",
    });
  });

  it("leaves versions untouched when stored and mirror both say FOUND", async () => {
    seedCache("FOUND");
    mirrorVersions = ["2.8.0"];
    const before = mockFiles.get("helm-watchdog/image-validation/2.8.0.json");

    await syncHelmData();

    expect(mockFiles.get("helm-watchdog/image-validation/2.8.0.json")).toBe(
      before,
    );
  });
});
