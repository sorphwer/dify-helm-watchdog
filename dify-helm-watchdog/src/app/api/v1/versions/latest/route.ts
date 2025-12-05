import { createErrorResponse, createJsonResponse } from "@/lib/api/response";
import { loadCache } from "@/lib/helm";

export const runtime = "nodejs";

/**
 * @swagger
 * /api/v1/versions/latest:
 *   get:
 *     summary: Resolve the most recent chart version
 *     description: Returns convenience links to the most recent cached chart version and its related resources.
 *     tags:
 *       - Versions
 *     parameters:
 *       - name: versionOnly
 *         in: query
 *         description: When true, returns only the version string as plain text instead of the full JSON response.
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: Metadata about the latest chart version (JSON) or version string (plain text if versionOnly=true).
 *       404:
 *         description: No cached versions available.
 *       500:
 *         description: Internal server error.
 */
export async function GET(request: Request) {
  try {
    const cache = await loadCache();

    if (!cache || cache.versions.length === 0) {
      return createErrorResponse({
        request,
        status: 404,
        message: "No cached versions found. Trigger the cron job first.",
        details: [
          {
            reason: "NO_VERSIONS_AVAILABLE",
          },
        ],
      });
    }

    const latestVersion = cache.versions[0];

    // Check for versionOnly parameter
    const url = new URL(request.url);
    const versionOnly = url.searchParams.get("versionOnly") === "true";

    if (versionOnly) {
      return new Response(latestVersion.version, {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600",
        },
      });
    }

    const responseBody = {
      version: latestVersion.version,
      appVersion: latestVersion.appVersion ?? null,
      createTime: latestVersion.createTime ?? null,
      digest: latestVersion.digest,
      urls: {
        self: `/api/v1/versions/${latestVersion.version}`,
        images: `/api/v1/versions/${latestVersion.version}/images`,
        values: `/api/v1/versions/${latestVersion.version}/values`,
        ...(latestVersion.imageValidation
          ? { validation: `/api/v1/versions/${latestVersion.version}/validation` }
          : {}),
      },
    };

    return createJsonResponse(responseBody, {
      request,
      headers: {
        "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600",
      },
    });
  } catch (error) {
    console.error("[api/v1/versions/latest] Failed to get latest version", error);
    return createErrorResponse({
      request,
      status: 500,
      message: error instanceof Error ? error.message : "Unknown error",
      statusText: "INTERNAL",
    });
  }
}

