import {
  NextResponse,
  type NextFetchEvent,
  type NextRequest,
} from "next/server";

import {
  computeSessionHashFromHeaders,
  extractCountry,
  extractIp,
} from "@/lib/analytics/session";
import { trackEvent, type TrackEventInput } from "@/lib/analytics/track";
import { isSuspiciousApiPath } from "@/lib/api/guard";
import { checkRateLimit } from "@/lib/api/rate-limit";

const EXCLUDED_API_PREFIXES = ["cron", "mcp", "sse", "analytics"];

const isExcludedApiSub = (sub: string): boolean =>
  EXCLUDED_API_PREFIXES.includes(sub.split("/")[0]);

const buildEvent = async (
  req: NextRequest,
): Promise<TrackEventInput | null> => {
  const path = req.nextUrl.pathname;
  const country = extractCountry(req.headers);

  if (path === "/") {
    const sessionHash = await computeSessionHashFromHeaders(req.headers);
    return { kind: "page", name: "home", sessionHash, country };
  }

  if (path.startsWith("/api/v1/")) {
    const sub = path.slice("/api/v1/".length).replace(/^\/+|\/+$/g, "");
    if (!sub) return null;
    if (isExcludedApiSub(sub)) return null;
    const sessionHash = await computeSessionHashFromHeaders(req.headers);
    return { kind: "api", name: sub.slice(0, 200), sessionHash, country };
  }

  return null;
};

export async function middleware(
  req: NextRequest,
  fetchEvent: NextFetchEvent,
): Promise<NextResponse> {
  // WHATWG URL keeps percent-encoded octets (%2e, %2f, %5c, %3a, %252f, ...)
  // verbatim in pathname — it does NOT decode them — so encoded scanner payloads
  // stay visible to the guard below. The only normalization is collapsing a
  // standalone real-slash dot-segment ("/%2e%2e/" -> "/"), which is harmless:
  // that path just 404s, and smuggling real traversal needs an ENCODED slash,
  // which is preserved and matched. req.nextUrl.pathname behaves identically.
  const rawPath = new URL(req.url).pathname;

  if (rawPath.startsWith("/api/v1/")) {
    // Reject traversal / SSRF / LFI / CRLF fuzzing structurally. Returning a
    // non-next() response short-circuits before the route function (and its R2
    // reads) runs, and skips the outbound analytics fetch entirely.
    if (isSuspiciousApiPath(rawPath)) {
      return new NextResponse(null, { status: 400 });
    }

    // Best-effort rate limit on the public read API. The excluded prefixes have
    // their own auth (cron) or are long-lived/instrumented (mcp, sse, analytics).
    const sub = rawPath.slice("/api/v1/".length).replace(/^\/+|\/+$/g, "");
    if (sub && !isExcludedApiSub(sub)) {
      const { ok, retryAfter } = checkRateLimit(extractIp(req.headers));
      if (!ok) {
        return new NextResponse(null, {
          status: 429,
          headers: { "Retry-After": String(retryAfter) },
        });
      }
    }
  }

  try {
    const event = await buildEvent(req);
    if (event) {
      // waitUntil keeps the Function alive until the track fetch resolves.
      // Without it Vercel kills the in-flight request the moment we return
      // NextResponse.next(), and the event never reaches the Worker.
      fetchEvent.waitUntil(trackEvent(event).catch(() => {}));
    }
  } catch {
    // never block on analytics
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/api/v1/:path*"],
};
