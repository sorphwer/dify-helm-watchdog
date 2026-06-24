import { createErrorResponse, createJsonResponse } from "@/lib/api/response";
import { isValidVersion } from "@/lib/api/guard";
import { loadCache } from "@/lib/helm";
import { loadReleaseLock } from "@/lib/release-locks";

export const runtime = "nodejs";

/**
 * @swagger
 * /api/v1/versions/{version}/release-lock:
 *   get:
 *     summary: Get release lock source refs
 *     description: Returns parsed enterprise release lock source references for one chart version.
 *     tags:
 *       - Versions
 *     parameters:
 *       - name: version
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Parsed release lock payload.
 *       404:
 *         description: Version or release lock not available.
 *       500:
 *         description: Internal server error.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ version: string }> },
) {
  try {
    const { version } = await params;

    if (!isValidVersion(version)) {
      return createErrorResponse({
        request,
        status: 400,
        message: `Invalid version format: ${version}`,
        statusText: "INVALID_ARGUMENT",
      });
    }

    const cache = await loadCache();
    if (!cache) {
      return createErrorResponse({
        request,
        status: 404,
        message: "Cache not available. Trigger the cron job first.",
        details: [{ reason: "CACHE_NOT_INITIALIZED" }],
      });
    }

    if (!cache.versions.some((entry) => entry.version === version)) {
      return createErrorResponse({
        request,
        status: 404,
        message: `Version ${version} does not exist in the cache.`,
        details: [
          {
            reason: "VERSION_NOT_FOUND",
            availableVersions: cache.versions.map((entry) => entry.version),
          },
        ],
      });
    }

    const releaseLock = await loadReleaseLock(version);
    if (!releaseLock) {
      return createErrorResponse({
        request,
        status: 404,
        message: `Release lock is not available for version ${version}.`,
        details: [{ reason: "RELEASE_LOCK_NOT_AVAILABLE" }],
      });
    }

    return createJsonResponse(releaseLock, {
      request,
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    console.error(
      "[api/v1/versions/{version}/release-lock] Failed to load release lock",
      error,
    );
    return createErrorResponse({
      request,
      status: 500,
      message: error instanceof Error ? error.message : "Unknown error",
      statusText: "INTERNAL",
    });
  }
}
