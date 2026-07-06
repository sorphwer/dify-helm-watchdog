import {
  parseSidebarMd,
  fetchVersionStatusMap,
  isSkippable,
} from "@/lib/version-status";

const SAMPLE_SIDEBAR = `* [v3.10.0](/pages/3_10_0.md)
* [v3.9.4](/pages/3_9_4.md)
* [v3.8.0 [⚠️ Non-skippable]](/pages/3_8_0.md)
* [v3.7.2 [📦 Archived]](/pages/3_7_2.md)
* [v2.7.1 [🗑️ Deprecated]](/pages/2_7_1.md)
* [v2.4.0-fix.1](/pages/2_4_0-fix_1.md)
* not a version line
`;

const RELEASE_FEED_PAYLOAD = {
  items: [
    {
      title: "Release v3.9.6 (LTS)",
      url: "https://ee.dify.ai/releases/v3.9.6",
      tags: ["LTS", "Breaking"],
      content_html: "<ul><li>LTS release can be skipped.</li></ul>",
      date_modified: "2026-01-01T00:00:00.000Z",
    },
    {
      title: "Release v3.10.0 (Regular)",
      url: "https://ee.dify.ai/releases/v3.10.0",
      tags: ["Regular", "Breaking"],
      content_html:
        "<ul><li>This release must not be skipped.</li></ul><script>alert(1)</script>",
      date_modified: "2026-02-01T00:00:00.000Z",
    },
  ],
};

const mockStatusFetch = ({
  sidebarOk,
  feedOk,
}: {
  sidebarOk: boolean;
  feedOk: boolean;
}): jest.Mock => {
  const fetchMock = jest.fn(async (url: string | URL | Request) => {
    const href = String(url);

    if (href.includes("_sidebar.md")) {
      if (!sidebarOk) {
        return {
          ok: false,
          status: 503,
          text: async () => "",
        };
      }

      return {
        ok: true,
        status: 200,
        text: async () => SAMPLE_SIDEBAR,
      };
    }

    if (href.includes("feed.json")) {
      if (!feedOk) {
        throw new Error("feed unavailable");
      }

      return {
        ok: true,
        status: 200,
        json: async () => RELEASE_FEED_PAYLOAD,
      };
    }

    throw new Error(`Unexpected fetch URL: ${href}`);
  });

  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
};

describe("parseSidebarMd", () => {
  it("maps each emoji to the right status", () => {
    const map = parseSidebarMd(SAMPLE_SIDEBAR);

    expect(map.get("3.8.0")).toBe("non-skippable");
    expect(map.get("3.7.2")).toBe("archived");
    expect(map.get("2.7.1")).toBe("deprecated");
  });

  it("leaves unmarked versions without a status", () => {
    const map = parseSidebarMd(SAMPLE_SIDEBAR);

    expect(map.has("3.10.0")).toBe(false);
    expect(map.has("3.9.4")).toBe(false);
    expect(map.has("2.4.0-fix.1")).toBe(false);
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

  it("merges sidebar statuses with feed-derived non-skippable releases", async () => {
    mockStatusFetch({ sidebarOk: true, feedOk: true });

    const map = await fetchVersionStatusMap();

    expect(map.get("3.8.0")).toBe("non-skippable");
    expect(map.get("3.7.2")).toBe("archived");
    expect(map.get("2.7.1")).toBe("deprecated");
    expect(map.get("3.10.0")).toBe("non-skippable");
    expect(map.has("3.9.6")).toBe(false);
  });

  it("returns only feed-derived statuses when the sidebar fetch fails", async () => {
    mockStatusFetch({ sidebarOk: false, feedOk: true });

    const map = await fetchVersionStatusMap();

    expect(map.get("3.10.0")).toBe("non-skippable");
    expect(map.has("3.8.0")).toBe(false);
    expect(map.has("3.9.6")).toBe(false);
    expect(map.size).toBe(1);
  });

  it("returns only sidebar statuses when the release feed fails", async () => {
    mockStatusFetch({ sidebarOk: true, feedOk: false });

    const map = await fetchVersionStatusMap();

    expect(map.get("3.8.0")).toBe("non-skippable");
    expect(map.get("3.7.2")).toBe("archived");
    expect(map.get("2.7.1")).toBe("deprecated");
    expect(map.has("3.10.0")).toBe(false);
  });

  it("returns an empty map when both status sources fail", async () => {
    mockStatusFetch({ sidebarOk: false, feedOk: false });

    const map = await fetchVersionStatusMap();

    expect(map.size).toBe(0);
  });
});
