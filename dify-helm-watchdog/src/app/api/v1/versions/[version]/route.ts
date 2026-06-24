import { createErrorResponse, createJsonResponse } from "@/lib/api/response";
import { isValidVersion } from "@/lib/api/guard";
import { loadCache } from "@/lib/helm";
import { loadReleaseLock, supportsReleaseLock } from "@/lib/release-locks";
import { isSkippable } from "@/lib/version-status";

export const runtime = "nodejs";

/**
 * @swagger
 * /api/v1/versions/{version}:
 *   get:
 *     summary: Get version details
 *     description: Returns metadata and asset locations for a specific cached chart version.
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
 *         description: The chart version metadata.
 *       404:
 *         description: Version not found in cache.
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
        details: [
          {
            reason: "CACHE_NOT_INITIALIZED",
          },
        ],
      });
    }

    const versionEntry = cache.versions.find((v) => v.version === version);
    if (!versionEntry) {
      return createErrorResponse({
        request,
        status: 404,
        message: `Version ${version} does not exist in the cache.`,
        details: [
          {
            reason: "VERSION_NOT_FOUND",
            availableVersions: cache.versions.map((v) => v.version),
          },
        ],
      });
    }

    let releaseLock = null;
    try {
      releaseLock = await loadReleaseLock(version);
    } catch (error) {
      console.warn(
        `[api/v1/versions/{version}] Failed to load release lock for ${version}`,
        error,
      );
    }

    const responseBody = {
      version: versionEntry.version,
      appVersion: versionEntry.appVersion ?? null,
      createTime: versionEntry.createTime ?? null,
      chartUrl: versionEntry.chartUrl,
      digest: versionEntry.digest,
      status: versionEntry.status ?? null,
      skippable: isSkippable(versionEntry.status),
      assets: {
        values: {
          path: versionEntry.values.path,
          url: versionEntry.values.url,
          hash: versionEntry.values.hash,
        },
        images: {
          path: versionEntry.images.path,
          url: versionEntry.images.url,
          hash: versionEntry.images.hash,
        },
        ...(versionEntry.imageValidation
          ? {
              validation: {
                path: versionEntry.imageValidation.path,
                url: versionEntry.imageValidation.url,
                hash: versionEntry.imageValidation.hash,
              },
            }
          : {}),
      },
      urls: {
        self: `/api/v1/versions/${version}`,
        images: `/api/v1/versions/${version}/images`,
        values: `/api/v1/versions/${version}/values`,
        ...(supportsReleaseLock(version)
          ? { releaseLock: `/api/v1/versions/${version}/release-lock` }
          : {}),
        ...(versionEntry.imageValidation
          ? { validation: `/api/v1/versions/${version}/validation` }
          : {}),
      },
      releaseLock,
    };

    return createJsonResponse(responseBody, {
      request,
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    console.error("[api/v1/versions/{version}] Failed to get version details", error);
    return createErrorResponse({
      request,
      status: 500,
      message: error instanceof Error ? error.message : "Unknown error",
      statusText: "INTERNAL",
    });
  }
}
