import { NextResponse } from "next/server";
import { loadCache } from "@/lib/helm";
import type { CachePayload, StoredVersion } from "@/lib/types";

export const runtime = "nodejs";

interface VersionSummary {
  version: string;
  appVersion: string | null;
  createdAt: string | null;
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
  lastUpdated: string | null;
  total: number;
  versions: VersionSummary[];
}

/**
 * 计算镜像验证状态统计
 */
const computeImageValidationStats = async (
  version: StoredVersion,
): Promise<VersionSummary["imageValidation"] | undefined> => {
  if (!version.imageValidation) {
    return undefined;
  }

  try {
    // 尝试从 inline 内容读取
    let validationText = version.imageValidation.inline;

    // 如果没有 inline，则从 URL 获取
    if (!validationText) {
      const response = await fetch(version.imageValidation.url);
      if (!response.ok) {
        return undefined;
      }
      validationText = await response.text();
    }

    const validation = JSON.parse(validationText);
    const images = validation.images || [];

    return {
      total: images.length,
      allFound: images.filter((img: any) => img.status === "all_found").length,
      partial: images.filter((img: any) => img.status === "partial").length,
      missing: images.filter((img: any) => img.status === "missing").length,
      error: images.filter((img: any) => img.status === "error").length,
    };
  } catch (error) {
    console.warn(
      `[api/versions] Failed to parse image validation for ${version.version}`,
      error,
    );
    return undefined;
  }
};

/**
 * GET /api/versions
 * 返回所有可用的 Helm Chart 版本列表（简化版）
 */
export async function GET(request: Request) {
  try {
    const cache = await loadCache();

    if (!cache) {
      const emptyResponse: VersionsResponse = {
        lastUpdated: null,
        total: 0,
        versions: [],
      };
      return NextResponse.json(emptyResponse, { status: 200 });
    }

    // 检查是否需要包含镜像验证统计
    const url = new URL(request.url);
    const includeValidation = url.searchParams.get("include_validation") === "true";

    // 构建版本摘要列表
    const versions: VersionSummary[] = await Promise.all(
      cache.versions.map(async (version) => {
        const summary: VersionSummary = {
          version: version.version,
          appVersion: version.appVersion ?? null,
          createdAt: version.createdAt ?? null,
          digest: version.digest,
        };

        // 如果请求包含验证信息，则计算统计
        if (includeValidation) {
          summary.imageValidation = await computeImageValidationStats(version);
        }

        return summary;
      }),
    );

    const response: VersionsResponse = {
      lastUpdated: cache.lastUpdated,
      total: versions.length,
      versions,
    };

    return NextResponse.json(response, {
      status: 200,
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    console.error("[api/versions] Failed to load versions", error);
    return NextResponse.json(
      {
        error: "Failed to load versions",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

