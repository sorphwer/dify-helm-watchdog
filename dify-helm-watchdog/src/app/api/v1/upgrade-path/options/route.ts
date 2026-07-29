import semver from "semver";
import { createErrorResponse, createJsonResponse } from "@/lib/api/response";
import { fetchEeCatalog } from "@/lib/ee-catalog";

export const runtime = "nodejs";

/**
 * @swagger
 * /api/v1/upgrade-path/options:
 *   get:
 *     summary: List Dify Enterprise versions available for upgrade planning
 *     tags:
 *       - Releases
 *     responses:
 *       200:
 *         description: Versions from the EE release catalog, newest first.
 *       502:
 *         description: Failed to fetch the upstream catalog.
 */
export async function GET(request: Request) {
  try {
    const releases = await fetchEeCatalog();
    const versions = releases
      .map((release) => release.version)
      .filter((version) => semver.valid(version))
      .sort((a, b) => semver.rcompare(a, b));

    return createJsonResponse(
      { versions },
      {
        request,
        headers: {
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        },
      },
    );
  } catch (error) {
    console.error("[api/v1/upgrade-path/options] Failed to fetch ee catalog", error);
    return createErrorResponse({
      request,
      status: 502,
      message: error instanceof Error ? error.message : "Unknown error",
      statusText: "UNAVAILABLE",
    });
  }
}
