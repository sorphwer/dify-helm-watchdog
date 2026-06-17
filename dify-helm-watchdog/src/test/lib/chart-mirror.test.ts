import {
  buildChartMirrorCheck,
  parseDifyVersionsFromIndex,
} from "@/lib/chart-mirror";
import { normalizeValidationPayload } from "@/lib/validation";
import type { ImageValidationPayload } from "@/lib/types";

const MIRROR_REPO_URL = "https://example.test/dify-helm";
const CHECK_TIME = "2024-01-01T00:00:00.000Z";

const payloadWithChartMirror = (chartMirror?: unknown): ImageValidationPayload => ({
  version: "2.8.0",
  checkTime: CHECK_TIME,
  host: "registry.example.test",
  namespace: "dify-artifact/dify",
  images: [],
  ...(chartMirror ? { chartMirror: chartMirror as ImageValidationPayload["chartMirror"] } : {}),
});

describe("parseDifyVersionsFromIndex", () => {
  it("collects only dify chart versions", () => {
    const indexText = `entries:
  cert-manager:
  - version: 1.0.0
  dify:
  - apiVersion: v2
    version: 2.8.0
  - apiVersion: v2
    version: "3.0.1"
  zetcd:
  - version: 9.9.9
`;

    expect(parseDifyVersionsFromIndex(indexText)).toEqual(
      new Set(["2.8.0", "3.0.1"]),
    );
  });

  it("returns an empty set when dify is absent", () => {
    expect(parseDifyVersionsFromIndex("entries:\n  zetcd:\n  - version: 9.9.9\n")).toEqual(
      new Set(),
    );
  });
});

describe("buildChartMirrorCheck", () => {
  it("marks a version found when the mirror contains it", () => {
    expect(
      buildChartMirrorCheck(
        "2.8.0",
        new Set(["2.8.0"]),
        MIRROR_REPO_URL,
        CHECK_TIME,
        null,
      ),
    ).toEqual({
      repoUrl: MIRROR_REPO_URL,
      status: "FOUND",
      checkTime: CHECK_TIME,
    });
  });

  it("marks a version missing when the mirror lacks it", () => {
    expect(
      buildChartMirrorCheck(
        "9.9.9",
        new Set(["2.8.0"]),
        MIRROR_REPO_URL,
        CHECK_TIME,
        null,
      ),
    ).toEqual({
      repoUrl: MIRROR_REPO_URL,
      status: "MISSING",
      checkTime: CHECK_TIME,
    });
  });

  it("returns the fetch error when the mirror check fails", () => {
    expect(
      buildChartMirrorCheck("2.8.0", null, MIRROR_REPO_URL, CHECK_TIME, "boom"),
    ).toEqual({
      repoUrl: MIRROR_REPO_URL,
      status: "ERROR",
      checkTime: CHECK_TIME,
      error: "boom",
    });
  });
});

describe("normalizeValidationPayload chart mirror", () => {
  it("preserves a valid chart mirror status", () => {
    const normalized = normalizeValidationPayload(
      payloadWithChartMirror({
        repoUrl: "r",
        status: "FOUND",
        checkTime: "2024-01-01T00:00:00Z",
      }),
    );

    expect(normalized.chartMirror?.status).toBe("FOUND");
  });

  it("normalizes an unknown chart mirror status to error", () => {
    const normalized = normalizeValidationPayload(
      payloadWithChartMirror({
        repoUrl: "r",
        status: "weird",
        checkTime: "2024-01-01T00:00:00Z",
      }),
    );

    expect(normalized.chartMirror?.status).toBe("ERROR");
  });

  it("leaves chart mirror absent when the payload does not include one", () => {
    const normalized = normalizeValidationPayload(payloadWithChartMirror());

    expect(normalized.chartMirror).toBeUndefined();
  });
});
