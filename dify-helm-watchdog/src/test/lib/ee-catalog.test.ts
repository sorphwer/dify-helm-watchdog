import { parseEeCatalog } from "@/lib/ee-catalog";

const VALID_PAYLOAD = {
  schemaVersion: 1,
  generatedAt: "2026-01-01T00:00:00.000Z",
  releases: [
    {
      version: "v3.11.0",
      track: "lts",
      releaseDate: "2026-01-01",
      eolDate: "2027-01-01",
      communityVersion: "1.15.0",
      enterpriseVersion: "3.11.0",
      archived: false,
      unskippable: true,
      stopKinds: [{ kind: "migration", label: "Database migration" }],
      stopSummary: "Database migration — back up before upgrade.",
      notesUrl: "https://ee.dify.ai/releases/v3.11.0",
      lockUrl: "https://ee.dify.ai/version-locks/v3.11.0.yaml",
      sources: null,
    },
  ],
};

describe("parseEeCatalog", () => {
  it("throws on an unsupported schema version", () => {
    expect(() => parseEeCatalog({ schemaVersion: 2, releases: [] })).toThrow(
      "Unsupported ee.dify.ai catalog schema",
    );
  });

  it("throws when the payload is not a record", () => {
    expect(() => parseEeCatalog(null)).toThrow(
      "Unsupported ee.dify.ai catalog schema",
    );
    expect(() => parseEeCatalog([1, 2, 3])).toThrow(
      "Unsupported ee.dify.ai catalog schema",
    );
  });

  it("throws when releases is missing or not an array", () => {
    expect(() => parseEeCatalog({ schemaVersion: 1 })).toThrow(
      "Unsupported ee.dify.ai catalog schema: 'releases' must be an array",
    );
    expect(() => parseEeCatalog({ schemaVersion: 1, releases: "nope" })).toThrow(
      "Unsupported ee.dify.ai catalog schema: 'releases' must be an array",
    );
  });

  it("skips malformed release items", () => {
    const releases = parseEeCatalog({
      schemaVersion: 1,
      releases: [
        null,
        "not an object",
        { version: "not-a-version" },
        { version: "v1.2" },
        ...VALID_PAYLOAD.releases,
      ],
    });

    expect(releases).toHaveLength(1);
    expect(releases[0].version).toBe("v3.11.0");
  });

  it("ignores a hostile lockUrl in the payload and derives it from the version instead", () => {
    const releases = parseEeCatalog({
      schemaVersion: 1,
      releases: [
        {
          ...VALID_PAYLOAD.releases[0],
          lockUrl: "https://evil.example.com/pwned.yaml",
        },
      ],
    });

    expect(releases[0].lockUrl).toBe(
      "https://ee.dify.ai/version-locks/v3.11.0.yaml",
    );
  });

  it("derives notesUrl from the version instead of trusting the payload", () => {
    const releases = parseEeCatalog({
      schemaVersion: 1,
      releases: [
        {
          ...VALID_PAYLOAD.releases[0],
          notesUrl: "https://evil.example.com/fake",
        },
      ],
    });

    expect(releases[0].notesUrl).toBe("https://ee.dify.ai/releases/v3.11.0");
  });

  it("omits lockUrl when the payload does not provide one", () => {
    const releases = parseEeCatalog({
      schemaVersion: 1,
      releases: [{ ...VALID_PAYLOAD.releases[0], lockUrl: null }],
    });

    expect(releases[0].lockUrl).toBeNull();
  });

  it("maps all fields from a valid payload", () => {
    const releases = parseEeCatalog(VALID_PAYLOAD);

    expect(releases).toEqual([
      {
        version: "v3.11.0",
        track: "lts",
        releaseDate: "2026-01-01",
        eolDate: "2027-01-01",
        archived: false,
        unskippable: true,
        stopKinds: [{ kind: "migration", label: "Database migration" }],
        stopSummary: "Database migration — back up before upgrade.",
        notesUrl: "https://ee.dify.ai/releases/v3.11.0",
        lockUrl: "https://ee.dify.ai/version-locks/v3.11.0.yaml",
      },
    ]);
  });

  it("defaults track to regular when not lts", () => {
    const releases = parseEeCatalog({
      schemaVersion: 1,
      releases: [{ ...VALID_PAYLOAD.releases[0], track: "regular" }],
    });

    expect(releases[0].track).toBe("regular");

    const releasesOther = parseEeCatalog({
      schemaVersion: 1,
      releases: [{ ...VALID_PAYLOAD.releases[0], track: "unexpected" }],
    });

    expect(releasesOther[0].track).toBe("regular");
  });
});
