import { createErrorResponse, createJsonResponse, createTextResponse } from "@/lib/api/response";
import { loadCache } from "@/lib/helm";
import type { ImageValidationRecord } from "@/lib/types";
import { normalizeValidationRecord } from "@/lib/validation";
import YAML from "yaml";

export const runtime = "nodejs";

interface ImageInfo {
  repository: string;
  tag: string;
}

interface ImageEntry extends ImageInfo {
  path: string;
  targetImageName?: string;
  validation?: {
    status: ImageValidationRecord["status"];
    variants: ImageValidationRecord["variants"];
  };
}

interface ImagesResponse {
  version: string;
  appVersion: string | null;
  total: number;
  images: ImageEntry[];
}

/**
 * @swagger
 * /api/v1/versions/{version}/images:
 *   get:
 *     summary: List images declared by a chart version
 *     description: Returns container image references extracted from the Helm chart values file, optionally enriched with validation results.
 *     tags:
 *       - Images
 *     parameters:
 *       - name: version
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: format
 *         in: query
 *         description: Selects the response format, JSON by default.
 *         schema:
 *           type: string
 *           enum: [json, yaml]
 *           default: json
 *       - name: includeValidation
 *         in: query
 *         description: Whether to include validation information alongside each image.
 *         schema:
 *           type: boolean
 *       - name: include_validation
 *         in: query
 *         description: Deprecated alias of includeValidation.
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: Image list in JSON or YAML.
 *       404:
 *         description: Version or cache not available.
 *       500:
 *         description: Internal server error.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ version: string }> },
) {
  try {
    const { version } = await params;
    const url = new URL(request.url);
    const format = url.searchParams.get("format") || "json";
    const includeValidationParam =
      url.searchParams.get("includeValidation") ??
      url.searchParams.get("include_validation");
    const includeValidation = includeValidationParam === "true";

    const cache = await loadCache();
    if (!cache) {
      return createErrorResponse({
        request,
        status: 404,
        message: "Cache not available. Trigger the cron job first.",
        details: [
          {
            reason: "CACHE_NOT_INITIALIZED",
          },
        ],
      });
    }

    const versionEntry = cache.versions.find((v) => v.version === version);
    if (!versionEntry) {
      return createErrorResponse({
        request,
        status: 404,
        message: `Version ${version} does not exist in the cache.`,
        details: [
          {
            reason: "VERSION_NOT_FOUND",
            availableVersions: cache.versions.map((v) => v.version),
          },
        ],
      });
    }

    let imagesText = versionEntry.images.inline;
    if (!imagesText) {
      const response = await fetch(versionEntry.images.url);
      if (!response.ok) {
        throw new Error("Failed to fetch images data");
      }
      imagesText = await response.text();
    }

    const imagesData = YAML.parse(imagesText) as Record<string, ImageInfo>;

    let validationData: Record<string, ImageValidationRecord> | null = null;
    if (includeValidation && versionEntry.imageValidation) {
      try {
        let validationText = versionEntry.imageValidation.inline;
        if (!validationText) {
          const response = await fetch(versionEntry.imageValidation.url);
          if (response.ok) {
            validationText = await response.text();
          }
        }
        if (validationText) {
          const validation = JSON.parse(validationText) as {
            images?: ImageValidationRecord[];
          };
          validationData = {};
          for (const img of validation.images ?? []) {
            const normalized = normalizeValidationRecord(img);
            const key = `${normalized.sourceRepository}:${normalized.sourceTag}`;
            validationData[key] = normalized;
          }
        }
      } catch (error) {
        console.warn(
          `[api/v1/versions/images] Failed to load validation data for ${version}`,
          error,
        );
      }
    }

    const images: ImageEntry[] = Object.entries(imagesData).map(([path, info]) => {
      const entry: ImageEntry = {
        path,
        repository: info.repository,
        tag: info.tag,
      };

      if (validationData) {
        const key = `${info.repository}:${info.tag}`;
        const validation = validationData[key];
        if (validation) {
          entry.targetImageName = validation.targetImageName;
          entry.validation = {
            status: validation.status,
            variants: validation.variants,
          };
        }
      }

      return entry;
    });

    if (format === "yaml") {
      type YamlEntry = {
        repository: string;
        tag: string;
        targetImageName?: string;
        validation?: ImageEntry["validation"];
      };

      const yamlContent = YAML.stringify(
        images.reduce<Record<string, YamlEntry>>((acc, img) => {
          acc[img.path] = {
            repository: img.repository,
            tag: img.tag,
            ...(img.targetImageName ? { targetImageName: img.targetImageName } : {}),
            ...(img.validation ? { validation: img.validation } : {}),
          };
          return acc;
        }, {}),
      );

      return createTextResponse(yamlContent, {
        request,
        status: 200,
        contentType: "application/x-yaml; charset=utf-8",
        headers: {
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        },
      });
    }

    const responseBody: ImagesResponse = {
      version: versionEntry.version,
      appVersion: versionEntry.appVersion ?? null,
      total: images.length,
      images,
    };

    return createJsonResponse(responseBody, {
      request,
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    console.error("[api/v1/versions/{version}/images] Failed to load images", error);
    return createErrorResponse({
      request,
      status: 500,
      message: error instanceof Error ? error.message : "Unknown error",
      statusText: "INTERNAL",
    });
  }
}

