/**
 * MCP Tools implementation
 * Exposes Helm chart operations as callable MCP tools
 */

import { loadCache } from "@/lib/helm";
import type { ImageValidationRecord, StoredVersion } from "@/lib/types";
import { countValidationStatuses, normalizeValidationPayload } from "@/lib/validation";
import YAML from "yaml";
import type {
  McpToolDefinition,
  McpToolResult,
  McpTextContent,
} from "./types";

// Tool definitions
export const TOOLS: McpToolDefinition[] = [
  {
    name: "list_versions",
    description:
      "Lists all available Dify Helm chart versions with optional validation statistics. Returns version numbers, app versions, creation times, and aggregated image validation counts.",
    inputSchema: {
      type: "object",
      properties: {
        includeValidation: {
          type: "boolean",
          description:
            "When true, includes image validation statistics (total, allFound, partial, missing, error counts) for each version.",
        },
      },
    },
  },
  {
    name: "get_latest_version",
    description:
      "Returns information about the most recent Dify Helm chart version, including version number, app version, creation time, and available resource URLs.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_version_details",
    description:
      "Returns detailed metadata for a specific Helm chart version, including chart URL, digest, and asset locations for values.yaml, images, and validation data.",
    inputSchema: {
      type: "object",
      properties: {
        version: {
          type: "string",
          description: "The chart version to retrieve (e.g., '1.0.0').",
        },
      },
      required: ["version"],
    },
  },
  {
    name: "list_images",
    description:
      "Lists all container images declared in a Helm chart version's values.yaml. Optionally includes validation status for each image.",
    inputSchema: {
      type: "object",
      properties: {
        version: {
          type: "string",
          description: "The chart version to retrieve images for (e.g., '1.0.0').",
        },
        includeValidation: {
          type: "boolean",
          description:
            "When true, includes validation status and variant information for each image.",
        },
      },
      required: ["version"],
    },
  },
  {
    name: "validate_images",
    description:
      "Returns the image validation report for a specific Helm chart version. Shows which images exist in the target registry and their availability across different architectures (amd64, arm64).",
    inputSchema: {
      type: "object",
      properties: {
        version: {
          type: "string",
          description: "The chart version to validate images for (e.g., '1.0.0').",
        },
        onlyMissing: {
          type: "boolean",
          description: "When true, only returns images with status 'MISSING'.",
        },
      },
      required: ["version"],
    },
  },
];

// Helper to create text content
const textContent = (text: string): McpTextContent => ({
  type: "text",
  text,
});

// Helper to create error result
const errorResult = (message: string): McpToolResult => ({
  content: [textContent(message)],
  isError: true,
});

// Helper to create JSON result
const jsonResult = (data: unknown): McpToolResult => ({
  content: [textContent(JSON.stringify(data, null, 2))],
});

// Result type for findVersion
type FindVersionSuccess = { success: true; entry: StoredVersion; cache: NonNullable<Awaited<ReturnType<typeof loadCache>>> };
type FindVersionError = { success: false; error: McpToolResult };
type FindVersionResult = FindVersionSuccess | FindVersionError;

// Helper to find version in cache
const findVersion = async (version: string): Promise<FindVersionResult> => {
  const cache = await loadCache();
  if (!cache) {
    return {
      success: false,
      error: errorResult("Cache not available. The cron job needs to be triggered first to populate the cache."),
    };
  }

  const entry = cache.versions.find((v) => v.version === version);
  if (!entry) {
    const availableVersions = cache.versions.slice(0, 10).map((v) => v.version);
    return {
      success: false,
      error: errorResult(
        `Version ${version} not found. Available versions include: ${availableVersions.join(", ")}${cache.versions.length > 10 ? "..." : ""}`,
      ),
    };
  }

  return { success: true, entry, cache };
};

// Tool implementations
const listVersions = async (
  args: Record<string, unknown>,
): Promise<McpToolResult> => {
  const includeValidation = args.includeValidation === true;
  const cache = await loadCache();

  if (!cache) {
    return jsonResult({
      updateTime: null,
      total: 0,
      versions: [],
      message: "Cache not initialized. Trigger the cron job first.",
    });
  }

  const versions = await Promise.all(
    cache.versions.map(async (version) => {
      const summary: Record<string, unknown> = {
        version: version.version,
        appVersion: version.appVersion ?? null,
        createTime: version.createTime ?? null,
        digest: version.digest,
      };

      if (includeValidation && version.imageValidation) {
        try {
          let validationText = version.imageValidation.inline;
          if (!validationText) {
            const response = await fetch(version.imageValidation.url);
            if (response.ok) {
              validationText = await response.text();
            }
          }
          if (validationText) {
            const validation = JSON.parse(validationText) as {
              images?: ImageValidationRecord[];
            };
            summary.imageValidation = countValidationStatuses(validation.images ?? []);
          }
        } catch {
          // Skip validation stats on error
        }
      }

      return summary;
    }),
  );

  return jsonResult({
    updateTime: cache.updateTime ?? null,
    total: versions.length,
    versions,
  });
};

const getLatestVersion = async (): Promise<McpToolResult> => {
  const cache = await loadCache();

  if (!cache || cache.versions.length === 0) {
    return errorResult("No cached versions found. Trigger the cron job first.");
  }

  const latest = cache.versions[0];
  return jsonResult({
    version: latest.version,
    appVersion: latest.appVersion ?? null,
    createTime: latest.createTime ?? null,
    digest: latest.digest,
    urls: {
      self: `/api/v1/versions/${latest.version}`,
      images: `/api/v1/versions/${latest.version}/images`,
      values: `/api/v1/versions/${latest.version}/values`,
      ...(latest.imageValidation
        ? { validation: `/api/v1/versions/${latest.version}/validation` }
        : {}),
    },
  });
};

const getVersionDetails = async (
  args: Record<string, unknown>,
): Promise<McpToolResult> => {
  const version = String(args.version ?? "");
  if (!version) {
    return errorResult("Missing required parameter: version");
  }

  const result = await findVersion(version);
  if (!result.success) {
    return result.error;
  }

  const { entry } = result;
  return jsonResult({
    version: entry.version,
    appVersion: entry.appVersion ?? null,
    createTime: entry.createTime ?? null,
    chartUrl: entry.chartUrl,
    digest: entry.digest,
    assets: {
      values: {
        path: entry.values.path,
        url: entry.values.url,
        hash: entry.values.hash,
      },
      images: {
        path: entry.images.path,
        url: entry.images.url,
        hash: entry.images.hash,
      },
      ...(entry.imageValidation
        ? {
            validation: {
              path: entry.imageValidation.path,
              url: entry.imageValidation.url,
              hash: entry.imageValidation.hash,
            },
          }
        : {}),
    },
    urls: {
      self: `/api/v1/versions/${version}`,
      images: `/api/v1/versions/${version}/images`,
      values: `/api/v1/versions/${version}/values`,
      ...(entry.imageValidation
        ? { validation: `/api/v1/versions/${version}/validation` }
        : {}),
    },
  });
};

interface ImageInfo {
  repository: string;
  tag: string;
}

const listImages = async (
  args: Record<string, unknown>,
): Promise<McpToolResult> => {
  const version = String(args.version ?? "");
  if (!version) {
    return errorResult("Missing required parameter: version");
  }

  const includeValidation = args.includeValidation === true;

  const result = await findVersion(version);
  if (!result.success) {
    return result.error;
  }

  const { entry } = result;

  // Load images data
  let imagesText = entry.images.inline;
  if (!imagesText) {
    const response = await fetch(entry.images.url);
    if (!response.ok) {
      return errorResult("Failed to fetch images data from storage.");
    }
    imagesText = await response.text();
  }

  const imagesData = YAML.parse(imagesText) as Record<string, ImageInfo>;

  // Load validation data if requested
  let validationData: Record<string, ImageValidationRecord> | null = null;
  if (includeValidation && entry.imageValidation) {
    try {
      let validationText = entry.imageValidation.inline;
      if (!validationText) {
        const response = await fetch(entry.imageValidation.url);
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
          const key = `${img.sourceRepository}:${img.sourceTag}`;
          validationData[key] = img;
        }
      }
    } catch {
      // Skip validation on error
    }
  }

  const images = Object.entries(imagesData).map(([path, info]) => {
    const entry: Record<string, unknown> = {
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

  return jsonResult({
    version: entry.version,
    appVersion: entry.appVersion ?? null,
    total: images.length,
    images,
  });
};

const validateImages = async (
  args: Record<string, unknown>,
): Promise<McpToolResult> => {
  const version = String(args.version ?? "");
  if (!version) {
    return errorResult("Missing required parameter: version");
  }

  const onlyMissing = args.onlyMissing === true;

  const result = await findVersion(version);
  if (!result.success) {
    return result.error;
  }

  const { entry } = result;

  if (!entry.imageValidation) {
    return errorResult(`Image validation data is not available for version ${version}.`);
  }

  let validationContent = entry.imageValidation.inline;
  if (!validationContent) {
    const response = await fetch(entry.imageValidation.url);
    if (!response.ok) {
      return errorResult("Failed to fetch validation data from storage.");
    }
    validationContent = await response.text();
  }

  const validationData = normalizeValidationPayload(JSON.parse(validationContent));

  if (onlyMissing) {
    validationData.images = validationData.images.filter(
      (img) => img.status === "MISSING",
    );
  }

  return jsonResult(validationData);
};

// Tool executor
export const executeTool = async (
  name: string,
  args: Record<string, unknown>,
): Promise<McpToolResult> => {
  switch (name) {
    case "list_versions":
      return listVersions(args);
    case "get_latest_version":
      return getLatestVersion();
    case "get_version_details":
      return getVersionDetails(args);
    case "list_images":
      return listImages(args);
    case "validate_images":
      return validateImages(args);
    default:
      return errorResult(`Unknown tool: ${name}`);
  }
};

