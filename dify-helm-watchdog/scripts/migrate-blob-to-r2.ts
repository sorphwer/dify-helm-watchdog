/**
 * One-shot data migration: copy every object under `helm-watchdog/` from
 * the legacy Vercel Blob store to the Cloudflare R2 bucket. Keys are
 * preserved exactly so the URLs already in cache.json line up with the
 * new R2 public domain.
 *
 * Usage (run from the dify-helm-watchdog/ directory):
 *
 *     vercel env pull .env.local              # pulls BLOB_READ_WRITE_TOKEN + R2_*
 *     npx tsx scripts/migrate-blob-to-r2.ts --dry-run
 *     npx tsx scripts/migrate-blob-to-r2.ts
 *
 * Required env vars (pulled by `vercel env pull`):
 *   BLOB_READ_WRITE_TOKEN   - source (legacy)
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_BASE_URL
 *
 * After this finishes successfully you can delete the script + the
 * `@vercel/blob` devDependency.
 */
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { list } from "@vercel/blob";
import { PutObjectCommand, S3Client, HeadObjectCommand } from "@aws-sdk/client-s3";

const PREFIX = "helm-watchdog/";
const CONCURRENCY = 8;
const DRY_RUN = process.argv.includes("--dry-run");

const REQUIRED_ENV = [
  "BLOB_READ_WRITE_TOKEN",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "R2_PUBLIC_BASE_URL",
] as const;

async function loadEnvLocal(): Promise<void> {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;
  const contents = await readFile(envPath, "utf-8");
  for (const line of contents.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function contentTypeFor(key: string): string {
  if (key.endsWith(".json")) return "application/json";
  if (key.endsWith(".yaml") || key.endsWith(".yml")) return "application/yaml";
  return "application/octet-stream";
}

interface BlobItem {
  pathname: string;
  url: string;
  size: number;
}

async function listAllBlobs(): Promise<BlobItem[]> {
  const items: BlobItem[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: PREFIX, cursor, limit: 1000 });
    for (const blob of page.blobs) {
      items.push({ pathname: blob.pathname, url: blob.url, size: blob.size });
    }
    cursor = page.cursor;
  } while (cursor);
  return items;
}

async function copyOne(s3: S3Client, bucket: string, item: BlobItem): Promise<{ bytes: number }> {
  const response = await fetch(item.url, {
    headers: { "User-Agent": "dify-helm-watchdog-migrate" },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`fetch ${item.url} failed: ${response.status} ${response.statusText}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: item.pathname,
      Body: buffer,
      ContentType: contentTypeFor(item.pathname),
    }),
  );
  return { bytes: buffer.length };
}

async function runWithConcurrency<T>(
  items: T[],
  worker: (item: T, index: number) => Promise<void>,
  concurrency: number,
): Promise<void> {
  let cursor = 0;
  const lanes = Array.from({ length: concurrency }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      await worker(items[i], i);
    }
  });
  await Promise.all(lanes);
}

async function main(): Promise<void> {
  await loadEnvLocal();

  const missing = REQUIRED_ENV.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    console.error(`[migrate] missing env vars: ${missing.join(", ")}`);
    console.error('[migrate] hint: run "vercel env pull .env.local" first');
    process.exit(1);
  }

  const accountId = process.env.R2_ACCOUNT_ID as string;
  const bucket = process.env.R2_BUCKET as string;
  const s3 = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID as string,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY as string,
    },
  });

  console.log(`[migrate] listing blobs under "${PREFIX}" ...`);
  const blobs = await listAllBlobs();
  const totalBytes = blobs.reduce((acc, b) => acc + b.size, 0);
  console.log(`[migrate] found ${blobs.length} object(s), ${(totalBytes / 1024).toFixed(1)} KiB total`);

  if (DRY_RUN) {
    for (const blob of blobs) {
      console.log(`  [dry-run] ${blob.pathname.padEnd(60)} ${blob.size} bytes`);
    }
    console.log(`[migrate] dry-run complete — no writes performed`);
    return;
  }

  let done = 0;
  let copiedBytes = 0;
  const errors: Array<{ pathname: string; error: string }> = [];

  await runWithConcurrency(
    blobs,
    async (blob) => {
      try {
        const { bytes } = await copyOne(s3, bucket, blob);
        done++;
        copiedBytes += bytes;
        console.log(`  [${String(done).padStart(3)}/${blobs.length}] ${blob.pathname} (${bytes}b)`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push({ pathname: blob.pathname, error: message });
        console.error(`  [FAIL] ${blob.pathname}: ${message}`);
      }
    },
    CONCURRENCY,
  );

  console.log("");
  console.log(`[migrate] copied ${done}/${blobs.length} objects (${(copiedBytes / 1024).toFixed(1)} KiB)`);

  if (errors.length > 0) {
    console.error(`[migrate] ${errors.length} failure(s):`);
    for (const e of errors) console.error(`  - ${e.pathname}: ${e.error}`);
    process.exit(1);
  }

  console.log(`[migrate] verifying cache.json roundtrip via R2 HEAD ...`);
  await s3.send(
    new HeadObjectCommand({ Bucket: bucket, Key: `${PREFIX}cache.json` }),
  );
  console.log(`[migrate] OK — cache.json present in R2`);
  console.log(`[migrate] done. Production should now serve data from R2.`);
}

main().catch((error) => {
  console.error("[migrate] fatal:", error);
  process.exit(1);
});
