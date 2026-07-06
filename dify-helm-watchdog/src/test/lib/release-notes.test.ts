import {
  fetchReleaseNotesAsMarkdown,
  ReleaseNotesError,
} from "@/lib/release-notes";

const RELEASE_FEED_PAYLOAD = {
  items: [
    {
      title: "Release v3.9.6 (LTS)",
      url: "https://ee.dify.ai/releases/v3.9.6",
      tags: ["LTS", "Breaking"],
      content_html: "<ul><li>Summary from the feed.</li></ul>",
      date_modified: "2026-01-01T00:00:00.000Z",
    },
  ],
};

const mockReleaseNotesFetch = ({
  feedOk,
}: {
  feedOk: boolean;
}): jest.Mock => {
  const fetchMock = jest.fn(async (url: string | URL | Request) => {
    const href = String(url);

    if (href.includes("/releases/v3.9.6") && !href.includes("feed.json")) {
      return {
        ok: false,
        status: 503,
        text: async () => "",
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

describe("fetchReleaseNotesAsMarkdown release feed fallback", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("returns feed markdown when the EE release page is unavailable", async () => {
    mockReleaseNotesFetch({ feedOk: true });

    await expect(fetchReleaseNotesAsMarkdown("3.9.6")).resolves.toMatchObject({
      version: "3.9.6",
      source: "feed",
      sourceUrl: "https://ee.dify.ai/releases/v3.9.6",
      content: expect.stringContaining("https://ee.dify.ai/releases/v3.9.6"),
    });
  });

  it("throws a 502 ReleaseNotesError when the EE page and feed both fail", async () => {
    const fetchMock = mockReleaseNotesFetch({ feedOk: false });

    await expect(fetchReleaseNotesAsMarkdown("3.9.6")).rejects.toMatchObject({
      name: "ReleaseNotesError",
      status: 502,
    } satisfies Partial<ReleaseNotesError>);
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).includes("feed.json")),
    ).toBe(true);
  });
});
