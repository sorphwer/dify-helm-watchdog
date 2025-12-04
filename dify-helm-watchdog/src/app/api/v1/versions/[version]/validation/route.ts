import { createErrorResponse, createJsonResponse } from "@/lib/api/response";
import { loadCache } from "@/lib/helm";
import { normalizeValidationPayload } from "@/lib/validation";

export const runtime = "nodejs";

/**
 * @swagger
 * /api/v1/versions/{version}/validation:
 *   get:
 *     summary: Get validation report for a chart version
 *     description: Returns normalized validation results for images defined in the specified Helm chart version.
 *     tags:
 *       - Validation
 *     parameters:
 *       - name: version
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Validation payload in JSON format.
 *       404:
 *         description: Validation data or version not found.
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

    if (!versionEntry.imageValidation) {
      return createErrorResponse({
        request,
        status: 404,
        message: `Image validation data is not available for version ${version}.`,
        details: [
          {
            reason: "VALIDATION_NOT_AVAILABLE",
          },
        ],
      });
    }

    let validationContent = versionEntry.imageValidation.inline;
    if (!validationContent) {
      const response = await fetch(versionEntry.imageValidation.url);
      if (!response.ok) {
        throw new Error("Failed to fetch validation data");
      }
      validationContent = await response.text();
    }

    const validationData = normalizeValidationPayload(
      JSON.parse(validationContent),
    );

    return createJsonResponse(validationData, {
      request,
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    console.error(
      "[api/v1/versions/{version}/validation] Failed to load validation data",
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

