export const EE_CATALOG_URL = "https://ee.dify.ai/releases/catalog.json";
const SUPPORTED_SCHEMA_VERSION = 1;

export interface EeStopKind {
  kind: string;
  label: string;
}

export interface EeRelease {
  version: string;
  track: "lts" | "regular";
  releaseDate: string;
  eolDate: string | null;
  archived: boolean;
  unskippable: boolean;
  stopKinds: EeStopKind[];
  stopSummary: string | null;
  notesUrl: string;
  lockUrl: string | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asString = (value: unknown): string =>
  typeof value === "string" ? value : "";

const CATALOG_VERSION_RE = /^v\d+\.\d+\.\d+$/;

export const parseEeCatalog = (payload: unknown): EeRelease[] => {
  if (!isRecord(payload) || payload.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
    throw new Error("Unsupported ee.dify.ai catalog schema");
  }
  if (!Array.isArray(payload.releases)) {
    throw new Error("Unsupported ee.dify.ai catalog schema: 'releases' must be an array");
  }
  const releases: EeRelease[] = [];
  for (const item of payload.releases) {
    if (!isRecord(item)) continue;
    const version = asString(item.version);
    if (!CATALOG_VERSION_RE.test(version)) continue;
    const stopKinds = (Array.isArray(item.stopKinds) ? item.stopKinds : [])
      .filter(isRecord)
      .map((k) => ({ kind: asString(k.kind), label: asString(k.label) }))
      .filter((k) => k.kind.length > 0);
    releases.push({
      version,
      track: item.track === "lts" ? "lts" : "regular",
      releaseDate: asString(item.releaseDate),
      eolDate: asString(item.eolDate) || null,
      archived: item.archived === true,
      unskippable: item.unskippable === true,
      stopKinds,
      stopSummary: asString(item.stopSummary) || null,
      // Derive URLs from the validated version instead of trusting the payload,
      // mirroring release-feed.ts.
      notesUrl: `https://ee.dify.ai/releases/${version}`,
      lockUrl: item.lockUrl ? `https://ee.dify.ai/version-locks/${version}.yaml` : null,
    });
  }
  return releases;
};

export const fetchEeCatalog = async (): Promise<EeRelease[]> => {
  const res = await fetch(EE_CATALOG_URL, {
    headers: { "User-Agent": "dify-helm-watchdog/1.0" },
    next: { revalidate: 3600 },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) {
    throw new Error(`ee.dify.ai catalog returned HTTP ${res.status}`);
  }
  return parseEeCatalog(await res.json());
};
