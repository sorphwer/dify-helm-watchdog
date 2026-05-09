import { createErrorResponse, createJsonResponse } from "@/lib/api/response";
import { queryAnalytics } from "@/lib/analytics/track";

export const runtime = "nodejs";

const ALLOWED_WINDOWS = ["7d", "30d", "90d"] as const;
type WindowParam = (typeof ALLOWED_WINDOWS)[number];

const parseWindow = (raw: string | null): WindowParam => {
  if (raw && (ALLOWED_WINDOWS as readonly string[]).includes(raw)) {
    return raw as WindowParam;
  }
  return "7d";
};

/**
 * @swagger
 * /api/v1/analytics:
 *   get:
 *     summary: Aggregate analytics for MCP / API / Web traffic
 *     description: |
 *       Returns aggregated counts and unique-visitor estimates for the public
 *       dashboard. Backed by Cloudflare Analytics Engine.
 *     tags:
 *       - Analytics
 *     parameters:
 *       - name: window
 *         in: query
 *         schema:
 *           type: string
 *           enum: ["7d", "30d", "90d"]
 *         description: Time window. Defaults to 7d.
 *     responses:
 *       200:
 *         description: Aggregated analytics for the requested window.
 *       502:
 *         description: Upstream Cloudflare Worker query failed.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const window = parseWindow(url.searchParams.get("window"));

  try {
    const data = await queryAnalytics(window);
    return createJsonResponse(data, {
      request,
      headers: {
        "Cache-Control":
          "public, s-maxage=300, stale-while-revalidate=900",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "analytics query failed";
    return createErrorResponse({
      request,
      status: 502,
      message,
      statusText: "UNAVAILABLE",
    });
  }
}
