import {
  buildFeedFallbackHtml,
  fetchReleaseFeedSafe,
  parseReleaseFeed,
} from "@/lib/release-feed";

const RELEASE_FEED_PAYLOAD = {
  items: [
    {
      title: "Release v3.9.6 (LTS)",
      url: "https://ee.dify.ai/releases/v3.9.6",
      tags: ["LTS", "Breaking"],
      content_html: "<ul><li>LTS maintenance release.</li></ul>",
      date_modified: "2026-01-01T00:00:00.000Z",
    },
    {
      title: "Release v3.10.0 \"Regular\" & <Breaking>",
      url: "https://ee.dify.ai/releases/v3.10.0",
      tags: ["Regular", "Breaking"],
      content_html:
        "<ul><li>This release must not be skipped.</li></ul><script>alert(1)</script>",
      date_modified: "2026-02-01T00:00:00.000Z",
    },
    {
      title: "Malformed release item",
      tags: ["LTS"],
      content_html: "<p>No URL or id.</p>",
    },
  ],
};

describe("parseReleaseFeed", () => {
  it("indexes valid release items by version and ignores malformed items", () => {
    const map = parseReleaseFeed(RELEASE_FEED_PAYLOAD);

    expect([...map.keys()]).toEqual(["3.9.6", "3.10.0"]);
  });

  it("derives LTS and non-skippable status from tags and summary text", () => {
    const map = parseReleaseFeed(RELEASE_FEED_PAYLOAD);

    expect(map.get("3.9.6")?.lts).toBe(true);
    expect(map.get("3.9.6")?.nonSkippable).toBe(false);
    expect(map.get("3.10.0")?.lts).toBe(false);
    expect(map.get("3.10.0")?.nonSkippable).toBe(true);
  });

  it("strips script blocks from feed summaries", () => {
    const map = parseReleaseFeed(RELEASE_FEED_PAYLOAD);

    expect(map.get("3.10.0")?.summaryHtml).toBe(
      "<ul><li>This release must not be skipped.</li></ul>",
    );
  });
});

describe("buildFeedFallbackHtml", () => {
  it("renders escaped title, sanitized summary, and release link", () => {
    const entry = parseReleaseFeed(RELEASE_FEED_PAYLOAD).get("3.10.0");

    expect(entry).toBeDefined();

    const html = buildFeedFallbackHtml(entry!);

    expect(html).toContain(
      "Release v3.10.0 &quot;Regular&quot; &amp; &lt;Breaking&gt;",
    );
    expect(html).toContain(
      "<ul><li>This release must not be skipped.</li></ul>",
    );
    expect(html).toContain('href="https://ee.dify.ai/releases/v3.10.0"');
    expect(html).not.toContain("<script>");
  });
});

describe("fetchReleaseFeedSafe", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("returns null when fetching the release feed rejects", async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error("network down")) as unknown as typeof fetch;

    await expect(fetchReleaseFeedSafe()).resolves.toBeNull();
  });
});
