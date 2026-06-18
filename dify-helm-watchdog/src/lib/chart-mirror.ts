import type { ChartMirrorCheck, ChartMirrorStatus } from "@/lib/types";

// Walk only the `  dify:` block of a Helm index.yaml and collect its
// 4-space-indent `version:` values. Returns empty set when dify is absent.
export const parseDifyVersionsFromIndex = (indexText: string): Set<string> => {
  const versions = new Set<string>();
  const lines = indexText.split("\n");
  const chartKey = /^  [A-Za-z0-9][\w.-]*:\s*$/;
  const start = lines.findIndex((line) => /^  dify:\s*$/.test(line));
  if (start === -1) return versions;

  for (let i = start + 1; i < lines.length; i++) {
    if (chartKey.test(lines[i])) break;
    const match = /^    version:\s*(.+?)\s*$/.exec(lines[i]);
    if (match) versions.add(match[1].replace(/^["']|["']$/g, ""));
  }

  return versions;
};

export const buildChartMirrorCheck = (
  version: string,
  mirrorVersions: Set<string> | null,
  repoUrl: string,
  checkTime: string,
  error: string | null,
): ChartMirrorCheck => {
  if (error || !mirrorVersions) {
    return {
      repoUrl,
      status: "ERROR",
      checkTime,
      error: error ?? "Mirror index unavailable",
    };
  }

  const status: ChartMirrorStatus = mirrorVersions.has(version) ? "FOUND" : "MISSING";
  return { repoUrl, status, checkTime };
};
