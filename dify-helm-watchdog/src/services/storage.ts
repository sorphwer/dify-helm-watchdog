import path from "node:path";
import crypto from "node:crypto";
import { BlobNotFoundError, head, put } from "@vercel/blob";
import type { HeadResult, Storage, StoredAsset } from "../lib/types";
import { LOCAL_CACHE_DIR_RELATIVE } from "../constants/helm";

// Helper function to get local asset path - always uses absolute paths
const getLocalAssetPath = (assetPath: string): string => {
  // Remove 'helm-watchdog/' prefix if present to avoid path duplication
  const relativePath = assetPath.replace(/^helm-watchdog\//, "");
  return path.join(process.cwd(), LOCAL_CACHE_DIR_RELATIVE, relativePath);
};

// Helper function to compute hash
const computeHash = (input: string): string =>
  crypto.createHash("sha256").update(input).digest("hex");

// Blob storage implementation
export class BlobStorageService implements Storage {
  async ensureAccess(): Promise<void> {
    if (process.env.BLOB_READ_WRITE_TOKEN || process.env.VERCEL_BLOB_RW_TOKEN) {
      return;
    }

    // When deployed on Vercel the token is injected automatically, but in local dev we need a safeguard.
    if (!process.env.VERCEL) {
      throw new MissingBlobTokenError();
    }
  }

  async read(path: string): Promise<HeadResult | null> {
    try {
      const metadata = await head(path);
      return {
        url: metadata.url,
        pathname: metadata.pathname,
        size: metadata.size,
        uploadedAt: metadata.uploadedAt,
        downloadedAt: metadata.downloadedAt,
        downloadUrl: metadata.url,
      };
    } catch (error) {
      if (error instanceof BlobNotFoundError) {
        return null;
      }
      throw error;
    }
  }

  async readContent(url: string): Promise<string> {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "dify-helm-watchdog" },
        cache: "no-store",
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
  }

  async write(path: string, content: string, contentType: string): Promise<StoredAsset> {
    const hash = computeHash(content);
    const result = await put(path, content, {
      access: "public",
      contentType,
      addRandomSuffix: false,
      allowOverwrite: true,
    });

    return {
      path: result.pathname,
      url: result.url,
      hash,
    };
  }
}

// Local storage implementation
export class LocalStorageService implements Storage {
  async ensureAccess(): Promise<void> {
    // Always allow access in local mode
    return;
  }

  async read(path: string): Promise<HeadResult | null> {
    const fullPath = getLocalAssetPath(path);

    try {
      const fs = await import("node:fs/promises");
      const stats = await fs.stat(fullPath);

      return {
        url: `file://${fullPath}`,
        pathname: path,
        size: stats.size,
        uploadedAt: new Date(stats.mtime),
        downloadedAt: new Date(),
        downloadUrl: `file://${fullPath}`,
      };
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  async readContent(url: string): Promise<string> {
    if (!url.startsWith("file://")) {
      throw new Error(`Invalid local file URL: ${url}`);
    }

    const filePath = url.slice(7); // Remove "file://" prefix
    const fs = await import("node:fs/promises");
    return await fs.readFile(filePath, "utf-8");
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async write(path: string, content: string, _contentType: string): Promise<StoredAsset> {
    const fullPath = getLocalAssetPath(path);
    const hash = computeHash(content);

    const fs = await import("node:fs/promises");
    const pathModule = await import("node:path");

    // Ensure directory exists
    await fs.mkdir(pathModule.dirname(fullPath), { recursive: true });

    // Write file
    await fs.writeFile(fullPath, content, "utf-8");

    return {
      path,
      url: `file://${fullPath}`,
      hash,
    };
  }
}

// Storage factory
export const createStorageService = (): Storage => {
  const isLocalMode = process.env.ENABLE_LOCAL_MODE === "true";

  if (isLocalMode) {
    return new LocalStorageService();
  }

  return new BlobStorageService();
};
