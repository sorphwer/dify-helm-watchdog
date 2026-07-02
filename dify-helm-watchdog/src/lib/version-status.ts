import type { VersionStatus } from "@/lib/types";

const SIDEBAR_URL = "https://langgenius.github.io/dify-helm/_sidebar.md";

// Manual status overrides, applied on top of the official sidebar. Use this
// when a version's status isn't (yet) reflected upstream but we want it
// surfaced regardless. Manual entries always win over the parsed sidebar.
export const MANUAL_VERSION_STATUS: ReadonlyMap<string, VersionStatus> = new Map([
  ["3.10.0", "non-skippable"],
  ["3.11.0", "non-skippable"],
]);

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

  // Manual overrides always win over the upstream sidebar.
  for (const [version, status] of MANUAL_VERSION_STATUS) {
    map.set(version, status);
  }

  return map;
};

// Fetch and parse the official sidebar. On any failure, returns a map
// containing only the manual overrides so known statuses are never lost.
export const fetchVersionStatusMap = async (
  log: (message: string) => void = () => {},
): Promise<Map<string, VersionStatus>> => {
  try {
    const response = await fetch(SIDEBAR_URL, {
      headers: { "User-Agent": "dify-helm-watchdog" },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const content = await response.text();
    return parseSidebarMd(content);
  } catch (error) {
    log(
      `Failed to fetch version status sidebar: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
    return new Map(MANUAL_VERSION_STATUS);
  }
};

// A version is skippable unless it is explicitly marked non-skippable.
export const isSkippable = (status?: VersionStatus): boolean =>
  status !== "non-skippable";
