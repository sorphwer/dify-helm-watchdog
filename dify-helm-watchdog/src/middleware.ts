import { NextResponse, type NextRequest } from "next/server";

import { computeSessionHashFromHeaders } from "@/lib/analytics/session";
import { trackEvent, type TrackEventInput } from "@/lib/analytics/track";

const EXCLUDED_API_PREFIXES = ["cron", "mcp", "sse", "analytics"];

const buildEvent = async (
  req: NextRequest,
): Promise<TrackEventInput | null> => {
  const path = req.nextUrl.pathname;

  if (path === "/") {
    const sessionHash = await computeSessionHashFromHeaders(req.headers);
    return { kind: "page", name: "home", sessionHash };
  }

  if (path.startsWith("/api/v1/")) {
    const sub = path.slice("/api/v1/".length).replace(/^\/+|\/+$/g, "");
    if (!sub) return null;
    const head = sub.split("/")[0];
    if (EXCLUDED_API_PREFIXES.includes(head)) return null;
    const sessionHash = await computeSessionHashFromHeaders(req.headers);
    return { kind: "api", name: sub.slice(0, 200), sessionHash };
  }

  return null;
};

export async function middleware(req: NextRequest): Promise<NextResponse> {
  try {
    const event = await buildEvent(req);
    if (event) {
      // Fire-and-forget. Analytics never blocks the actual response.
      // trackEvent swallows its own errors but we add a defensive catch in
      // case a future change ever lets one escape — middleware must not
      // produce unhandled rejections.
      trackEvent(event).catch(() => {});
    }
  } catch {
    // never block on analytics
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/api/v1/:path*"],
};
