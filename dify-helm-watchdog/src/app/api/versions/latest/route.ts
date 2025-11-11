import { NextResponse } from "next/server";
import { loadCache } from "@/lib/helm";

export const runtime = "nodejs";

/**
 * GET /api/versions/latest
 * 重定向到最新版本的详细信息
 * 
 * 这是一个便利端点，用于快速访问最新版本
 */
export async function GET() {
  try {
    const cache = await loadCache();

    if (!cache || cache.versions.length === 0) {
      return NextResponse.json(
        {
          error: "No versions available",
          message: "No cached versions found. Please trigger the cron job first.",
        },
        { status: 404 },
      );
    }

    // 获取最新版本（版本列表已排序）
    const latestVersion = cache.versions[0];

    // 返回最新版本的详细信息
    return NextResponse.json(
      {
        version: latestVersion.version,
        appVersion: latestVersion.appVersion ?? null,
        createdAt: latestVersion.createdAt ?? null,
        digest: latestVersion.digest,
        urls: {
          self: `/api/versions/${latestVersion.version}`,
          images: `/api/versions/${latestVersion.version}/images`,
          values: `/api/versions/${latestVersion.version}/values`,
          validation: `/api/versions/${latestVersion.version}/validation`,
        },
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600",
        },
      },
    );
  } catch (error) {
    console.error("[api/versions/latest] Failed to get latest version", error);
    return NextResponse.json(
      {
        error: "Failed to get latest version",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

