import { createErrorResponse, createJsonResponse } from "@/lib/api/response";

export const runtime = "nodejs";

const TARGET_CLASS =
  'w-[960px] max-w-full mx-auto px-5 py-2xl flex flex-col gap-2xl';

/**
 * Extract the target div (and its children) from raw HTML using nested-tag
 * counting so that inner `<div>` elements don't break the extraction.
 */
function extractTargetDiv(html: string): string | null {
  const needle = `class="${TARGET_CLASS}"`;
  const classIdx = html.indexOf(needle);
  if (classIdx === -1) return null;

  // Walk backwards to find the opening `<div`
  const openTag = html.lastIndexOf("<div", classIdx);
  if (openTag === -1) return null;

  // Walk forward counting open/close div tags
  let depth = 0;
  const divOpen = /<div[\s>]/gi;
  const divClose = /<\/div\s*>/gi;

  // Merge open and close positions into a sorted list
  type TagHit = { pos: number; isOpen: boolean };
  const hits: TagHit[] = [];

  divOpen.lastIndex = openTag;
  let m: RegExpExecArray | null;
  while ((m = divOpen.exec(html)) !== null) {
    hits.push({ pos: m.index, isOpen: true });
  }
  divClose.lastIndex = openTag;
  while ((m = divClose.exec(html)) !== null) {
    hits.push({ pos: m.index, isOpen: false });
  }
  hits.sort((a, b) => a.pos - b.pos);

  for (const hit of hits) {
    depth += hit.isOpen ? 1 : -1;
    if (depth === 0) {
      // Find the `>` that closes `</div>`
      const end = html.indexOf(">", hit.pos) + 1;
      return html.slice(openTag, end);
    }
  }

  return null;
}

/**
 * Strip script tags from HTML for safety.
 */
function stripScripts(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script\s*>/gi, "");
}

const EE_ORIGIN = "https://ee.dify.ai";

/**
 * Rewrite relative hrefs and srcs to absolute ee.dify.ai URLs
 * and open them in a new tab.
 */
function rewriteLinks(html: string): string {
  return html.replace(
    /(<a\s[^>]*?)href="(\/[^"]*)"([^>]*>)/gi,
    (_match, before: string, path: string, after: string) =>
      `${before}href="${EE_ORIGIN}${path}" target="_blank" rel="noopener noreferrer"${after}`,
  ).replace(
    /(<img\s[^>]*?)src="(\/[^"]*)"([^>]*>)/gi,
    (_match, before: string, path: string, after: string) =>
      `${before}src="${EE_ORIGIN}${path}"${after}`,
  );
}

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
    const extracted = extractTargetDiv(html);

    if (!extracted) {
      return createErrorResponse({
        request,
        status: 502,
        message: "Could not locate release notes content on upstream page",
        statusText: "UNAVAILABLE",
      });
    }

    const sanitised = rewriteLinks(stripScripts(extracted));

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
