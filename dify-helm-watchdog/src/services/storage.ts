import path from "node:path";
import crypto from "node:crypto";
import {
  HeadObjectCommand,
  NotFound,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { HeadResult, Storage, StoredAsset } from "../lib/types";
import { LOCAL_CACHE_DIR_RELATIVE } from "../constants/helm";
import { MissingStorageCredentialsError } from "../lib/storage-errors";

const R2_ENV_VARS = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "R2_PUBLIC_BASE_URL",
] as const;

const getLocalAssetPath = (assetPath: string): string => {
  const relativePath = assetPath.replace(/^helm-watchdog\//, "");
  return path.join(process.cwd(), LOCAL_CACHE_DIR_RELATIVE, relativePath);
};

const computeHash = (input: string): string =>
  crypto.createHash("sha256").update(input).digest("hex");

const stripTrailingSlash = (value: string): string =>
  value.endsWith("/") ? value.slice(0, -1) : value;

export class R2StorageService implements Storage {
  private client: S3Client | null = null;
  private bucket: string | null = null;
  private publicBaseUrl: string | null = null;

  private resolveConfig(): {
    accountId: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucket: string;
    publicBaseUrl: string;
  } {
    const missing = R2_ENV_VARS.filter((name) => !process.env[name]);
    if (missing.length > 0) {
      throw new MissingStorageCredentialsError(missing);
    }

    return {
      accountId: process.env.R2_ACCOUNT_ID as string,
      accessKeyId: process.env.R2_ACCESS_KEY_ID as string,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY as string,
      bucket: process.env.R2_BUCKET as string,
      publicBaseUrl: stripTrailingSlash(process.env.R2_PUBLIC_BASE_URL as string),
    };
  }

  private getClient(): S3Client {
    if (this.client && this.bucket && this.publicBaseUrl) {
      return this.client;
    }

    const config = this.resolveConfig();
    this.bucket = config.bucket;
    this.publicBaseUrl = config.publicBaseUrl;
    this.client = new S3Client({
      region: "auto",
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
    return this.client;
  }

  private buildPublicUrl(key: string): string {
    if (!this.publicBaseUrl) throw new Error("R2 client not initialized");
    return `${this.publicBaseUrl}/${key}`;
  }

  async ensureAccess(): Promise<void> {
    // On Vercel the env vars must be present; locally we let LocalStorageService
    // take over via the factory, so the error is only meaningful on Vercel.
    if (!process.env.VERCEL) {
      // Allow missing credentials in local dev — only validate when credentials are partially set.
      const present = R2_ENV_VARS.filter((name) => Boolean(process.env[name]));
      if (present.length === 0) return;
    }
    this.resolveConfig();
  }

  async read(assetPath: string): Promise<HeadResult | null> {
    const client = this.getClient();
    try {
      const result = await client.send(
        new HeadObjectCommand({ Bucket: this.bucket as string, Key: assetPath }),
      );
      const url = this.buildPublicUrl(assetPath);
      return {
        url,
        pathname: assetPath,
        size: result.ContentLength ?? 0,
        uploadedAt: result.LastModified ?? new Date(),
        downloadUrl: url,
      };
    } catch (error) {
      if (error instanceof NotFound) return null;
      if (
        error &&
        typeof error === "object" &&
        "$metadata" in error &&
        (error as { $metadata?: { httpStatusCode?: number } }).$metadata
          ?.httpStatusCode === 404
      ) {
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
          `Failed to fetch R2 object from ${url}: ${response.status} ${response.statusText}`,
        );
      }

      return await response.text();
    } catch (error) {
      console.error(`[helm-cache] Failed to fetch R2 object from ${url}`, error);
      throw error;
    }
  }

  async write(
    assetPath: string,
    content: string,
    contentType: string,
  ): Promise<StoredAsset> {
    const client = this.getClient();
    const hash = computeHash(content);

    await client.send(
      new PutObjectCommand({
        Bucket: this.bucket as string,
        Key: assetPath,
        Body: content,
        ContentType: contentType,
      }),
    );

    return {
      path: assetPath,
      url: this.buildPublicUrl(assetPath),
      hash,
    };
  }
}

export class LocalStorageService implements Storage {
  async ensureAccess(): Promise<void> {
    return;
  }

  async read(assetPath: string): Promise<HeadResult | null> {
    const fullPath = getLocalAssetPath(assetPath);

    try {
      const fs = await import("node:fs/promises");
      const stats = await fs.stat(fullPath);

      return {
        url: `file://${fullPath}`,
        pathname: assetPath,
        size: stats.size,
        uploadedAt: new Date(stats.mtime),
        downloadedAt: new Date(),
        downloadUrl: `file://${fullPath}`,
      };
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        (error as NodeJS.ErrnoException).code === "ENOENT"
      ) {
        return null;
      }
      throw error;
    }
  }

  async readContent(url: string): Promise<string> {
    if (!url.startsWith("file://")) {
      throw new Error(`Invalid local file URL: ${url}`);
    }

    const filePath = url.slice(7);
    const fs = await import("node:fs/promises");
    return await fs.readFile(filePath, "utf-8");
  }

  async write(
    assetPath: string,
    content: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _contentType: string,
  ): Promise<StoredAsset> {
    const fullPath = getLocalAssetPath(assetPath);
    const hash = computeHash(content);

    const fs = await import("node:fs/promises");
    const pathModule = await import("node:path");

    await fs.mkdir(pathModule.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, "utf-8");

    return {
      path: assetPath,
      url: `file://${fullPath}`,
      hash,
    };
  }
}

export const createStorageService = (): Storage => {
  const isLocalMode = process.env.ENABLE_LOCAL_MODE === "true";

  if (isLocalMode) {
    return new LocalStorageService();
  }

  return new R2StorageService();
};
