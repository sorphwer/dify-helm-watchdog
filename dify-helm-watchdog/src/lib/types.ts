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
  createTime?: string | null;
  chartUrl: string;
  digest?: string;
  values: StoredAsset;
  images: StoredAsset;
  imageValidation?: StoredAsset;
}

export interface CachePayload {
  updateTime: string | null;
  versions: StoredVersion[];
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

export interface ImageValidationPayload {
  version: string;
  checkTime: string;
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
