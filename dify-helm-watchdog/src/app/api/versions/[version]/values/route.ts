import { NextResponse } from "next/server";
import { loadCache } from "@/lib/helm";

export const runtime = "nodejs";

/**
 * GET /api/versions/[version]/values
 * 获取指定版本的 values.yaml 内容
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

    // 获取 values.yaml 内容
    let valuesContent = versionEntry.values.inline;
    if (!valuesContent) {
      const response = await fetch(versionEntry.values.url);
      if (!response.ok) {
        throw new Error("Failed to fetch values.yaml");
      }
      valuesContent = await response.text();
    }

    return new Response(valuesContent, {
      status: 200,
      headers: {
        "Content-Type": "application/x-yaml; charset=utf-8",
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        "Content-Disposition": `inline; filename="values-${version}.yaml"`,
      },
    });
  } catch (error) {
    console.error("[api/versions/values] Failed to load values.yaml", error);
    return NextResponse.json(
      {
        error: "Failed to load values.yaml",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

