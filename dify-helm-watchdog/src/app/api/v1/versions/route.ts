import { createErrorResponse, createJsonResponse } from "@/lib/api/response";
import { loadCache } from "@/lib/helm";
import type { ImageValidationRecord, StoredVersion } from "@/lib/types";
import { countValidationStatuses } from "@/lib/validation";

export const runtime = "nodejs";

interface VersionSummary {
  version: string;
  appVersion: string | null;
  createTime: string | null;
  digest?: string;
  imageValidation?: {
    total: number;
    allFound: number;
    partial: number;
    missing: number;
    error: number;
  };
}

interface VersionsResponse {
  updateTime: string | null;
  total: number;
  versions: VersionSummary[];
}

const computeImageValidationStats = async (
  version: StoredVersion,
): Promise<VersionSummary["imageValidation"] | undefined> => {
  if (!version.imageValidation) {
    return undefined;
  }

  try {
    let validationText = version.imageValidation.inline;

    if (!validationText) {
      const response = await fetch(version.imageValidation.url);
      if (!response.ok) {
        return undefined;
      }
      validationText = await response.text();
    }

    const validation = JSON.parse(validationText) as {
      images?: ImageValidationRecord[];
    };

    return countValidationStatuses(validation.images ?? []);
  } catch (error) {
    console.warn(
      `[api/v1/versions] Failed to parse image validation for ${version.version}`,
      error,
    );
    return undefined;
  }
};

/**
 * @swagger
 * /api/v1/versions:
 *   get:
 *     summary: List available Helm chart versions
 *     description: Returns a paginated collection of cached chart versions with optional aggregated validation statistics.
 *     tags:
 *       - Versions
 *     parameters:
 *       - name: includeValidation
 *         in: query
 *         description: Whether to include image validation summary in the response.
 *         schema:
 *           type: boolean
 *       - name: include_validation
 *         in: query
 *         description: Deprecated alias of includeValidation.
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: A JSON payload containing chart versions.
 *       500:
 *         description: Internal server error.
 */
export async function GET(request: Request) {
  try {
    const cache = await loadCache();

    if (!cache) {
      const emptyResponse: VersionsResponse = {
        updateTime: null,
        total: 0,
        versions: [],
      };

      return createJsonResponse(emptyResponse, {
        request,
        headers: {
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        },
      });
    }

    const url = new URL(request.url);
    const includeValidationParam =
      url.searchParams.get("includeValidation") ??
      url.searchParams.get("include_validation");
    const includeValidation = includeValidationParam === "true";

    const versions: VersionSummary[] = await Promise.all(
      cache.versions.map(async (version) => {
        const summary: VersionSummary = {
          version: version.version,
          appVersion: version.appVersion ?? null,
          createTime: version.createTime ?? null,
          digest: version.digest,
        };

        if (includeValidation) {
          summary.imageValidation = await computeImageValidationStats(version);
        }

        return summary;
      }),
    );

    const response: VersionsResponse = {
      updateTime: cache.updateTime ?? null,
      total: versions.length,
      versions,
    };

    return createJsonResponse(response, {
      request,
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    console.error("[api/v1/versions] Failed to load versions", error);
    return createErrorResponse({
      request,
      status: 500,
      message: error instanceof Error ? error.message : "Unknown error",
      statusText: "INTERNAL",
    });
  }
}

