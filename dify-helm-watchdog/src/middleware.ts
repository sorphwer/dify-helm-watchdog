import {
  NextResponse,
  type NextFetchEvent,
  type NextRequest,
} from "next/server";

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

export async function middleware(
  req: NextRequest,
  fetchEvent: NextFetchEvent,
): Promise<NextResponse> {
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
