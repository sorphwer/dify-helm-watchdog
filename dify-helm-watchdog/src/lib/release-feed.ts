import sanitizeHtml from "sanitize-html";

export const RELEASE_FEED_URL = "https://ee.dify.ai/releases/feed.json";

const EE_ORIGIN = "https://ee.dify.ai";

export interface ReleaseFeedEntry {
  version: string;
  title: string;
  url: string;
  lts: boolean;
  nonSkippable: boolean;
  summaryHtml: string;
  dateModified?: string;
}

const VERSION_FROM_RELEASE_URL =
  /\/releases\/v(\d+\.\d+\.\d+(?:[-.][0-9A-Za-z.]+)?)\/?$/;

// The release feed is an untrusted source. Restrict the summary to a small
// allowlist of formatting tags and safe link attributes/schemes so no markup
// from the feed can inject script, event handlers, or dangerous URLs into any
// consumer (client render, feed-fallback API, MCP turndown).
const FEED_SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p", "br", "strong", "em", "b", "i", "code", "pre",
    "ul", "ol", "li", "a", "h2", "h3", "h4", "span", "blockquote",
  ],
  allowedAttributes: { a: ["href", "target", "rel"] },
  allowedSchemes: ["http", "https", "mailto"],
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asString = (value: unknown): string =>
  typeof value === "string" ? value : "";

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return char;
    }
  });

export const parseReleaseFeed = (
  payload: unknown,
): Map<string, ReleaseFeedEntry> => {
  const map = new Map<string, ReleaseFeedEntry>();

  if (!isRecord(payload) || !Array.isArray(payload.items)) {
    return map;
  }

  for (const item of payload.items) {
    if (!isRecord(item)) continue;

    // Derive the version from whichever of url/id yields a valid match, so a
    // hostile or malformed url can't block recovery from a valid id.
    const versionMatch =
      asString(item.url).match(VERSION_FROM_RELEASE_URL) ??
      asString(item.id).match(VERSION_FROM_RELEASE_URL);
    if (!versionMatch) continue;

    const summarySource = asString(item.content_html) || asString(item.summary);
    const tags = Array.isArray(item.tags) ? item.tags : [];
    // Sanitize against the untrusted feed (see FEED_SANITIZE_OPTIONS).
    const summaryHtml = sanitizeHtml(summarySource, FEED_SANITIZE_OPTIONS);

    map.set(versionMatch[1], {
      version: versionMatch[1],
      title: asString(item.title),
      // Derive the link from the validated version instead of trusting the
      // feed's url field, so it can never carry a javascript:/off-origin URL.
      url: `${EE_ORIGIN}/releases/v${versionMatch[1]}`,
      lts: tags.includes("LTS"),
      // Prefer the structured tag; the prose match is a fallback for feed
      // items published before the tag existed.
      nonSkippable:
        tags.includes("Unskippable") || /must not be skipped/i.test(summarySource),
      summaryHtml,
      dateModified: asString(item.date_modified) || undefined,
    });
  }

  return map;
};

export const fetchReleaseFeed = async (): Promise<
  Map<string, ReleaseFeedEntry>
> => {
  const res = await fetch(RELEASE_FEED_URL, {
    headers: { "User-Agent": "dify-helm-watchdog/1.0" },
    next: { revalidate: 3600 },
    signal: AbortSignal.timeout(5000),
  });

  if (!res.ok) {
    throw new Error(`Release feed returned HTTP ${res.status}`);
  }

  return parseReleaseFeed(await res.json());
};

export const fetchReleaseFeedSafe = async (
  log: (message: string) => void = () => {},
): Promise<Map<string, ReleaseFeedEntry> | null> => {
  try {
    return await fetchReleaseFeed();
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    log(`Failed to fetch release feed: ${message}`);
    return null;
  }
};

export const buildFeedFallbackHtml = (entry: ReleaseFeedEntry): string =>
  `<div class="release-feed-fallback"><h2>${escapeHtml(entry.title)}</h2>${entry.summaryHtml}<p><a href="${escapeHtml(entry.url)}" target="_blank" rel="noopener noreferrer">View full release notes on ee.dify.ai →</a></p></div>`;
