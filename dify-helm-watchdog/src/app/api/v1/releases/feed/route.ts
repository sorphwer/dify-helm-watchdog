import { createErrorResponse, createJsonResponse } from "@/lib/api/response";
import { fetchReleaseFeed } from "@/lib/release-feed";

export const runtime = "nodejs";

/**
 * @swagger
 * /api/v1/releases/feed:
 *   get:
 *     summary: Proxy release metadata from ee.dify.ai feed.json
 *     description: >
 *       Fetches the ee.dify.ai JSON Feed and returns parsed release metadata
 *       for UI badges and release-note fallbacks.
 *     tags:
 *       - Releases
 *     responses:
 *       200:
 *         description: Parsed release feed entries.
 *       502:
 *         description: Failed to fetch from upstream.
 */
export async function GET(request: Request) {
  try {
    const map = await fetchReleaseFeed();
    return createJsonResponse(
      { items: Array.from(map.values()) },
      {
        request,
        headers: {
          "Cache-Control":
            "public, s-maxage=3600, stale-while-revalidate=86400",
        },
      },
    );
  } catch (error) {
    console.error("[api/v1/releases/feed] Failed to fetch release feed", error);
    return createErrorResponse({
      request,
      status: 502,
      message: error instanceof Error ? error.message : "Unknown error",
      statusText: "UNAVAILABLE",
    });
  }
}
