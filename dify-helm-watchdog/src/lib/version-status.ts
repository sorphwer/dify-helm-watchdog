import { fetchReleaseFeedSafe } from "@/lib/release-feed";
import type { VersionStatus } from "@/lib/types";

const SIDEBAR_URL = "https://langgenius.github.io/dify-helm/_sidebar.md";

// Parse the official Dify Helm docs sidebar markdown into a version -> status
// map. Status is identified by the emoji each entry carries upstream.
export const parseSidebarMd = (content: string): Map<string, VersionStatus> => {
  const map = new Map<string, VersionStatus>();

  for (const line of content.split("\n")) {
    // Extract version number from markdown link, e.g. "[v3.8.0 ...](...)".
    const versionMatch = line.match(/\[v([\d.]+(?:-[^\]]+)?)/);
    if (!versionMatch) continue;

    const version = versionMatch[1];

    if (line.includes("⚠️")) {
      map.set(version, "non-skippable");
    } else if (line.includes("📦")) {
      map.set(version, "archived");
    } else if (line.includes("🗑️")) {
      map.set(version, "deprecated");
    }
  }

  return map;
};

// Fetch and parse the official sidebar plus ee.dify.ai release feed. On any
// failure, returns statuses from the sources that remain available.
export const fetchVersionStatusMap = async (
  log: (message: string) => void = () => {},
): Promise<Map<string, VersionStatus>> => {
  const sidebarPromise = (async () => {
    try {
      const response = await fetch(SIDEBAR_URL, {
        headers: { "User-Agent": "dify-helm-watchdog" },
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return parseSidebarMd(await response.text());
    } catch (error) {
      log(
        `Failed to fetch version status sidebar: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
      return new Map<string, VersionStatus>();
    }
  })();

  const [sidebarStatusMap, releaseFeed] = await Promise.all([
    sidebarPromise,
    fetchReleaseFeedSafe(log),
  ]);

  const map = new Map(sidebarStatusMap);
  for (const entry of releaseFeed?.values() ?? []) {
    if (entry.nonSkippable) {
      map.set(entry.version, "non-skippable");
    }
  }

  return map;
};

// A version is skippable unless it is explicitly marked non-skippable.
export const isSkippable = (status?: VersionStatus): boolean =>
  status !== "non-skippable";
