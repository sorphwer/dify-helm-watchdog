import {
  computeUpgradePath,
  InvalidRangeError,
  UnknownVersionError,
} from "@/lib/upgrade-path";
import type { EeRelease } from "@/lib/ee-catalog";

const makeRelease = (version: string, unskippable: boolean): EeRelease => ({
  version,
  track: "regular",
  releaseDate: "2026-01-01",
  eolDate: null,
  archived: false,
  unskippable,
  stopKinds: unskippable ? [{ kind: "migration", label: "Database migration" }] : [],
  stopSummary: unskippable ? "Database migration — back up before upgrade." : null,
  notesUrl: `https://ee.dify.ai/releases/${version}`,
  lockUrl: `https://ee.dify.ai/version-locks/${version}.yaml`,
});

const RELEASES: EeRelease[] = [
  makeRelease("v3.9.0", true),
  makeRelease("v3.9.5", false),
  makeRelease("v3.10.0", true),
  makeRelease("v3.11.0", true),
  makeRelease("v3.11.1", false),
];

describe("computeUpgradePath", () => {
  it("returns every unskippable release in (from, to] plus the target, ascending", () => {
    const result = computeUpgradePath(RELEASES, "v3.9.5", "v3.11.1");

    expect(result.hops.map((h) => h.version)).toEqual(["v3.10.0", "v3.11.0", "v3.11.1"]);
    expect(result.hops[0].unskippable).toBe(true);
    expect(result.hops[1].unskippable).toBe(true);
    expect(result.hops[2]).toMatchObject({ version: "v3.11.1", isTarget: true });
    expect(result.notes).toEqual([]);
  });

  it("emits a direct-upgrade note when no unskippable release lies between from and to", () => {
    const result = computeUpgradePath(RELEASES, "v3.11.0", "v3.11.1");

    expect(result.hops).toEqual([
      expect.objectContaining({ version: "v3.11.1", isTarget: true }),
    ]);
    expect(result.notes).toEqual([
      { kind: "direct-upgrade", message: expect.stringContaining("Direct upgrade") },
    ]);
  });

  it("marks the target itself as the hop when it is unskippable, without a direct-upgrade note", () => {
    const result = computeUpgradePath(RELEASES, "v3.10.0", "v3.11.0");

    expect(result.hops).toEqual([
      expect.objectContaining({ version: "v3.11.0", isTarget: true, unskippable: true }),
    ]);
    expect(result.notes).toEqual([]);
  });

  it("clamps a pre-floor from to the earliest release and adds a clamped-to-floor note", () => {
    const result = computeUpgradePath(RELEASES, "3.8.1", "v3.9.5");

    expect(result.notes).toEqual([
      { kind: "clamped-to-floor", message: expect.stringContaining("v3.9.0") },
    ]);
    expect(result.hops.map((h) => h.version)).toContain("v3.9.0");
  });

  it("accepts a from/to version without a leading v", () => {
    const result = computeUpgradePath(RELEASES, "3.9.5", "3.11.1");

    expect(result.hops.map((h) => h.version)).toEqual(["v3.10.0", "v3.11.0", "v3.11.1"]);
  });

  it("treats a hotfix suffix on from the same as the bare base version", () => {
    const withSuffix = computeUpgradePath(RELEASES, "3.9.5-fix.1", "3.11.1");
    const bare = computeUpgradePath(RELEASES, "3.9.5", "3.11.1");

    expect(withSuffix.hops).toEqual(bare.hops);
    expect(withSuffix.notes).toEqual(bare.notes);
  });

  it("throws UnknownVersionError for an unknown target version", () => {
    expect(() => computeUpgradePath(RELEASES, "v3.9.5", "v9.9.9")).toThrow(
      UnknownVersionError,
    );
  });

  it("throws InvalidRangeError when from is at or above to", () => {
    expect(() => computeUpgradePath(RELEASES, "v3.11.0", "v3.10.0")).toThrow(
      InvalidRangeError,
    );
    expect(() => computeUpgradePath(RELEASES, "v3.11.0", "v3.11.0")).toThrow(
      InvalidRangeError,
    );
  });

  it("throws UnknownVersionError for a mid-range from that is absent from the catalog", () => {
    expect(() => computeUpgradePath(RELEASES, "v3.9.6", "v3.11.1")).toThrow(
      UnknownVersionError,
    );
  });

  it("dedupes a catalog with a duplicated version entry to a single hop", () => {
    const withDuplicate: EeRelease[] = [
      ...RELEASES,
      makeRelease("v3.10.0", true),
    ];

    const result = computeUpgradePath(withDuplicate, "v3.9.5", "v3.11.1");

    expect(result.hops.map((h) => h.version)).toEqual(["v3.10.0", "v3.11.0", "v3.11.1"]);
    expect(result.hops.filter((h) => h.version === "v3.10.0")).toHaveLength(1);
  });
});
