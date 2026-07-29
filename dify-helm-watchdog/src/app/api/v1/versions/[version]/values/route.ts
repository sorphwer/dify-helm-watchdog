import {
  createErrorResponse,
  createTextResponse,
  PUBLIC_ARTIFACT_CACHE_CONTROL,
} from "@/lib/api/response";
import { isValidVersion } from "@/lib/api/guard";
import { loadCache, loadStoredAsset } from "@/lib/helm";

export const runtime = "nodejs";

/**
 * @swagger
 * /api/v1/versions/{version}/values:
 *   get:
 *     summary: Download chart values file
 *     description: Streams the cached values.yaml file for the requested chart version.
 *     tags:
 *       - Values
 *     parameters:
 *       - name: version
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: YAML document containing chart values.
 *       404:
 *         description: Version or cache not available.
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

    const valuesContent =
      versionEntry.values.inline ??
      (await loadStoredAsset(versionEntry.values));

    return createTextResponse(valuesContent, {
      request,
      status: 200,
      contentType: "application/x-yaml; charset=utf-8",
      headers: {
        "Cache-Control": PUBLIC_ARTIFACT_CACHE_CONTROL,
        "Content-Disposition": `inline; filename="values-${version}.yaml"`,
      },
    });
  } catch (error) {
    console.error("[api/v1/versions/{version}/values] Failed to load values.yaml", error);
    return createErrorResponse({
      request,
      status: 500,
      message: error instanceof Error ? error.message : "Unknown error",
      statusText: "INTERNAL",
    });
  }
}

