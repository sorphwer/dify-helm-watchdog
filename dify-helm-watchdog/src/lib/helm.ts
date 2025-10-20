import crypto from "node:crypto";
import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createGunzip } from "node:zlib";
import { BlobNotFoundError, head, put } from "@vercel/blob";
import type { HeadBlobResult } from "@vercel/blob";
import tar from "tar-stream";
import YAML from "yaml";
import semver from "semver";
import type {
  CachePayload,
  HelmVersionEntry,
  StoredAsset,
  StoredVersion,
} from "./types";

const HELM_INDEX_URL = "https://langgenius.github.io/dify-helm/index.yaml";
const HELM_REPO_BASE = "https://langgenius.github.io/dify-helm/";
const STORAGE_PREFIX = "helm-watchdog";
const CACHE_PATH = `${STORAGE_PREFIX}/cache.json`;
const VALUES_PREFIX = `${STORAGE_PREFIX}/values`;
const IMAGES_PREFIX = `${STORAGE_PREFIX}/images`;
const LOCAL_CACHE_DIR = path.join(process.cwd(), ".cache", "helm");
const LOCAL_CACHE_PATH = path.join(LOCAL_CACHE_DIR, "cache.json");

// Use local file system cache only in development/local environments
// In production (Vercel), use Blob storage as the primary persistent storage
// Note: Vercel's file system is ephemeral and resets between deployments
const shouldUseLocalCache =
  process.env.VERCEL !== "1" && process.env.DISABLE_LOCAL_CACHE !== "true";

const readLocalCache = async (): Promise<CachePayload | null> => {
  if (!shouldUseLocalCache) {
    return null;
  }

  try {
    const raw = await readFile(LOCAL_CACHE_PATH, "utf-8");
    return JSON.parse(raw) as CachePayload;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return null;
    }

    console.warn("[helm-cache] Failed to read local cache copy", error);
    return null;
  }
};

const writeLocalCache = async (payload: CachePayload): Promise<void> => {
  if (!shouldUseLocalCache) {
    return;
  }

  try {
    await mkdir(LOCAL_CACHE_DIR, { recursive: true });
    await writeFile(
      LOCAL_CACHE_PATH,
      JSON.stringify(payload, null, 2),
      "utf-8",
    );
  } catch (error) {
    console.warn("[helm-cache] Failed to write local cache copy", error);
  }
};

const getLocalAssetPath = (assetPath: string): string => {
  // Remove 'helm-watchdog/' prefix if present to avoid path duplication
  const relativePath = assetPath.replace(/^helm-watchdog\//, "");
  return path.join(LOCAL_CACHE_DIR, relativePath);
};

const writeLocalAsset = async (
  assetPath: string,
  content: string,
): Promise<void> => {
  if (!shouldUseLocalCache) {
    return;
  }

  const destination = getLocalAssetPath(assetPath);

  try {
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, content, "utf-8");
  } catch (error) {
    console.warn(`[helm-cache] Failed to write local asset ${assetPath}`, error);
  }
};

const readLocalAsset = async (assetPath: string): Promise<string | null> => {
  if (!shouldUseLocalCache) {
    return null;
  }

  try {
    return await readFile(getLocalAssetPath(assetPath), "utf-8");
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return null;
    }

    console.warn(`[helm-cache] Failed to read local asset ${assetPath}`, error);
    return null;
  }
};

const ensureLocalAssetCopy = async (
  asset: StoredAsset,
  inlineContent?: string,
): Promise<void> => {
  if (!shouldUseLocalCache) {
    return;
  }

  const existing = await readLocalAsset(asset.path);
  if (existing) {
    return;
  }

  try {
    const content =
      inlineContent ??
      (await (async () => {
        const response = await fetch(asset.url);
        if (!response.ok) {
          throw new Error(
            `Failed to download asset ${asset.url}: ${response.status} ${response.statusText}`,
          );
        }
        return await response.text();
      })());

    await writeLocalAsset(asset.path, content);
  } catch (error) {
    console.warn(
      `[helm-cache] Failed to ensure local copy for ${asset.path}`,
      error,
    );
  }
};

const attachLocalAssetContent = async (
  payload: CachePayload,
): Promise<CachePayload> => {
  if (!shouldUseLocalCache) {
    return payload;
  }

  const versions = await Promise.all(
    payload.versions.map(async (version) => {
      const [valuesInline, imagesInline] = await Promise.all([
        readLocalAsset(version.values.path),
        readLocalAsset(version.images.path),
      ]);

      return {
        ...version,
        values: {
          ...version.values,
          inline: valuesInline ?? undefined,
        },
        images: {
          ...version.images,
          inline: imagesInline ?? undefined,
        },
      };
    }),
  );

  return {
    ...payload,
    versions,
  };
};

const sanitizeAsset = (asset: StoredAsset): StoredAsset => ({
  path: asset.path,
  url: asset.url,
  hash: asset.hash,
});

const sanitizeCachePayload = (payload: CachePayload): CachePayload => ({
  lastUpdated: payload.lastUpdated,
  versions: payload.versions.map((version) => ({
    ...version,
    values: sanitizeAsset(version.values),
    images: sanitizeAsset(version.images),
  })),
});

export interface SyncResult {
  processed: number;
  created: number;
  skipped: number;
  versions: string[];
  lastUpdated: string;
}

export interface SyncOptions {
  log?: (message: string) => void;
}

export class MissingBlobTokenError extends Error {
  constructor() {
    super(
      "BLOB_READ_WRITE_TOKEN is not configured. Please create a Vercel Blob store and expose the token before triggering the cron job.",
    );
  }
}

const ensureBlobAccess = async (): Promise<void> => {
  if (process.env.BLOB_READ_WRITE_TOKEN || process.env.VERCEL_BLOB_RW_TOKEN) {
    return;
  }

  // When deployed on Vercel the token is injected automatically, but in local dev we need a safeguard.
  if (!process.env.VERCEL) {
    throw new MissingBlobTokenError();
  }
};

const fetchHelmIndex = async (): Promise<HelmVersionEntry[]> => {
  const response = await fetch(HELM_INDEX_URL, {
    headers: { "User-Agent": "dify-helm-watchdog" },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to download helm index: ${response.statusText}`);
  }

  const indexYaml = await response.text();
  const parsed = YAML.parse(indexYaml) as {
    entries?: Record<string, Array<Record<string, unknown>>>;
  };

  const entries = parsed.entries?.dify ?? [];

  return entries
    .map((entry) => ({
      version: String(entry.version),
      appVersion: entry.appVersion ? String(entry.appVersion) : null,
      created: entry.created ? String(entry.created) : null,
      urls: Array.isArray(entry.urls)
        ? (entry.urls as string[])
        : entry.url
          ? [String(entry.url)]
          : [],
      digest: entry.digest ? String(entry.digest) : undefined,
    }))
    .filter((entry) => entry.version && entry.urls.length > 0);
};

const downloadChartArchive = async (url: string): Promise<Buffer> => {
  const response = await fetch(url, {
    headers: { "User-Agent": "dify-helm-watchdog" },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to download chart archive ${url}: ${response.status} ${response.statusText}`,
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
};

const extractValuesYaml = async (archive: Buffer): Promise<string> => {
  const extract = tar.extract();

  return new Promise<string>((resolve, reject) => {
    let resolved = false;

    extract.on("entry", (header, stream, next) => {
      const normalizedName = header.name.replace(/^\.\//, "");

      if (normalizedName.endsWith("values.yaml")) {
        const chunks: Buffer[] = [];

        stream.on("data", (chunk) => chunks.push(chunk as Buffer));
        stream.on("end", () => {
          resolved = true;
          resolve(Buffer.concat(chunks).toString("utf-8"));
        });
        stream.on("error", reject);
      } else {
        stream.resume();
        stream.on("error", reject);
      }

      stream.on("end", next);
    });

    extract.on("finish", () => {
      if (!resolved) {
        reject(new Error("values.yaml not found in chart archive"));
      }
    });

    extract.on("error", reject);

    const gunzip = createGunzip();
    gunzip.on("error", reject);
    gunzip.pipe(extract);
    gunzip.end(archive);
  });
};

type ImageEntry = {
  repository: string;
  tag: string;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const collectImages = (
  node: unknown,
  path: string[],
  accumulator: Map<string, ImageEntry>,
) => {
  if (Array.isArray(node)) {
    node.forEach((item, index) =>
      collectImages(item, [...path, String(index)], accumulator),
    );
    return;
  }

  if (!isObject(node)) {
    return;
  }

  const imageEntry = node.image;
  if (isObject(imageEntry)) {
    const repositoryRaw = imageEntry.repository;
    const tagRaw = imageEntry.tag;

    if (
      typeof repositoryRaw === "string" &&
      (typeof tagRaw === "string" || typeof tagRaw === "number")
    ) {
      const key = path.join(".") || "root";
      accumulator.set(key, {
        repository: repositoryRaw,
        tag: String(tagRaw),
      });
    }
  }

  for (const [key, value] of Object.entries(node)) {
    if (key === "image") {
      continue;
    }

    collectImages(value, [...path, key], accumulator);
  }
};

const buildImagesYaml = (valuesYaml: string): string => {
  const doc = YAML.parseDocument(valuesYaml, {
    uniqueKeys: false,
  });

  if (doc.errors.length > 0) {
    throw doc.errors[0];
  }

  const parsedValues = doc.toJS({ mapAsMap: false }) ?? {};
  const images = new Map<string, ImageEntry>();
  collectImages(parsedValues, [], images);

  const sortedEntries = Array.from(images.entries()).sort(([a], [b]) => {
    const aValid = semver.valid(a);
    const bValid = semver.valid(b);
    if (aValid && bValid) {
      return semver.compare(aValid, bValid);
    }
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
  });

  const imagesObject = sortedEntries.reduce<Record<string, ImageEntry>>(
    (acc, [key, value]) => {
      acc[key] = value;
      return acc;
    },
    {},
  );

  if (Object.keys(imagesObject).length === 0) {
    return "# No image data found in values.yaml\n";
  }

  return YAML.stringify(imagesObject);
};

const computeHash = (input: string): string =>
  crypto.createHash("sha256").update(input).digest("hex");

const readBlob = async (path: string): Promise<HeadBlobResult | null> => {
  try {
    const metadata = await head(path);
    return metadata;
  } catch (error) {
    if (error instanceof BlobNotFoundError) {
      return null;
    }
    throw error;
  }
};

const fetchBlobContent = async (url: string): Promise<string> => {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "dify-helm-watchdog" },
      // Use 'force-cache' to leverage CDN caching for public blobs
      cache: "force-cache",
    });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch blob content from ${url}: ${response.status} ${response.statusText}`,
      );
    }

    return await response.text();
  } catch (error) {
    console.error(`[helm-cache] Failed to fetch blob content from ${url}`, error);
    throw error;
  }
};

const enrichWithInlineContent = async (
  payload: CachePayload,
): Promise<CachePayload> => {
  // In production (Vercel), preload all YAML content for ISR
  // In development, rely on local file system via attachLocalAssetContent
  if (shouldUseLocalCache) {
    return attachLocalAssetContent(payload);
  }

  console.log("[helm-cache] Preloading inline content for all versions...");

  const enrichedVersions = await Promise.all(
    payload.versions.map(async (version) => {
      try {
        const [valuesContent, imagesContent] = await Promise.all([
          fetchBlobContent(version.values.url),
          fetchBlobContent(version.images.url),
        ]);

        return {
          ...version,
          values: {
            ...version.values,
            inline: valuesContent,
          },
          images: {
            ...version.images,
            inline: imagesContent,
          },
        };
      } catch (error) {
        console.warn(
          `[helm-cache] Failed to enrich version ${version.version}, skipping inline content`,
          error,
        );
        return version;
      }
    }),
  );

  console.log(
    `[helm-cache] Successfully enriched ${enrichedVersions.length} versions`,
  );

  return {
    ...payload,
    versions: enrichedVersions,
  };
};

export const loadCache = async (): Promise<CachePayload | null> => {
  try {
    const localCache = await readLocalCache();
    if (localCache) {
      const sanitizedLocal = sanitizeCachePayload(localCache);
      return enrichWithInlineContent(sanitizedLocal);
    }

    const cacheMetadata = await readBlob(CACHE_PATH);
    if (!cacheMetadata) {
      return null;
    }

    const response = await fetch(cacheMetadata.downloadUrl);
    if (!response.ok) {
      return null;
    }

    const text = await response.text();
    const payload = JSON.parse(text) as CachePayload;
    const sanitizedRemote = sanitizeCachePayload(payload);

    await writeLocalCache(sanitizedRemote);

    // Enrich with inline content for ISR
    // In production: fetches from Blob and embeds in HTML
    // In development: reads from local file system
    return enrichWithInlineContent(sanitizedRemote);
  } catch (error) {
    if (error instanceof MissingBlobTokenError) {
      throw error;
    }

    console.error("[helm-cache] Failed to load cache", error);
    return null;
  }
};

const persistAsset = async (
  path: string,
  content: string,
  contentType: string,
): Promise<StoredAsset> => {
  const hash = computeHash(content);
  const result = await put(path, content, {
    access: "public",
    contentType,
    addRandomSuffix: false,
    allowOverwrite: true,
  });

  // Always write local copy for all assets (including cache.json)
  await writeLocalAsset(result.pathname, content);

  return {
    path: result.pathname,
    url: result.url,
    hash,
  };
};

const toAbsoluteUrl = (url: string): string =>
  new URL(url, HELM_REPO_BASE).toString();

const sortVersions = (versions: StoredVersion[]): StoredVersion[] =>
  [...versions].sort((a, b) => {
    const aVersion = semver.valid(a.version);
    const bVersion = semver.valid(b.version);

    if (aVersion && bVersion) {
      return semver.rcompare(aVersion, bVersion);
    }

    return b.version.localeCompare(a.version, undefined, {
      numeric: true,
      sensitivity: "base",
    });
  });

export const syncHelmData = async (
  options: SyncOptions = {},
): Promise<SyncResult> => {
  const log = options.log ?? (() => {});

  await ensureBlobAccess();

  log("Fetching Helm repository index...");
  const indexEntries = await fetchHelmIndex();
  log(`Retrieved ${indexEntries.length} chart versions from index.`);
  const cache = await loadCache();

  const knownVersions = new Map<string, StoredVersion>(
    cache?.versions.map((entry) => [entry.version, entry]) ?? [],
  );

  const newVersions: StoredVersion[] = [];
  const newVersionPayloads = new Map<string, { values: string; images: string }>();

  for (const entry of indexEntries) {
    if (knownVersions.has(entry.version)) {
      log(`Skipping cached version ${entry.version}`);
      continue;
    }

    log(`Processing new version ${entry.version}`);
    const chartUrl = toAbsoluteUrl(entry.urls[0]);
    log(`Downloading chart archive: ${chartUrl}`);
    const archive = await downloadChartArchive(chartUrl);
    const valuesYaml = await extractValuesYaml(archive);
    const imagesYaml = buildImagesYaml(valuesYaml);

    const valuesPath = `${VALUES_PREFIX}/${entry.version}.yaml`;
    const imagesPath = `${IMAGES_PREFIX}/${entry.version}.yaml`;

    const valuesAsset = await persistAsset(
      valuesPath,
      valuesYaml,
      "application/yaml",
    );
    log(`Stored values.yaml at ${valuesAsset.path}`);
    const imagesAsset = await persistAsset(
      imagesPath,
      imagesYaml,
      "application/yaml",
    );
    log(`Stored docker-images.yaml at ${imagesAsset.path}`);

    const storedVersion: StoredVersion = {
      version: entry.version,
      appVersion: entry.appVersion,
      createdAt: entry.created,
      chartUrl,
      digest: entry.digest,
      values: valuesAsset,
      images: imagesAsset,
    };

    knownVersions.set(entry.version, storedVersion);
    newVersions.push(storedVersion);
    newVersionPayloads.set(entry.version, {
      values: valuesYaml,
      images: imagesYaml,
    });
  }

  const sortedVersions = sortVersions(Array.from(knownVersions.values()));
  const payload: CachePayload = {
    lastUpdated: new Date().toISOString(),
    versions: sortedVersions,
  };
  const manifestDocument = sanitizeCachePayload(payload);

  log(
    `Persisting cache manifest with ${sortedVersions.length} versions to ${CACHE_PATH}`,
  );
  await persistAsset(
    CACHE_PATH,
    JSON.stringify(manifestDocument, null, 2),
    "application/json",
  );

  // Ensure local copies exist for all versions as a fallback
  // For new versions, use in-memory content to avoid re-downloading
  // For existing versions, skip if already cached locally
  if (shouldUseLocalCache) {
    for (const version of sortedVersions) {
      const payloads = newVersionPayloads.get(version.version);
      await ensureLocalAssetCopy(version.values, payloads?.values);
      await ensureLocalAssetCopy(version.images, payloads?.images);
    }
  }

  await writeLocalCache(manifestDocument);

  log("Helm sync completed.");

  return {
    processed: indexEntries.length,
    created: newVersions.length,
    skipped: indexEntries.length - newVersions.length,
    versions: newVersions.map((entry) => entry.version),
    lastUpdated: payload.lastUpdated,
  };
};
