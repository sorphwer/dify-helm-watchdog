import { NextResponse } from "next/server";
import { loadCache } from "@/lib/helm";

export const runtime = "nodejs";

export async function GET() {
  const cache = await loadCache();

  if (!cache) {
    return NextResponse.json(
      {
        lastUpdated: null,
        versions: [],
      },
      { status: 200 },
    );
  }

  return NextResponse.json(cache, { status: 200 });
}
