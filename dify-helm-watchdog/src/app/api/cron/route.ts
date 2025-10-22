import { revalidatePath } from "next/cache";
import {
  MissingBlobTokenError,
  type SyncResult,
  syncHelmData,
} from "@/lib/helm";

export const runtime = "nodejs";

const createStreamResponse = (request: Request) => {
  const url = new URL(request.url);
  const forceVersions = Array.from(
    new Set(
      url
        .searchParams
        .getAll("version")
        .flatMap((value) => value.split(","))
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
        .map((value) => value.replace(/^[vV]/, "")),
    ),
  );

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const write = (message: string) =>
        controller.enqueue(encoder.encode(`${message}\n`));

      write("== dify-helm-watchdog cron =="); // banner

      if (forceVersions.length > 0) {
        write(
          `[input] force_versions=${forceVersions
            .map((version) => `v${version}`)
            .join(", ")}`,
        );
      }

      let statusLine = "[status] ok";

      try {
        let syncResult: SyncResult | null = null;
        syncResult = await syncHelmData({
          log: (message) => write(`[sync] ${message}`),
          ...(forceVersions.length > 0 ? { forceVersions } : {}),
        });

        write(
          `[result] processed=${syncResult.processed} created=${syncResult.created} refreshed=${syncResult.refreshed.length} skipped=${syncResult.skipped}`,
        );
        if (syncResult.versions.length > 0) {
          write(
            `[result] new_versions=${syncResult.versions
              .map((version) => `v${version}`)
              .join(", ")}`,
          );
        } else {
          write("[result] no new versions detected");
        }
        if (syncResult.refreshed.length > 0) {
          write(
            `[result] refreshed_versions=${syncResult.refreshed
              .map((version) => `v${version}`)
              .join(", ")}`,
          );
        } else if (forceVersions.length > 0) {
          write("[result] no cached versions refreshed");
        }
        write(`[result] lastUpdated=${syncResult.lastUpdated}`);

        // Trigger ISR revalidation to rebuild the homepage with fresh data
        write("[revalidate] Triggering ISR revalidation for homepage...");
        try {
          revalidatePath("/", "page");
          write("[revalidate] Successfully cleared ISR cache for homepage");

          // Optional: Pre-warm the cache by making a request to homepage
          // This ensures the first user gets fast response instead of waiting for SSR
          // You can disable this if revalidatePath alone works well enough
          const shouldWarmup = process.env.ENABLE_CACHE_WARMUP !== "false";
          if (shouldWarmup) {
            write("[revalidate] Warming up cache...");
            const baseUrl =
              process.env.VERCEL_URL
                ? `https://${process.env.VERCEL_URL}`
                : process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

            try {
              // Add a cache-busting parameter to ensure we bypass CDN caches
              const warmupUrl = `${baseUrl}/?_warmup=${Date.now()}`;
              const warmupResponse = await fetch(warmupUrl, {
                headers: {
                  "User-Agent": "dify-helm-watchdog-cron",
                  "Cache-Control": "no-cache, no-store, must-revalidate",
                },
                cache: "no-store",
              });

              if (warmupResponse.ok) {
                write(
                  `[revalidate] Cache warmed up successfully (status: ${warmupResponse.status})`,
                );
              } else {
                write(
                  `[revalidate] Warning: Warmup returned status ${warmupResponse.status}`,
                );
              }
            } catch (warmupError) {
              write(
                `[revalidate] Warning: Cache warmup failed - ${warmupError instanceof Error ? warmupError.message : "unknown error"}`,
              );
            }
          } else {
            write("[revalidate] Cache warmup disabled via ENABLE_CACHE_WARMUP=false");
          }
        } catch (revalError) {
          write(
            `[revalidate] Warning: Failed to trigger revalidation - ${revalError instanceof Error ? revalError.message : "unknown error"}`,
          );
        }
      } catch (error) {
        statusLine = "[status] failed";

        if (error instanceof MissingBlobTokenError) {
          write(`[error] ${error.message}`);
        } else if (error instanceof Error) {
          write(`[error] ${error.message}`);
        } else {
          write("[error] Unknown error occurred while syncing Helm data.");
        }

        console.error("[cron] unexpected error", error);
      } finally {
        write(statusLine);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
};

export async function GET(request: Request) {
  return createStreamResponse(request);
}

export async function POST(request: Request) {
  return createStreamResponse(request);
}
