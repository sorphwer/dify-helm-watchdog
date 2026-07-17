import { createErrorResponse, createJsonResponse } from "@/lib/api/response";
import { isValidVersion } from "@/lib/api/guard";
import { fetchEeCatalog } from "@/lib/ee-catalog";
import {
  computeUpgradePath,
  InvalidRangeError,
  UnknownVersionError,
} from "@/lib/upgrade-path";

export const runtime = "nodejs";

/**
 * @swagger
 * /api/v1/upgrade-path:
 *   get:
 *     summary: Compute the Dify Enterprise upgrade path between two versions
 *     description: >
 *       Returns the ordered list of unskippable versions between the current
 *       and target Enterprise versions, derived from the ee.dify.ai release
 *       catalog. Each hop carries stop kinds, a one-line summary, release
 *       notes URL, and the versions.lock.yaml snapshot URL.
 *     tags:
 *       - Releases
 *     parameters:
 *       - in: query
 *         name: from
 *         required: true
 *         schema: { type: string }
 *         description: Current version (with or without leading v, e.g. 3.9.5)
 *       - in: query
 *         name: to
 *         required: true
 *         schema: { type: string }
 *         description: Target version (with or without leading v)
 *     responses:
 *       200:
 *         description: Upgrade path with hops and notes.
 *       400:
 *         description: Missing/invalid parameters or from >= to.
 *       404:
 *         description: Unknown version.
 *       502:
 *         description: Failed to fetch the upstream catalog.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const from = (searchParams.get("from") ?? "").replace(/^v/, "");
  const to = (searchParams.get("to") ?? "").replace(/^v/, "");

  if (!isValidVersion(from) || !isValidVersion(to)) {
    return createErrorResponse({
      request,
      status: 400,
      message: "Query parameters 'from' and 'to' must be valid versions",
    });
  }

  let releases;
  try {
    releases = await fetchEeCatalog();
  } catch (error) {
    console.error("[api/v1/upgrade-path] Failed to fetch ee catalog", error);
    return createErrorResponse({
      request,
      status: 502,
      message: error instanceof Error ? error.message : "Unknown error",
      statusText: "UNAVAILABLE",
    });
  }

  try {
    const result = computeUpgradePath(releases, `v${from}`, `v${to}`);
    return createJsonResponse(result, {
      request,
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    if (error instanceof UnknownVersionError) {
      return createErrorResponse({ request, status: 404, message: error.message });
    }
    if (error instanceof InvalidRangeError) {
      return createErrorResponse({ request, status: 400, message: error.message });
    }
    throw error;
  }
}
