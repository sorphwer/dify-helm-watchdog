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
}

export interface CachePayload {
  lastUpdated: string;
  versions: StoredVersion[];
}
