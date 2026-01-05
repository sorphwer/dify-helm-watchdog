import { createJsonResponse } from "@/lib/api/response";
import { buildOpenApiSpec } from "@/lib/openapi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Returns the OpenAPI document for this service.
 *
 * Note: This is intentionally exposed at a stable root path (`/openapi.json`)
 * so external tools (Swagger UI, codegen, etc.) can consume it.
 */
export async function GET(request: Request) {
  const spec = buildOpenApiSpec();

  return createJsonResponse(spec, {
    request,
    headers: {
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}


