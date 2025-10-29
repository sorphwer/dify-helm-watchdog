import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createGunzip } from "node:zlib";
import tar from "tar-stream";
import YAML from "yaml";
import semver from "semver";
import type {
  CachePayload,
  HelmVersionEntry,
  ImageValidationOverallStatus,
  ImageValidationPayload,
  ImageValidationRecord,
  ImageVariantCheck,
  ImageVariantName,
  ImageVariantStatus,
  StoredAsset,
  StoredVersion,
} from "./types";
import {
  HELM_INDEX_URL,
  HELM_REPO_BASE,
  CACHE_PATH,
  VALUES_PREFIX,
  IMAGES_PREFIX,
  IMAGE_VALIDATION_PREFIX,
  LOCAL_CACHE_DIR_RELATIVE,
  LOCAL_CACHE_PATH_RELATIVE,
  DEFAULT_CODING_REGISTRY_HOST,
  DEFAULT_CODING_REGISTRY_NAMESPACE,
  MANIFEST_ACCEPT_HEADER,
  IMAGE_VARIANT_NAMES,
} from "../constants/helm";
import { createStorageService } from "../services/storage";


const storage = createStorageService();

// Resolve local cache paths to absolute paths
const LOCAL_CACHE_DIR = path.join(process.cwd(), LOCAL_CACHE_DIR_RELATIVE);
const LOCAL_CACHE_PATH = path.join(process.cwd(), LOCAL_CACHE_PATH_RELATIVE);

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
      const [valuesInline, imagesInline, validationInline] = await Promise.all([
        readLocalAsset(version.values.path),
        readLocalAsset(version.images.path),
        version.imageValidation
          ? readLocalAsset(version.imageValidation.path)
          : Promise.resolve(null),
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
        imageValidation: version.imageValidation
          ? {
              ...version.imageValidation,
              inline: validationInline ?? undefined,
            }
          : undefined,
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
    ...(version.imageValidation
      ? { imageValidation: sanitizeAsset(version.imageValidation) }
      : {}),
  })),
});

export interface SyncResult {
  processed: number;
  created: number;
  skipped: number;
  refreshed: string[];
  versions: string[];
  lastUpdated: string;
}

export interface SyncOptions {
  log?: (message: string) => void;
  forceVersions?: string[];
}

export class MissingBlobTokenError extends Error {
  constructor() {
    super(
      "BLOB_READ_WRITE_TOKEN is not configured. Please create a Vercel Blob store and expose the token before triggering the cron job.",
    );
  }
}

const ensureBlobAccess = async (): Promise<void> => {
  return await storage.ensureAccess();
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

const extractImageEntries = (
  valuesYaml: string,
): Array<[string, ImageEntry]> => {
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

  return sortedEntries;
};

const buildImagesYaml = (entries: Array<[string, ImageEntry]>): string => {
  const imagesObject = entries.reduce<Record<string, ImageEntry>>(
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

const resolveTargetImageName = (repository: string): string => {
  const segments = repository.split("/");
  const name = segments[segments.length - 1] ?? repository;
  return name;
};

const CODING_REGISTRY_HOST =
  process.env.CODING_REGISTRY_HOST ?? DEFAULT_CODING_REGISTRY_HOST;
const CODING_REGISTRY_NAMESPACE =
  process.env.CODING_REGISTRY_NAMESPACE ?? DEFAULT_CODING_REGISTRY_NAMESPACE;
const CODING_REGISTRY_AUTH_HEADER =
  process.env.CODING_REGISTRY_AUTH ??
  (process.env.CODING_REGISTRY_USERNAME &&
  process.env.CODING_REGISTRY_PASSWORD
    ? `Basic ${Buffer.from(`${process.env.CODING_REGISTRY_USERNAME}:${process.env.CODING_REGISTRY_PASSWORD}`).toString("base64")}`
    : process.env.CODING_REGISTRY_BEARER_TOKEN
      ? `Bearer ${process.env.CODING_REGISTRY_BEARER_TOKEN}`
      : undefined);


type BearerChallenge = {
  realm: string;
  service?: string;
  scope?: string;
};

const parseBearerChallenge = (header: string | null): BearerChallenge | null => {
  if (!header) {
    return null;
  }

  const trimmed = header.trim();
  if (!trimmed.toLowerCase().startsWith("bearer ")) {
    return null;
  }

  const params = trimmed
    .slice("bearer ".length)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, entry) => {
      // Split only on the first '=' to handle URLs with query parameters
      const equalIndex = entry.indexOf("=");
      if (equalIndex === -1) {
        return acc;
      }
      const key = entry.slice(0, equalIndex);
      const rawValue = entry.slice(equalIndex + 1);
      if (!key || !rawValue) {
        return acc;
      }
      const value = rawValue.replace(/^"|"$/g, "");
      acc[key.toLowerCase()] = value;
      return acc;
    }, {});

  if (!params.realm) {
    return null;
  }

  return {
    realm: params.realm,
    service: params.service,
    scope: params.scope,
  };
};

const registryTokenCache = new Map<string, Promise<string>>();

const resolveRegistryToken = async (
  challenge: BearerChallenge,
  repositoryPath: string,
): Promise<string> => {
  const url = new URL(challenge.realm);

  if (challenge.service) {
    url.searchParams.set("service", challenge.service);
  }

  const scope =
    challenge.scope ?? `repository:${repositoryPath}:pull`;
  url.searchParams.set("scope", scope);

  const cacheKey = `${url.toString()}`;
  const cachedPromise = registryTokenCache.get(cacheKey);
  if (cachedPromise) {
    return cachedPromise;
  }

  const attemptTokenRequest = async (withAuth: boolean = false): Promise<string> => {
    const requestHeaders: Record<string, string> = {
      "User-Agent": "dify-helm-watchdog",
    };
    
    // Add authentication header if requested and available
    if (withAuth && CODING_REGISTRY_AUTH_HEADER) {
      requestHeaders.Authorization = CODING_REGISTRY_AUTH_HEADER;
    }

    const response = await fetch(url.toString(), {
      headers: requestHeaders,
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(
        `Registry token request failed with status ${response.status}`,
      );
    }

    const body = (await response.json()) as {
      token?: string;
      access_token?: string;
    };
    const token = body.token ?? body.access_token;
    if (!token) {
      throw new Error("Registry token response did not include a token");
    }
    return token;
  };

  const request = (async () => {
    try {
      // First attempt: try without authentication (for public registries)
      return await attemptTokenRequest(false);
    } catch (error) {
      // If failed and auth is configured, try with authentication
      if (CODING_REGISTRY_AUTH_HEADER) {
        try {
          return await attemptTokenRequest(true);
        } catch (authError) {
          // If both attempts failed, throw the auth error
          throw authError;
        }
      }
      // If no auth configured, throw the original error
      throw error;
    }
  })()
    .catch((error) => {
      registryTokenCache.delete(cacheKey);
      throw error;
    });

  registryTokenCache.set(cacheKey, request);
  return request;
};

const createVariantTag = (variant: ImageVariantName, baseTag: string): string => {
  if (variant === "original") {
    return baseTag;
  }
  return `${baseTag}-${variant}`;
};

const checkRegistryImage = async (
  repositoryPath: string,
  tag: string,
): Promise<{
  status: ImageVariantStatus;
  httpStatus?: number;
  error?: string;
}> => {
  const manifestUrl = `https://${CODING_REGISTRY_HOST.replace(/\/+$/, "")}/v2/${repositoryPath.replace(/^\/+/, "")}/manifests/${encodeURIComponent(tag)}`;
  const headers: Record<string, string> = {
    Accept: MANIFEST_ACCEPT_HEADER,
    "User-Agent": "dify-helm-watchdog",
  };

  const handleResponse = (
    response: Response,
  ): { status: ImageVariantStatus; httpStatus?: number; error?: string } => {
    if (response.ok) {
      return { status: "found", httpStatus: response.status };
    }

    if (response.status === 404) {
      return { status: "missing", httpStatus: response.status };
    }

    if (response.status === 401 || response.status === 403) {
      return {
        status: "error",
        httpStatus: response.status,
        error: "Registry denied access to this image (unauthorized).",
      };
    }

    if (response.status === 405 || response.status === 400) {
      return {
        status: "error",
        httpStatus: response.status,
        error: `Registry does not support ${response.status === 405 ? "HEAD" : "request"} for manifest lookup`,
      };
    }

    return {
      status: "error",
      httpStatus: response.status,
      error: `Registry responded with status ${response.status}`,
    };
  };

  const performRequest = async (token?: string) => {
    const requestHeaders: Record<string, string> = { ...headers };
    if (token) {
      requestHeaders.Authorization = `Bearer ${token}`;
    } else if (CODING_REGISTRY_AUTH_HEADER) {
      requestHeaders.Authorization = CODING_REGISTRY_AUTH_HEADER;
    }

    const headResponse = await fetch(manifestUrl, {
      method: "HEAD",
      headers: requestHeaders,
    });

    if (headResponse.status === 405 || headResponse.status === 400) {
      const getResponse = await fetch(manifestUrl, {
        method: "GET",
        headers: requestHeaders,
      });
      return getResponse;
    }

    return headResponse;
  };

  try {
    let response = await performRequest();
    if (response.ok || response.status === 404 || response.status === 405 || response.status === 400) {
      return handleResponse(response);
    }

    // For 401/403 responses, always attempt to get a token via Bearer challenge
    // This works for both public registries (anonymous tokens) and private registries (authenticated tokens)
    if (response.status === 401 || response.status === 403) {
      const challenge = parseBearerChallenge(
        response.headers.get("www-authenticate"),
      );
      if (challenge) {
        try {
          const token = await resolveRegistryToken(challenge, repositoryPath);
          response = await performRequest(token);
          return handleResponse(response);
        } catch (tokenError) {
          return {
            status: "error",
            httpStatus: response.status,
            error: tokenError instanceof Error
              ? `Failed to authorize registry request: ${tokenError.message}`
              : "Failed to authorize registry request.",
          };
        }
      }
    }

    return handleResponse(response);
  } catch (error) {
    return {
      status: "error",
      error:
        error instanceof Error
          ? error.message
          : "Unexpected error while contacting registry",
    };
  }
};

const dedupeImageEntries = (
  entries: Array<[string, ImageEntry]>,
): Array<{ repository: string; tag: string; paths: string[] }> => {
  const groups = new Map<
    string,
    { repository: string; tag: string; paths: Set<string> }
  >();

  for (const [pathKey, entry] of entries) {
    const id = `${entry.repository}:${entry.tag}`;
    const normalizedPath = pathKey || "root";
    const existing = groups.get(id);

    if (existing) {
      existing.paths.add(normalizedPath);
    } else {
      groups.set(id, {
        repository: entry.repository,
        tag: entry.tag,
        paths: new Set([normalizedPath]),
      });
    }
  }

  return Array.from(groups.values()).map((group) => ({
    repository: group.repository,
    tag: group.tag,
    paths: Array.from(group.paths).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true }),
    ),
  }));
};

const determineOverallStatus = (
  variants: ImageVariantCheck[],
): ImageValidationOverallStatus => {
  const statuses = variants.map((variant) => variant.status);
  
  // If all variants are found, it's perfect
  if (statuses.every((status) => status === "found")) {
    return "all_found";
  }

  // If all variants are missing, no image is available
  if (statuses.every((status) => status === "missing")) {
    return "missing";
  }

  // If any variant has an error, report it
  if (statuses.some((status) => status === "error")) {
    return "error";
  }

  // For partial status: check if original (multi-arch) exists
  // Most images only publish multi-arch manifests without architecture-specific tags
  // If the original tag exists, the image is fully usable even if -amd64/-arm64 tags don't exist
  const originalVariant = variants.find((v) => v.name === "original");
  if (originalVariant && originalVariant.status === "found") {
    // Original exists, so the image is usable - treat as all_found
    return "all_found";
  }

  // Only report partial if we have some architecture-specific tags but not all
  return "partial";
};

const computeImageValidation = async (
  version: string,
  entries: Array<[string, ImageEntry]>,
): Promise<ImageValidationPayload> => {
  const groupedEntries = dedupeImageEntries(entries);
  const checkedAt = new Date().toISOString();

  const records: ImageValidationRecord[] = [];

  for (const group of groupedEntries) {
    const targetImageName = resolveTargetImageName(group.repository);
    const repositoryPath = `${CODING_REGISTRY_NAMESPACE.replace(/\/+$/, "")}/${targetImageName}`;
    const variants: ImageVariantCheck[] = [];

    for (const variantName of IMAGE_VARIANT_NAMES) {
      const tag = createVariantTag(variantName, group.tag);
      const result = await checkRegistryImage(repositoryPath, tag);

      variants.push({
        name: variantName,
        tag,
        image: `${CODING_REGISTRY_HOST.replace(/\/+$/, "")}/${repositoryPath}:${tag}`,
        status: result.status,
        checkedAt,
        ...(typeof result.httpStatus === "number"
          ? { httpStatus: result.httpStatus }
          : {}),
        ...(result.error ? { error: result.error } : {}),
      });
    }

    records.push({
      sourceRepository: group.repository,
      sourceTag: group.tag,
      targetImageName,
      paths: group.paths,
      variants,
      status: determineOverallStatus(variants),
    });
  }

  records.sort((a, b) =>
    a.targetImageName.localeCompare(b.targetImageName, undefined, {
      numeric: true,
      sensitivity: "base",
    }),
  );

  return {
    version,
    checkedAt,
    host: CODING_REGISTRY_HOST,
    namespace: CODING_REGISTRY_NAMESPACE,
    images: records,
  };
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
        const [valuesContent, imagesContent, validationContent] = await Promise.all([
          storage.readContent(version.values.url),
          storage.readContent(version.images.url),
          version.imageValidation
            ? storage.readContent(version.imageValidation.url)
            : Promise.resolve<string | undefined>(undefined),
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
          imageValidation: version.imageValidation
            ? {
                ...version.imageValidation,
                inline: validationContent,
              }
            : undefined,
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

    const cacheMetadata = await storage.read(CACHE_PATH);
    if (!cacheMetadata) {
      return null;
    }

    // Bypass cache to ensure we get the latest cache.json after revalidation
    const text = await storage.readContent(cacheMetadata.downloadUrl!);
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
  const asset = await storage.write(path, content, contentType);

  // In local mode, also ensure local copy exists (for consistency with existing logic)
  if (process.env.ENABLE_LOCAL_MODE === "true") {
    await writeLocalAsset(path, content);
  }

  return asset;
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

  const forcedVersions = new Set(
    (options.forceVersions ?? [])
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
      .map((value) => value.replace(/^[vV]/, "")),
  );

  if (forcedVersions.size > 0) {
    log(
      `Forcing refresh for versions: ${Array.from(forcedVersions)
        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
        .join(", ")}`,
    );
  }

  log("Fetching Helm repository index...");
  const indexEntries = await fetchHelmIndex();
  log(`Retrieved ${indexEntries.length} chart versions from index.`);
  const cache = await loadCache();

  const knownVersions = new Map<string, StoredVersion>(
    cache?.versions.map((entry) => [entry.version, entry]) ?? [],
  );

  const newVersions: StoredVersion[] = [];
  const refreshedVersions: StoredVersion[] = [];
  const processedVersionPayloads = new Map<
    string,
    { values: string; images: string; imageValidation: string }
  >();
  const matchedForcedVersions = new Set<string>();

  for (const entry of indexEntries) {
    const wasKnown = knownVersions.has(entry.version);
    const isForced = forcedVersions.has(entry.version);

    if (isForced) {
      matchedForcedVersions.add(entry.version);
    }

    if (wasKnown && !isForced) {
      log(`Skipping cached version ${entry.version}`);
      continue;
    }

    if (isForced && wasKnown) {
      log(`Refreshing cached version ${entry.version}`);
    } else if (isForced && !wasKnown) {
      log(`Processing new version ${entry.version} (forced)`);
    } else {
      log(`Processing new version ${entry.version}`);
    }

    const chartUrl = toAbsoluteUrl(entry.urls[0]);
    log(`Downloading chart archive: ${chartUrl}`);
    const archive = await downloadChartArchive(chartUrl);
    const valuesYaml = await extractValuesYaml(archive);
    const imageEntries = extractImageEntries(valuesYaml);
    const imagesYaml = buildImagesYaml(imageEntries);
    const imageValidationPayload = await computeImageValidation(
      entry.version,
      imageEntries,
    );
    const imageValidationJson = JSON.stringify(imageValidationPayload, null, 2);

    const valuesPath = `${VALUES_PREFIX}/${entry.version}.yaml`;
    const imagesPath = `${IMAGES_PREFIX}/${entry.version}.yaml`;
    const validationPath = `${IMAGE_VALIDATION_PREFIX}/${entry.version}.json`;

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
    const imageValidationAsset = await persistAsset(
      validationPath,
      imageValidationJson,
      "application/json",
    );
    log(`Stored image validation summary at ${imageValidationAsset.path}`);

    const storedVersion: StoredVersion = {
      version: entry.version,
      appVersion: entry.appVersion,
      createdAt: entry.created,
      chartUrl,
      digest: entry.digest,
      values: valuesAsset,
      images: imagesAsset,
      imageValidation: imageValidationAsset,
    };

    knownVersions.set(entry.version, storedVersion);
    processedVersionPayloads.set(entry.version, {
      values: valuesYaml,
      images: imagesYaml,
      imageValidation: imageValidationJson,
    });
    if (isForced && wasKnown) {
      refreshedVersions.push(storedVersion);
    } else {
      newVersions.push(storedVersion);
    }
  }

  if (forcedVersions.size > 0) {
    const missingForces = Array.from(forcedVersions).filter(
      (version) => !matchedForcedVersions.has(version),
    );
    for (const version of missingForces) {
      log(
        `Unable to refresh version ${version}: not found in Helm repository index.`,
      );
    }
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
      const payloads = processedVersionPayloads.get(version.version);
      await ensureLocalAssetCopy(version.values, payloads?.values);
      await ensureLocalAssetCopy(version.images, payloads?.images);
      if (version.imageValidation) {
        await ensureLocalAssetCopy(
          version.imageValidation,
          payloads?.imageValidation,
        );
      }
    }
  }

  await writeLocalCache(manifestDocument);

  log("Helm sync completed.");

  return {
    processed: indexEntries.length,
    created: newVersions.length,
    skipped:
      indexEntries.length - newVersions.length - refreshedVersions.length,
    refreshed: refreshedVersions.map((entry) => entry.version),
    versions: newVersions.map((entry) => entry.version),
    lastUpdated: payload.lastUpdated,
  };
};
