import { createJsonResponse } from "@/lib/api/response";
import { loadCache } from "@/lib/helm";

export const runtime = "nodejs";

/**
 * @swagger
 * /api/v1/cache:
 *   get:
 *     summary: Inspect cached Helm metadata
 *     description: Returns the full cache payload, including update timestamp and all tracked versions.
 *     tags:
 *       - Cache
 *     responses:
 *       200:
 *         description: Cache contents in JSON format.
 */
export async function GET(request: Request) {
  const cache = await loadCache();

  if (!cache) {
    return createJsonResponse(
      {
        updateTime: null,
        versions: [],
      },
      {
        request,
      },
    );
  }

  return createJsonResponse(cache, {
    request,
  });
}
