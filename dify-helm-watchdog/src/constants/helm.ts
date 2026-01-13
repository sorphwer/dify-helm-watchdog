/**
 * Helm chart configuration constants
 */
export const HELM_INDEX_URL = "https://langgenius.github.io/dify-helm/index.yaml";
export const HELM_REPO_BASE = "https://langgenius.github.io/dify-helm/";
export const STORAGE_PREFIX = "helm-watchdog";
export const CACHE_PATH = `${STORAGE_PREFIX}/cache.json`;
export const VALUES_PREFIX = `${STORAGE_PREFIX}/values`;
export const IMAGES_PREFIX = `${STORAGE_PREFIX}/images`;
export const IMAGE_VALIDATION_PREFIX = `${STORAGE_PREFIX}/image-validation`;
export const WORKFLOW_LOGS_PATH = `${STORAGE_PREFIX}/workflow-logs.json`;

// Local cache paths - using relative paths for consistency
// Note: These will be resolved to absolute paths using path.join(process.cwd(), ...) where needed
export const LOCAL_CACHE_DIR_RELATIVE = ".cache/helm";
export const LOCAL_CACHE_PATH_RELATIVE = `${LOCAL_CACHE_DIR_RELATIVE}/cache.json`;

/**
 * Docker registry configuration
 */
export const DEFAULT_CODING_REGISTRY_HOST = "g-hsod9681-docker.pkg.coding.net";
export const DEFAULT_CODING_REGISTRY_NAMESPACE = "dify-artifact/dify";

export const MANIFEST_ACCEPT_HEADER =
  "application/vnd.docker.distribution.manifest.v2+json,application/vnd.docker.distribution.manifest.list.v2+json,application/vnd.oci.image.manifest.v1+json,application/vnd.oci.image.index.v1+json";

export const IMAGE_VARIANT_NAMES = ["ORIGINAL", "AMD64", "ARM64"] as const;
