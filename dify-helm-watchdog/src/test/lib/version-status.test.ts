import {
  parseSidebarMd,
  fetchVersionStatusMap,
  isSkippable,
  MANUAL_VERSION_STATUS,
} from "@/lib/version-status";

const SAMPLE_SIDEBAR = `* [v3.10.0](/pages/3_10_0.md)
* [v3.9.4](/pages/3_9_4.md)
* [v3.8.0 [⚠️ Non-skippable]](/pages/3_8_0.md)
* [v3.7.2 [📦 Archived]](/pages/3_7_2.md)
* [v2.7.1 [🗑️ Deprecated]](/pages/2_7_1.md)
* [v2.4.0-fix.1](/pages/2_4_0-fix_1.md)
* not a version line
`;

describe("parseSidebarMd", () => {
  it("maps each emoji to the right status", () => {
    const map = parseSidebarMd(SAMPLE_SIDEBAR);

    expect(map.get("3.8.0")).toBe("non-skippable");
    expect(map.get("3.7.2")).toBe("archived");
    expect(map.get("2.7.1")).toBe("deprecated");
  });

  it("leaves unmarked versions without a status", () => {
    const map = parseSidebarMd(SAMPLE_SIDEBAR);

    expect(map.has("3.9.4")).toBe(false);
    expect(map.has("2.4.0-fix.1")).toBe(false);
  });

  it("lets manual overrides win over the sidebar", () => {
    // 3.10.0 is unmarked upstream but manually pinned to non-skippable.
    const map = parseSidebarMd(SAMPLE_SIDEBAR);

    expect(MANUAL_VERSION_STATUS.get("3.10.0")).toBe("non-skippable");
    expect(map.get("3.10.0")).toBe("non-skippable");
  });
});

describe("isSkippable", () => {
  it("is false only for non-skippable", () => {
    expect(isSkippable("non-skippable")).toBe(false);
    expect(isSkippable("archived")).toBe(true);
    expect(isSkippable("deprecated")).toBe(true);
    expect(isSkippable(undefined)).toBe(true);
  });
});

describe("fetchVersionStatusMap", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("parses a successful response", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => SAMPLE_SIDEBAR,
    }) as unknown as typeof fetch;

    const map = await fetchVersionStatusMap();

    expect(map.get("3.8.0")).toBe("non-skippable");
    expect(map.get("3.10.0")).toBe("non-skippable");
  });

  it("falls back to manual overrides when the fetch fails", async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error("network down")) as unknown as typeof fetch;

    const map = await fetchVersionStatusMap();

    // Only the manual overrides survive; nothing from the (failed) sidebar.
    expect(map.get("3.10.0")).toBe("non-skippable");
    expect(map.has("3.8.0")).toBe(false);
    expect(map.size).toBe(MANUAL_VERSION_STATUS.size);
  });

  it("falls back to manual overrides on a non-ok response", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => "",
    }) as unknown as typeof fetch;

    const map = await fetchVersionStatusMap();

    expect(map.get("3.10.0")).toBe("non-skippable");
    expect(map.has("3.8.0")).toBe(false);
  });
});
