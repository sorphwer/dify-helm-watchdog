import { NextResponse } from "next/server";
import { loadCache } from "@/lib/helm";
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
    status: "all_found" | "partial" | "missing" | "error";
    variants: Array<{
      name: "original" | "amd64" | "arm64";
      tag: string;
      image: string;
      status: "found" | "missing" | "error";
      checkedAt: string;
      httpStatus?: number;
      error?: string;
    }>;
  };
}

interface ImagesResponse {
  version: string;
  appVersion: string | null;
  total: number;
  images: ImageEntry[];
}

/**
 * GET /api/versions/[version]/images
 * 获取指定版本中所有镜像及其标签
 * 
 * Query Parameters:
 * - format: "json" | "yaml" (default: "json")
 * - include_validation: "true" | "false" (default: "false")
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ version: string }> },
) {
  try {
    const { version } = await params;
    const url = new URL(request.url);
    const format = url.searchParams.get("format") || "json";
    const includeValidation = url.searchParams.get("include_validation") === "true";

    // 加载缓存数据
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

    // 查找指定版本
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

    // 获取镜像数据
    let imagesText = versionEntry.images.inline;
    if (!imagesText) {
      const response = await fetch(versionEntry.images.url);
      if (!response.ok) {
        throw new Error("Failed to fetch images data");
      }
      imagesText = await response.text();
    }

    // 解析镜像 YAML
    const imagesData = YAML.parse(imagesText) as Record<string, ImageInfo>;

    // 获取验证数据（如果需要）
    let validationData: Record<string, any> | null = null;
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
          const validation = JSON.parse(validationText);
          // 创建一个映射表，方便查找
          validationData = {};
          for (const img of validation.images || []) {
            const key = `${img.sourceRepository}:${img.sourceTag}`;
            validationData[key] = {
              status: img.status,
              targetImageName: img.targetImageName,
              variants: img.variants,
            };
          }
        }
      } catch (error) {
        console.warn(
          `[api/versions/images] Failed to load validation data for ${version}`,
          error,
        );
      }
    }

    // 构建响应数据
    const images: ImageEntry[] = Object.entries(imagesData).map(([path, info]) => {
      const entry: ImageEntry = {
        path,
        repository: info.repository,
        tag: info.tag,
      };

      // 添加验证信息
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

    // 根据格式返回数据
    if (format === "yaml") {
      const yamlContent = YAML.stringify(
        images.reduce((acc, img) => {
          acc[img.path] = {
            repository: img.repository,
            tag: img.tag,
            ...(img.targetImageName ? { targetImageName: img.targetImageName } : {}),
            ...(img.validation ? { validation: img.validation } : {}),
          };
          return acc;
        }, {} as Record<string, any>),
      );

      return new Response(yamlContent, {
        status: 200,
        headers: {
          "Content-Type": "application/x-yaml; charset=utf-8",
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        },
      });
    }

    // JSON 格式响应
    const response: ImagesResponse = {
      version: versionEntry.version,
      appVersion: versionEntry.appVersion ?? null,
      total: images.length,
      images,
    };

    return NextResponse.json(response, {
      status: 200,
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    console.error("[api/versions/images] Failed to load images", error);
    return NextResponse.json(
      {
        error: "Failed to load images",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

