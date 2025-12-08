import { revalidatePath } from "next/cache";
import { createErrorResponse } from "@/lib/api/response";
import {
  MissingBlobTokenError,
  type SyncResult,
  syncHelmData,
} from "@/lib/helm";

export const runtime = "nodejs";

// Maximum pause duration (in seconds) to prevent excessive delays and Vercel timeouts
const MAX_PAUSE_SECONDS = parseInt(process.env.MAX_PAUSE_SECONDS || "300", 10);

// Heartbeat interval during pause (in seconds) to keep the connection alive
const HEARTBEAT_INTERVAL_SECONDS = 10;

/**
 * Sleep for a specified duration while sending periodic heartbeat messages.
 * This is necessary for Vercel streaming responses to prevent idle connection timeouts.
 */
async function sleepWithHeartbeat(
  seconds: number,
  write: (message: string) => void,
): Promise<void> {
  if (seconds <= 0) return;

  const totalMs = seconds * 1000;
  const heartbeatMs = HEARTBEAT_INTERVAL_SECONDS * 1000;
  const startTime = Date.now();

  write(`[pause] Waiting ${seconds} seconds before starting sync...`);

  while (Date.now() - startTime < totalMs) {
    const remaining = Math.ceil((totalMs - (Date.now() - startTime)) / 1000);
    if (remaining <= 0) break;

    const sleepTime = Math.min(heartbeatMs, remaining * 1000);
    await new Promise((resolve) => setTimeout(resolve, sleepTime));

    const newRemaining = Math.ceil((totalMs - (Date.now() - startTime)) / 1000);
    if (newRemaining > 0) {
      write(`[pause] ${newRemaining}s remaining...`);
    }
  }

  write("[pause] Wait complete, starting sync");
}

/**
 * @swagger
 * /api/v1/cron:
 *   post:
 *     summary: Trigger Helm cache synchronization
 *     description: Starts the cron sync pipeline and streams textual progress logs. Requires Bearer token authentication when invoked outside the hosting platform.
 *     tags:
 *       - Cron
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: version
 *         in: query
 *         required: false
 *         description: One or more specific chart versions (comma separated) to refresh.
 *         schema:
 *           type: array
 *           items:
 *             type: string
 *       - name: pause
 *         in: query
 *         required: false
 *         description: Number of seconds to wait before starting the sync. Maximum is configurable via MAX_PAUSE_SECONDS env var (default 300). Heartbeat messages are sent every 10 seconds to keep the connection alive.
 *         schema:
 *           type: integer
 *           minimum: 0
 *           example: 60
 *     responses:
 *       200:
 *         description: Stream containing sync logs.
 *       401:
 *         description: Missing or invalid authorization token.
 *       500:
 *         description: Internal server error.
 */
const createStreamResponse = (request: Request) => {
  const cronApiKey = process.env.CRON_API_KEY;
  const authHeader = request.headers.get("authorization");

  const isVercelCron = request.headers.get("x-vercel-cron") === "true";

  // Skip auth check if no API key is configured or if it's a Vercel cron job
  if (cronApiKey && !isVercelCron) {
    // Validate Bearer token format
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return createErrorResponse({
        request,
        status: 401,
        message: "Missing or invalid Authorization header. Expected: Bearer <token>",
        statusText: "UNAUTHENTICATED",
        headers: {
          "Cache-Control": "no-store",
          "WWW-Authenticate": 'Bearer realm="cron"',
        },
      });
    }

    const token = authHeader.substring(7); // Remove "Bearer " prefix
    if (token !== cronApiKey) {
      return createErrorResponse({
        request,
        status: 401,
        message: "Invalid authorization token",
        statusText: "UNAUTHENTICATED",
        headers: {
          "Cache-Control": "no-store",
          "WWW-Authenticate": 'Bearer realm="cron", error="invalid_token"',
        },
      });
    }
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

  // Parse pause parameter (seconds to wait before starting sync)
  const pauseParam = url.searchParams.get("pause");
  const pauseSeconds = pauseParam
    ? Math.min(Math.max(0, parseInt(pauseParam, 10) || 0), MAX_PAUSE_SECONDS)
    : 0;

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

      if (pauseSeconds > 0) {
        write(`[input] pause=${pauseSeconds}s`);
        await sleepWithHeartbeat(pauseSeconds, write);
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
