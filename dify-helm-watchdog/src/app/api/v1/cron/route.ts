import { revalidatePath } from "next/cache";
import { createErrorResponse } from "@/lib/api/response";
import {
  MissingBlobTokenError,
  type SyncResult,
  syncHelmData,
} from "@/lib/helm";

export const runtime = "nodejs";

/**
 * @swagger
 * /api/v1/cron:
 *   post:
 *     summary: Trigger Helm cache synchronization
 *     description: Starts the cron sync pipeline and streams textual progress logs. Requires a secret header when invoked outside the hosting platform.
 *     tags:
 *       - Cron
 *     parameters:
 *       - name: secret
 *         in: header
 *         required: false
 *         description: Shared secret to authorize manual cron execution.
 *         schema:
 *           type: string
 *       - name: version
 *         in: query
 *         required: false
 *         description: One or more specific chart versions (comma separated) to refresh.
 *         schema:
 *           type: array
 *           items:
 *             type: string
 *     responses:
 *       200:
 *         description: Stream containing sync logs.
 *       401:
 *         description: Missing or invalid cron secret.
 *       500:
 *         description: Internal server error.
 */
const createStreamResponse = (request: Request) => {
  const cronSecret = process.env.CRON_AUTH_SECRET;
  const requestSecret = request.headers.get("secret");

  const isVercelCron = request.headers.get("x-vercel-cron") === "true";

  if (cronSecret && !isVercelCron && requestSecret !== cronSecret) {
    return createErrorResponse({
      request,
      status: 401,
      message: "Invalid or missing secret header",
      statusText: "UNAUTHENTICATED",
      headers: {
        "Cache-Control": "no-store",
      },
    });
  }

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

      write("== dify-helm-watchdog cron ==");

      if (forceVersions.length > 0) {
        write(
          `[input] force_versions=${forceVersions
            .map((version) => `v${version}`)
            .join(", ")}`,
        );
      }

      let statusLine = "[status] ok";

      try {
        const syncResult: SyncResult = await syncHelmData({
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
        write(`[result] update_time=${syncResult.updateTime ?? "unknown"}`);

        write("[revalidate] Triggering ISR revalidation for homepage...");
        try {
          revalidatePath("/", "page");
          write("[revalidate] Successfully cleared ISR cache for homepage");

          const shouldWarmup = process.env.ENABLE_CACHE_WARMUP !== "false";
          if (shouldWarmup) {
            write("[revalidate] Warming up cache...");
            const baseUrl =
              process.env.VERCEL_URL
                ? `https://${process.env.VERCEL_URL}`
                : process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

            try {
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

export async function POST(request: Request) {
  return createStreamResponse(request);
}
