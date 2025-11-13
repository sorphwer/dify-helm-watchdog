import { NextResponse } from "next/server";
import { loadCache } from "@/lib/helm";

export const runtime = "nodejs";

/**
 * GET /api/versions/[version]
 * 获取指定版本的详细信息（不包含完整内容）
 */
export async function GET(
  _request: Request,
  { params }: { params: { version: string } },
) {
  try {
    const { version } = params;

    const cache = await loadCache();
    if (!cache) {
      return NextResponse.json(
        {
          error: "Cache not available",
          message: "No cached data found. Please trigger the cron job first.",
        },
        { status: 404 },
      );
    }

    const versionEntry = cache.versions.find((v) => v.version === version);
    if (!versionEntry) {
      return NextResponse.json(
        {
          error: "Version not found",
          message: `Version ${version} does not exist in the cache.`,
          availableVersions: cache.versions.map((v) => v.version),
        },
        { status: 404 },
      );
    }

    // 返回版本详细信息
    return NextResponse.json(
      {
        version: versionEntry.version,
        appVersion: versionEntry.appVersion ?? null,
        createdAt: versionEntry.createdAt ?? null,
        chartUrl: versionEntry.chartUrl,
        digest: versionEntry.digest,
        assets: {
          values: {
            path: versionEntry.values.path,
            url: versionEntry.values.url,
            hash: versionEntry.values.hash,
          },
          images: {
            path: versionEntry.images.path,
            url: versionEntry.images.url,
            hash: versionEntry.images.hash,
          },
          ...(versionEntry.imageValidation
            ? {
                validation: {
                  path: versionEntry.imageValidation.path,
                  url: versionEntry.imageValidation.url,
                  hash: versionEntry.imageValidation.hash,
                },
              }
            : {}),
        },
        urls: {
          images: `/api/versions/${version}/images`,
          values: `/api/versions/${version}/values`,
          ...(versionEntry.imageValidation
            ? { validation: `/api/versions/${version}/validation` }
            : {}),
        },
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        },
      },
    );
  } catch (error) {
    console.error("[api/versions/[version]] Failed to get version details", error);
    return NextResponse.json(
      {
        error: "Failed to get version details",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

