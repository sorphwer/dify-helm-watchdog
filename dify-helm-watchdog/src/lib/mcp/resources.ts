/**
 * MCP Resources implementation
 * Exposes Helm chart data as readable MCP resources
 */

import { loadCache } from "@/lib/helm";
import { normalizeValidationPayload } from "@/lib/validation";
import YAML from "yaml";
import type {
  McpResourceDefinition,
  McpResourceTemplate,
  McpReadResourceResult,
  McpResourceContent,
} from "./types";

// Static resource definitions
export const RESOURCES: McpResourceDefinition[] = [
  {
    uri: "helm://versions",
    name: "Helm Chart Versions",
    description: "List of all available Dify Helm chart versions",
    mimeType: "application/json",
  },
];

// Resource templates for dynamic resources
export const RESOURCE_TEMPLATES: McpResourceTemplate[] = [
  {
    uriTemplate: "helm://versions/{version}",
    name: "Version Details",
    description: "Detailed metadata for a specific Helm chart version",
    mimeType: "application/json",
  },
  {
    uriTemplate: "helm://versions/{version}/values",
    name: "Values YAML",
    description: "The values.yaml file for a specific Helm chart version",
    mimeType: "application/x-yaml",
  },
  {
    uriTemplate: "helm://versions/{version}/images",
    name: "Docker Images",
    description: "Container images declared in a Helm chart version",
    mimeType: "application/json",
  },
  {
    uriTemplate: "helm://versions/{version}/validation",
    name: "Image Validation",
    description: "Validation report for images in a Helm chart version",
    mimeType: "application/json",
  },
];

// Helper to create resource content
const createResourceContent = (
  uri: string,
  text: string,
  mimeType: string,
): McpResourceContent => ({
  uri,
  mimeType,
  text,
});

// Helper to create error response
const createErrorContent = (
  uri: string,
  message: string,
): McpReadResourceResult => ({
  contents: [
    createResourceContent(
      uri,
      JSON.stringify({ error: message }, null, 2),
      "application/json",
    ),
  ],
});

// Parse resource URI
interface ParsedResourceUri {
  type: "versions" | "version" | "values" | "images" | "validation";
  version?: string;
}

const parseResourceUri = (uri: string): ParsedResourceUri | null => {
  // Remove helm:// prefix
  if (!uri.startsWith("helm://")) {
    return null;
  }

  const path = uri.slice("helm://".length);
  const segments = path.split("/").filter(Boolean);

  if (segments.length === 0) {
    return null;
  }

  if (segments[0] !== "versions") {
    return null;
  }

  // helm://versions
  if (segments.length === 1) {
    return { type: "versions" };
  }

  // helm://versions/{version}
  if (segments.length === 2) {
    return { type: "version", version: segments[1] };
  }

  // helm://versions/{version}/{subresource}
  if (segments.length === 3) {
    const subresource = segments[2];
    if (subresource === "values") {
      return { type: "values", version: segments[1] };
    }
    if (subresource === "images") {
      return { type: "images", version: segments[1] };
    }
    if (subresource === "validation") {
      return { type: "validation", version: segments[1] };
    }
  }

  return null;
};

// Read versions list
const readVersions = async (uri: string): Promise<McpReadResourceResult> => {
  const cache = await loadCache();

  if (!cache) {
    return {
      contents: [
        createResourceContent(
          uri,
          JSON.stringify(
            {
              updateTime: null,
              total: 0,
              versions: [],
            },
            null,
            2,
          ),
          "application/json",
        ),
      ],
    };
  }

  const versions = cache.versions.map((v) => ({
    version: v.version,
    appVersion: v.appVersion ?? null,
    createTime: v.createTime ?? null,
    digest: v.digest,
  }));

  return {
    contents: [
      createResourceContent(
        uri,
        JSON.stringify(
          {
            updateTime: cache.updateTime ?? null,
            total: versions.length,
            versions,
          },
          null,
          2,
        ),
        "application/json",
      ),
    ],
  };
};

// Read version details
const readVersionDetails = async (
  uri: string,
  version: string,
): Promise<McpReadResourceResult> => {
  const cache = await loadCache();

  if (!cache) {
    return createErrorContent(uri, "Cache not available. Trigger the cron job first.");
  }

  const entry = cache.versions.find((v) => v.version === version);
  if (!entry) {
    return createErrorContent(uri, `Version ${version} not found in cache.`);
  }

  const details = {
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
  };

  return {
    contents: [
      createResourceContent(uri, JSON.stringify(details, null, 2), "application/json"),
    ],
  };
};

// Read values.yaml
const readValues = async (
  uri: string,
  version: string,
): Promise<McpReadResourceResult> => {
  const cache = await loadCache();

  if (!cache) {
    return createErrorContent(uri, "Cache not available. Trigger the cron job first.");
  }

  const entry = cache.versions.find((v) => v.version === version);
  if (!entry) {
    return createErrorContent(uri, `Version ${version} not found in cache.`);
  }

  let valuesContent = entry.values.inline;
  if (!valuesContent) {
    try {
      const response = await fetch(entry.values.url);
      if (!response.ok) {
        return createErrorContent(uri, "Failed to fetch values.yaml from storage.");
      }
      valuesContent = await response.text();
    } catch (error) {
      return createErrorContent(
        uri,
        `Failed to fetch values.yaml: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  return {
    contents: [createResourceContent(uri, valuesContent, "application/x-yaml")],
  };
};

// Read images list
const readImages = async (
  uri: string,
  version: string,
): Promise<McpReadResourceResult> => {
  const cache = await loadCache();

  if (!cache) {
    return createErrorContent(uri, "Cache not available. Trigger the cron job first.");
  }

  const entry = cache.versions.find((v) => v.version === version);
  if (!entry) {
    return createErrorContent(uri, `Version ${version} not found in cache.`);
  }

  let imagesText = entry.images.inline;
  if (!imagesText) {
    try {
      const response = await fetch(entry.images.url);
      if (!response.ok) {
        return createErrorContent(uri, "Failed to fetch images data from storage.");
      }
      imagesText = await response.text();
    } catch (error) {
      return createErrorContent(
        uri,
        `Failed to fetch images: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  const imagesData = YAML.parse(imagesText) as Record<
    string,
    { repository: string; tag: string }
  >;

  const images = Object.entries(imagesData).map(([path, info]) => ({
    path,
    repository: info.repository,
    tag: info.tag,
  }));

  return {
    contents: [
      createResourceContent(
        uri,
        JSON.stringify(
          {
            version: entry.version,
            appVersion: entry.appVersion ?? null,
            total: images.length,
            images,
          },
          null,
          2,
        ),
        "application/json",
      ),
    ],
  };
};

// Read validation report
const readValidation = async (
  uri: string,
  version: string,
): Promise<McpReadResourceResult> => {
  const cache = await loadCache();

  if (!cache) {
    return createErrorContent(uri, "Cache not available. Trigger the cron job first.");
  }

  const entry = cache.versions.find((v) => v.version === version);
  if (!entry) {
    return createErrorContent(uri, `Version ${version} not found in cache.`);
  }

  if (!entry.imageValidation) {
    return createErrorContent(
      uri,
      `Image validation data is not available for version ${version}.`,
    );
  }

  let validationContent = entry.imageValidation.inline;
  if (!validationContent) {
    try {
      const response = await fetch(entry.imageValidation.url);
      if (!response.ok) {
        return createErrorContent(uri, "Failed to fetch validation data from storage.");
      }
      validationContent = await response.text();
    } catch (error) {
      return createErrorContent(
        uri,
        `Failed to fetch validation: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  const validationData = normalizeValidationPayload(JSON.parse(validationContent));

  return {
    contents: [
      createResourceContent(uri, JSON.stringify(validationData, null, 2), "application/json"),
    ],
  };
};

// Main resource reader
export const readResource = async (uri: string): Promise<McpReadResourceResult> => {
  const parsed = parseResourceUri(uri);

  if (!parsed) {
    return createErrorContent(
      uri,
      `Invalid resource URI: ${uri}. Expected format: helm://versions or helm://versions/{version}[/values|images|validation]`,
    );
  }

  switch (parsed.type) {
    case "versions":
      return readVersions(uri);
    case "version":
      return readVersionDetails(uri, parsed.version!);
    case "values":
      return readValues(uri, parsed.version!);
    case "images":
      return readImages(uri, parsed.version!);
    case "validation":
      return readValidation(uri, parsed.version!);
    default:
      return createErrorContent(uri, `Unsupported resource type: ${uri}`);
  }
};

// List all available resources (static + dynamic based on cache)
export const listResources = async (): Promise<McpResourceDefinition[]> => {
  const staticResources = [...RESOURCES];

  // Add dynamic resources based on cached versions
  const cache = await loadCache();
  if (cache) {
    for (const version of cache.versions) {
      staticResources.push({
        uri: `helm://versions/${version.version}`,
        name: `Version ${version.version}`,
        description: `Helm chart version ${version.version}${version.appVersion ? ` (app ${version.appVersion})` : ""}`,
        mimeType: "application/json",
      });
    }
  }

  return staticResources;
};

