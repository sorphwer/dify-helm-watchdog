import { createErrorResponse, createTextResponse } from "@/lib/api/response";
import { loadCache } from "@/lib/helm";

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

    let valuesContent = versionEntry.values.inline;
    if (!valuesContent) {
      const response = await fetch(versionEntry.values.url);
      if (!response.ok) {
        throw new Error("Failed to fetch values.yaml");
      }
      valuesContent = await response.text();
    }

    return createTextResponse(valuesContent, {
      request,
      status: 200,
      contentType: "application/x-yaml; charset=utf-8",
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
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

