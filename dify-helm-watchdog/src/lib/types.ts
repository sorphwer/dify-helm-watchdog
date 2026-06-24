export interface HelmVersionEntry {
  version: string;
  appVersion?: string | null;
  created?: string | null;
  urls: string[];
  digest?: string;
}

export interface StoredAsset {
  path: string;
  url: string;
  hash: string;
  inline?: string;
}

// Upgrade-path status sourced from the official Dify Helm docs sidebar.
// Absent means a normal, skippable version.
export type VersionStatus = "non-skippable" | "archived" | "deprecated";

export interface StoredVersion {
  version: string;
  appVersion?: string | null;
  createTime?: string | null;
  chartUrl: string;
  digest?: string;
  values: StoredAsset;
  images: StoredAsset;
  imageValidation?: StoredAsset;
  status?: VersionStatus;
}

export interface CachePayload {
  updateTime: string | null;
  versions: StoredVersion[];
}

export interface ReleaseLockSource {
  id: string;
  repo?: string;
  ref?: string;
  refType?: string;
  commit?: string;
}

export interface ReleaseLockPayload {
  version?: string;
  releaseTrack?: string;
  componentCount?: number;
  componentsBySource?: Record<string, number>;
  sources: ReleaseLockSource[];
}

export type ImageVariantName = "ORIGINAL" | "AMD64" | "ARM64";

export type ImageVariantStatus = "FOUND" | "MISSING" | "ERROR";

export interface ImageVariantCheck {
  name: ImageVariantName;
  tag: string;
  image: string;
  status: ImageVariantStatus;
  checkTime: string;
  httpStatus?: number;
  error?: string;
}

export type ImageValidationOverallStatus =
  | "ALL_FOUND"
  | "PARTIAL"
  | "MISSING"
  | "ERROR";

export interface ImageValidationRecord {
  sourceRepository: string;
  sourceTag: string;
  targetImageName: string;
  paths: string[];
  variants: ImageVariantCheck[];
  status: ImageValidationOverallStatus;
}

export type ChartMirrorStatus = "FOUND" | "MISSING" | "ERROR";

export interface ChartMirrorCheck {
  repoUrl: string;
  status: ChartMirrorStatus;
  checkTime: string;
  error?: string;
}

export interface ImageValidationPayload {
  version: string;
  checkTime: string;
  host: string;
  namespace: string;
  images: ImageValidationRecord[];
  chartMirror?: ChartMirrorCheck;
}

export interface HeadResult {
  url: string;
  pathname: string;
  size: number;
  uploadedAt: Date;
  downloadedAt?: Date;
  downloadUrl?: string;
}

export interface Storage {
  read(path: string): Promise<HeadResult | null>;
  readContent(url: string): Promise<string>;
  write(path: string, content: string, contentType: string): Promise<StoredAsset>;
  ensureAccess(): Promise<void>;
}
