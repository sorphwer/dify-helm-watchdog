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

export interface StoredVersion {
  version: string;
  appVersion?: string | null;
  createdAt?: string | null;
  chartUrl: string;
  digest?: string;
  values: StoredAsset;
  images: StoredAsset;
  imageValidation?: StoredAsset;
}

export interface CachePayload {
  lastUpdated: string;
  versions: StoredVersion[];
}

export type ImageVariantName = "original" | "amd64" | "arm64";

export type ImageVariantStatus = "found" | "missing" | "error";

export interface ImageVariantCheck {
  name: ImageVariantName;
  tag: string;
  image: string;
  status: ImageVariantStatus;
  checkedAt: string;
  httpStatus?: number;
  error?: string;
}

export type ImageValidationOverallStatus =
  | "all_found"
  | "partial"
  | "missing"
  | "error";

export interface ImageValidationRecord {
  sourceRepository: string;
  sourceTag: string;
  targetImageName: string;
  paths: string[];
  variants: ImageVariantCheck[];
  status: ImageValidationOverallStatus;
}

export interface ImageValidationPayload {
  version: string;
  checkedAt: string;
  host: string;
  namespace: string;
  images: ImageValidationRecord[];
}

export interface HeadResult {
  url: string;
  pathname: string;
  size: number;
  uploadedAt: Date;
  downloadedAt?: Date;
  downloadUrl?: string; // For compatibility with Vercel Blob
}

export interface Storage {
  read(path: string): Promise<HeadResult | null>;
  readContent(url: string): Promise<string>;
  write(path: string, content: string, contentType: string): Promise<StoredAsset>;
  ensureAccess(): Promise<void>;
}
