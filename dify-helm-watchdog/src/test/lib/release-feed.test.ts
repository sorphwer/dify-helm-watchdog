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

  it("derives non-skippable from the Unskippable tag without the prose phrase", () => {
    const map = parseReleaseFeed({
      items: [
        {
          id: "https://ee.dify.ai/releases/v3.11.0",
          url: "https://ee.dify.ai/releases/v3.11.0",
          title: "Release v3.11.0",
          tags: ["Regular", "Breaking", "Unskippable"],
          content_html: "<p>No prose marker here.</p>",
        },
      ],
    });

    expect(map.get("3.11.0")?.nonSkippable).toBe(true);
  });

  it("strips script blocks from feed summaries", () => {
    const map = parseReleaseFeed(RELEASE_FEED_PAYLOAD);

    expect(map.get("3.10.0")?.summaryHtml).toBe(
      "<ul><li>This release must not be skipped.</li></ul>",
    );
  });
});

describe("parseReleaseFeed injection hardening", () => {
  // The feed is treated as an untrusted source; these lock in the sanitizer
  // and URL canonicalization that keep every consumer injection-safe.
  const HOSTILE_PAYLOAD = {
    items: [
      {
        title: "Hostile summary",
        url: "https://ee.dify.ai/releases/v3.9.9",
        tags: ["Regular"],
        content_html:
          '<ul><li>ok</li></ul><img src=x onerror=alert(1)><a href="javascript:alert(1)">x</a><svg onload=alert(1)></svg>',
      },
      {
        title: "Legit link",
        url: "https://ee.dify.ai/releases/v3.9.5",
        tags: ["LTS"],
        content_html:
          '<a href="https://ee.dify.ai/x" target="_blank" rel="noopener noreferrer">n</a>',
      },
      {
        title: "Off-origin url",
        url: "https://evil.example.com/releases/v3.9.8",
        tags: ["Regular"],
        content_html: "<p>notes</p>",
      },
      {
        title: "Version from id, hostile url",
        id: "https://ee.dify.ai/releases/v3.9.7",
        url: "javascript:alert(1)",
        tags: ["LTS"],
        content_html: "<p>notes</p>",
      },
    ],
  };

  it("strips scripts, event handlers, and dangerous tags from the summary", () => {
    const summary = parseReleaseFeed(HOSTILE_PAYLOAD).get("3.9.9")?.summaryHtml;

    expect(summary).toBeDefined();
    expect(summary).toContain("<ul><li>ok</li></ul>");
    expect(summary).not.toContain("onerror");
    expect(summary).not.toContain("javascript:");
    expect(summary).not.toMatch(/<img/i);
    expect(summary).not.toMatch(/<svg/i);
    expect(summary).not.toMatch(/<script/i);
  });

  it("preserves safe links with their target and rel", () => {
    const summary = parseReleaseFeed(HOSTILE_PAYLOAD).get("3.9.5")?.summaryHtml;

    expect(summary).toContain('href="https://ee.dify.ai/x"');
    expect(summary).toContain('target="_blank"');
    expect(summary).toContain('rel="noopener noreferrer"');
  });

  it("canonicalizes the url instead of trusting the feed's url field", () => {
    const entry = parseReleaseFeed(HOSTILE_PAYLOAD).get("3.9.8");

    expect(entry?.url).toBe("https://ee.dify.ai/releases/v3.9.8");
  });

  it("canonicalizes the url when the version comes from id and url is hostile", () => {
    const map = parseReleaseFeed(HOSTILE_PAYLOAD);

    expect(map.has("3.9.7")).toBe(true);
    expect(map.get("3.9.7")?.url).toBe("https://ee.dify.ai/releases/v3.9.7");
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
