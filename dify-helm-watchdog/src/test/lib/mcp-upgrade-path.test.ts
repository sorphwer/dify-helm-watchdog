import { executeTool } from "@/lib/mcp/tools";
import { EE_CATALOG_URL } from "@/lib/ee-catalog";
import type { McpContent } from "@/lib/mcp/types";

const asText = (content: McpContent): string => {
  if (content.type !== "text") {
    throw new Error(`expected text content, got ${content.type}`);
  }
  return content.text;
};

const makeRelease = (version: string, unskippable: boolean) => ({
  version,
  track: "regular",
  releaseDate: "2026-01-01",
  eolDate: null,
  archived: false,
  unskippable,
  stopKinds: unskippable
    ? [{ kind: "migration", label: "Database migration" }]
    : [],
  stopSummary: unskippable
    ? "Database migration — back up before upgrade."
    : null,
  notesUrl: `https://ee.dify.ai/releases/${version}`,
  lockUrl: `https://ee.dify.ai/version-locks/${version}.yaml`,
});

const CATALOG_PAYLOAD = {
  schemaVersion: 1,
  generatedAt: "2026-01-01T00:00:00.000Z",
  releases: [
    makeRelease("v3.9.0", true),
    makeRelease("v3.9.5", false),
    makeRelease("v3.10.0", true),
    makeRelease("v3.11.0", true),
    makeRelease("v3.11.1", false),
  ],
};

describe("executeTool: compute_upgrade_path", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.resetAllMocks();
  });

  const serveCatalog = (response: {
    ok: boolean;
    status?: number;
    json?: () => Promise<unknown>;
  }) => {
    global.fetch = jest.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === EE_CATALOG_URL) {
        return Promise.resolve({
          ok: response.ok,
          status: response.status ?? 200,
          json: response.json ?? (async () => CATALOG_PAYLOAD),
        });
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    }) as unknown as typeof fetch;
  };

  it("returns the ordered hops for a valid range, accepting versions without a leading v", async () => {
    serveCatalog({ ok: true });

    const result = await executeTool("compute_upgrade_path", {
      from: "3.9.5",
      to: "3.11.1",
    });

    expect(result.isError).toBeUndefined();
    const payload = JSON.parse(asText(result.content[0])) as {
      hops: Array<{ version: string; isTarget: boolean }>;
      notes: Array<{ kind: string }>;
    };
    expect(payload.hops.map((h) => h.version)).toEqual([
      "v3.10.0",
      "v3.11.0",
      "v3.11.1",
    ]);
    expect(payload.hops[2]).toMatchObject({ version: "v3.11.1", isTarget: true });
    expect(payload.notes).toEqual([]);
  });

  it("returns an error result for an unknown target version", async () => {
    serveCatalog({ ok: true });

    const result = await executeTool("compute_upgrade_path", {
      from: "3.9.5",
      to: "9.9.9",
    });

    expect(result.isError).toBe(true);
    expect(asText(result.content[0])).toMatch(/unknown target version/i);
  });

  it("returns an error result when 'from' or 'to' is missing", async () => {
    const result = await executeTool("compute_upgrade_path", { from: "3.9.5" });

    expect(result.isError).toBe(true);
    expect(asText(result.content[0])).toMatch(/Missing required parameters/);
  });
});
