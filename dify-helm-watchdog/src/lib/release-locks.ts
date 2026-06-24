import semver from "semver";
import YAML from "yaml";
import { STORAGE_PREFIX } from "@/constants/helm";

// Enterprise release locks (langgenius/ee-release `versions.lock.yaml`) are only
// published for 3.9.0 and above. Below that, there is nothing to enrich with.
const MIN_RELEASE_LOCK_VERSION = "3.9.0";
const DEFAULT_RELEASE_LOCKS_BASE_URL =
  "https://dify-watchdog-blobs.langgenius.app/helm-watchdog/release-locks";

// Source ref for one image, pulled from the lock's `sources[]` via the component
// that builds the image. Field names mirror the lock file verbatim.
export interface ImageSourceRef {
  repo?: string;
  ref?: string;
  ref_type?: string;
  commit?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

export const supportsReleaseLock = (version: string): boolean =>
  Boolean(semver.valid(version) && semver.gte(version, MIN_RELEASE_LOCK_VERSION));

const releaseLocksBaseUrl = (): string => {
  if (process.env.RELEASE_LOCKS_PUBLIC_BASE_URL) {
    return process.env.RELEASE_LOCKS_PUBLIC_BASE_URL.replace(/\/$/, "");
  }
  if (process.env.R2_PUBLIC_BASE_URL) {
    return `${process.env.R2_PUBLIC_BASE_URL.replace(/\/$/, "")}/${STORAGE_PREFIX}/release-locks`;
  }
  return DEFAULT_RELEASE_LOCKS_BASE_URL;
};

const releaseLockUrlFor = (version: string): string | null => {
  if (!supportsReleaseLock(version)) return null;
  return `${releaseLocksBaseUrl()}/${version}.yaml`;
};

// Build a `repository -> source ref` lookup by joining each component's `image`
// to the `commit`/`ref` of the source it is built from. Keyed on the same image
// repository string the chart's images use (e.g. "langgenius/dify-ee-gateway").
const parseImageSourceRefs = (raw: string): Map<string, ImageSourceRef> => {
  const parsed = YAML.parse(raw);
  if (!isRecord(parsed)) {
    throw new Error("Invalid release lock payload");
  }

  const sourceById = new Map<string, ImageSourceRef>();
  if (Array.isArray(parsed.sources)) {
    for (const source of parsed.sources) {
      if (!isRecord(source)) continue;
      const id = asString(source.id);
      if (!id) continue;
      sourceById.set(id, {
        repo: asString(source.repo),
        ref: asString(source.ref),
        ref_type: asString(source.ref_type),
        commit: asString(source.commit),
      });
    }
  }

  const byImage = new Map<string, ImageSourceRef>();
  if (Array.isArray(parsed.components)) {
    for (const component of parsed.components) {
      if (!isRecord(component)) continue;
      const image = asString(component.image);
      const source = asString(component.source);
      if (!image || !source) continue;
      const ref = sourceById.get(source);
      if (ref) byImage.set(image, ref);
    }
  }

  return byImage;
};

// Returns a `repository -> source ref` map for the version, or an empty map when
// the version predates release locks or no lock is published yet (404). Throws
// only on unexpected transport errors so callers can decide whether to degrade.
export const loadImageSourceRefs = async (
  version: string,
): Promise<Map<string, ImageSourceRef>> => {
  const url = releaseLockUrlFor(version);
  if (!url) return new Map();

  const response = await fetch(url, {
    next: { revalidate: 3600 },
  });
  if (response.status === 404) return new Map();
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  return parseImageSourceRefs(await response.text());
};
