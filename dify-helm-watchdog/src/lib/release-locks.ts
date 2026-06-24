import semver from "semver";
import YAML from "yaml";
import type { ReleaseLockPayload } from "@/lib/types";
import { STORAGE_PREFIX } from "@/constants/helm";

const MIN_RELEASE_LOCK_VERSION = "3.9.0";
const DEFAULT_RELEASE_LOCKS_BASE_URL =
  "https://dify-watchdog-blobs.langgenius.app/helm-watchdog/release-locks";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

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

const parseReleaseLockPayload = (raw: string): ReleaseLockPayload => {
  const parsed = YAML.parse(raw);
  if (!isRecord(parsed)) {
    throw new Error("Invalid release lock payload");
  }

  const sources = Array.isArray(parsed.sources)
    ? parsed.sources
        .filter(isRecord)
        .map((source) => ({
          id: typeof source.id === "string" ? source.id : "",
          repo: typeof source.repo === "string" ? source.repo : undefined,
          ref: typeof source.ref === "string" ? source.ref : undefined,
          refType: typeof source.ref_type === "string" ? source.ref_type : undefined,
          commit: typeof source.commit === "string" ? source.commit : undefined,
        }))
        .filter((source) => source.id)
    : [];
  const components = Array.isArray(parsed.components)
    ? parsed.components.filter(isRecord)
    : [];
  const componentsBySource = components.reduce<Record<string, number>>(
    (acc, component) => {
      if (typeof component.source !== "string") return acc;
      acc[component.source] = (acc[component.source] ?? 0) + 1;
      return acc;
    },
    {},
  );

  return {
    version:
      typeof parsed.version === "string" || typeof parsed.version === "number"
        ? String(parsed.version)
        : undefined,
    releaseTrack:
      typeof parsed.releaseTrack === "string" ? parsed.releaseTrack : undefined,
    componentCount: components.length,
    componentsBySource,
    sources,
  };
};

export const loadReleaseLock = async (
  version: string,
): Promise<ReleaseLockPayload | null> => {
  const url = releaseLockUrlFor(version);
  if (!url) return null;

  const response = await fetch(url, {
    next: { revalidate: 3600 },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  return parseReleaseLockPayload(await response.text());
};
