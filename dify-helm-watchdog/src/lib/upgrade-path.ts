import semver from "semver";
import type { EeRelease, EeStopKind } from "@/lib/ee-catalog";

export class UnknownVersionError extends Error {}
export class InvalidRangeError extends Error {}

export interface UpgradeHop {
  version: string;
  unskippable: boolean;
  isTarget: boolean;
  stopKinds: EeStopKind[];
  stopSummary: string | null;
  notesUrl: string;
  lockUrl: string | null;
}

export interface UpgradePathNote {
  kind: "clamped-to-floor" | "direct-upgrade";
  message: string;
}

export interface UpgradePathResult {
  from: string;
  to: string;
  hops: UpgradeHop[];
  notes: UpgradePathNote[];
}

// Maintainer decision: hotfix/rc suffixes are irrelevant to the path — compute
// on the base version (3.9.5-fix.1 → 3.9.5). Also strips the leading v.
const clean = (version: string): string =>
  version.replace(/^v/, "").split(/[-+]/)[0];

export const computeUpgradePath = (
  releases: EeRelease[],
  from: string,
  to: string,
): UpgradePathResult => {
  // archived releases are deliberately kept in the path computation — parity
  // with ee.dify.ai's own upgrade-path tool, where archived stops still gate upgrades.
  const seen = new Set<string>();
  const sorted = [...releases]
    .filter((r) => semver.valid(clean(r.version)))
    .sort((a, b) => semver.compare(clean(a.version), clean(b.version)))
    .filter((r) => {
      const version = clean(r.version);
      if (seen.has(version)) return false;
      seen.add(version);
      return true;
    });
  if (sorted.length === 0) {
    throw new Error("computeUpgradePath: empty catalog");
  }
  const floor = sorted[0];

  const fromClean = clean(from);
  const toClean = clean(to);
  if (!semver.valid(fromClean) || !semver.valid(toClean)) {
    throw new InvalidRangeError("from/to must be valid semver versions");
  }

  const target = sorted.find((r) => clean(r.version) === toClean);
  if (!target) {
    throw new UnknownVersionError(`unknown target version ${to}`);
  }

  const isPreFloor = semver.lt(fromClean, clean(floor.version));
  if (!isPreFloor) {
    if (!sorted.some((r) => clean(r.version) === fromClean)) {
      throw new UnknownVersionError(`unknown current version ${from}`);
    }
    if (semver.gte(fromClean, toClean)) {
      throw new InvalidRangeError("current version must be below target version");
    }
  }

  const notes: UpgradePathNote[] = [];
  if (isPreFloor) {
    notes.push({
      kind: "clamped-to-floor",
      message: `Upgrades from before ${floor.version} are not covered. First bring your deployment to ${floor.version}, then follow the steps below.`,
    });
  }

  const span = sorted.filter((r) => {
    const v = clean(r.version);
    const aboveFrom = isPreFloor || semver.gt(v, fromClean);
    return aboveFrom && semver.lte(v, toClean);
  });
  const stops = span.filter((r) => r.unskippable);

  const toHop = (r: EeRelease, isTarget: boolean): UpgradeHop => ({
    version: r.version,
    unskippable: r.unskippable,
    isTarget,
    stopKinds: r.stopKinds,
    stopSummary: r.stopSummary,
    notesUrl: r.notesUrl,
    lockUrl: r.lockUrl,
  });

  const hops = stops.map((r) => toHop(r, clean(r.version) === toClean));
  if (hops.length === 0 || !hops[hops.length - 1].isTarget) {
    hops.push(toHop(target, true));
  }

  if (stops.length === 0 && !isPreFloor) {
    notes.push({
      kind: "direct-upgrade",
      message: `Direct upgrade — no unskippable versions between ${from} and ${to}.`,
    });
  }

  return { from, to, hops, notes };
};
