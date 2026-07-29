import { NextResponse } from "next/server";
import { loadCache, loadStoredAsset } from "@/lib/helm";

export const runtime = "nodejs";

/**
 * GET /api/versions/[version]/validation
 * Get image validation results for a specific version
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

    const validationContent =
      versionEntry.imageValidation.inline ??
      (await loadStoredAsset(versionEntry.imageValidation));

    const validationData = JSON.parse(validationContent);

    return NextResponse.json(validationData, {
      status: 200,
      headers: {
        "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
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

