import { createErrorResponse, createJsonResponse } from "@/lib/api/response";
import { sanitizeEeReleaseHtml } from "@/lib/release-notes";

export const runtime = "nodejs";

/**
 * @swagger
 * /api/v1/releases/{version}:
 *   get:
 *     summary: Proxy release notes HTML from ee.dify.ai
 *     description: >
 *       Fetches the release notes page for a given version from ee.dify.ai,
 *       extracts the main content div, and returns sanitised HTML.
 *     tags:
 *       - Releases
 *     parameters:
 *       - name: version
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         example: "3.9.0"
 *     responses:
 *       200:
 *         description: Extracted release notes HTML.
 *       400:
 *         description: Invalid version format.
 *       502:
 *         description: Failed to fetch from upstream.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ version: string }> },
) {
  const { version } = await params;

  if (!/^\d+\.\d+\.\d+/.test(version)) {
    return createErrorResponse({
      request,
      status: 400,
      message: `Invalid version format: ${version}`,
      statusText: "INVALID_ARGUMENT",
    });
  }

  try {
    const upstream = `https://ee.dify.ai/releases/v${version}`;
    const res = await fetch(upstream, {
      headers: { "User-Agent": "dify-helm-watchdog/1.0" },
      next: { revalidate: 3600 },
    });

    if (!res.ok) {
      return createErrorResponse({
        request,
        status: 502,
        message: `Upstream returned HTTP ${res.status}`,
        statusText: "UNAVAILABLE",
      });
    }

    const html = await res.text();
    const sanitised = sanitizeEeReleaseHtml(html);

    if (!sanitised) {
      return createErrorResponse({
        request,
        status: 502,
        message: "Could not locate release notes content on upstream page",
        statusText: "UNAVAILABLE",
      });
    }

    return createJsonResponse(
      { version, html: sanitised },
      {
        request,
        headers: {
          "Cache-Control":
            "public, s-maxage=3600, stale-while-revalidate=86400",
        },
      },
    );
  } catch (error) {
    console.error(
      `[api/v1/releases] Failed to fetch release notes for v${version}`,
      error,
    );
    return createErrorResponse({
      request,
      status: 502,
      message: error instanceof Error ? error.message : "Unknown error",
      statusText: "UNAVAILABLE",
    });
  }
}
