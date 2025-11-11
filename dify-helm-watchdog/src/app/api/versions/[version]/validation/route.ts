import { NextResponse } from "next/server";
import { loadCache } from "@/lib/helm";

export const runtime = "nodejs";

/**
 * GET /api/versions/[version]/validation
 * 获取指定版本的镜像验证结果
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ version: string }> },
) {
  try {
    const { version } = await params;

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

    if (!versionEntry.imageValidation) {
      return NextResponse.json(
        {
          error: "Validation not available",
          message: `Image validation data is not available for version ${version}.`,
        },
        { status: 404 },
      );
    }

    // 获取验证数据
    let validationContent = versionEntry.imageValidation.inline;
    if (!validationContent) {
      const response = await fetch(versionEntry.imageValidation.url);
      if (!response.ok) {
        throw new Error("Failed to fetch validation data");
      }
      validationContent = await response.text();
    }

    const validationData = JSON.parse(validationContent);

    return NextResponse.json(validationData, {
      status: 200,
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    console.error("[api/versions/validation] Failed to load validation data", error);
    return NextResponse.json(
      {
        error: "Failed to load validation data",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

