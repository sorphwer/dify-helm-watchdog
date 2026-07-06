import { createErrorResponse, createJsonResponse } from "@/lib/api/response";
import { isValidVersion } from "@/lib/api/guard";
import {
  buildFeedFallbackHtml,
  fetchReleaseFeedSafe,
} from "@/lib/release-feed";
import { sanitizeEeReleaseHtml } from "@/lib/release-notes";

export const runtime = "nodejs";

const CACHE_CONTROL = "public, s-maxage=3600, stale-while-revalidate=86400";

const feedFallbackResponse = async (
  request: Request,
  version: string,
): Promise<Response | null> => {
  const feed = await fetchReleaseFeedSafe((message) =>
    console.warn("[api/v1/releases] feed fallback:", message),
  );
  const entry = feed?.get(version);
  if (!entry) return null;

  return createJsonResponse(
    { version, html: buildFeedFallbackHtml(entry), source: "feed" },
    {
      request,
      headers: {
        "Cache-Control": CACHE_CONTROL,
      },
    },
  );
};

/**
 * @swagger
 * /api/v1/releases/{version}:
 *   get:
 *     summary: Proxy release notes HTML from ee.dify.ai
 *     description: >
 *       Fetches the release notes page for a given version from ee.dify.ai,
 *       extracts the main content div, and returns sanitised HTML. If the
 *       page cannot be scraped, returns the release feed summary as a fallback.
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

  if (!isValidVersion(version)) {
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
      const fallback = await feedFallbackResponse(request, version);
      if (fallback) return fallback;

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
      const fallback = await feedFallbackResponse(request, version);
      if (fallback) return fallback;

      return createErrorResponse({
        request,
        status: 502,
        message: "Could not locate release notes content on upstream page",
        statusText: "UNAVAILABLE",
      });
    }

    return createJsonResponse(
      { version, html: sanitised, source: "ee" },
      {
        request,
        headers: {
          "Cache-Control": CACHE_CONTROL,
        },
      },
    );
  } catch (error) {
    console.error(
      `[api/v1/releases] Failed to fetch release notes for v${version}`,
      error,
    );
    const fallback = await feedFallbackResponse(request, version);
    if (fallback) return fallback;
    return createErrorResponse({
      request,
      status: 502,
      message: error instanceof Error ? error.message : "Unknown error",
      statusText: "UNAVAILABLE",
    });
  }
}
