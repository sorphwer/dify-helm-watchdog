export const RELEASE_FEED_URL = "https://ee.dify.ai/releases/feed.json";

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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const stripScripts = (html: string): string =>
  html.replace(/<script[\s\S]*?<\/script\s*>/gi, "");

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

    const rawUrl = asString(item.url);
    const rawId = asString(item.id);
    const versionSource = rawUrl || rawId;
    const versionMatch = versionSource.match(VERSION_FROM_RELEASE_URL);
    if (!versionMatch) continue;

    const summarySource = asString(item.content_html) || asString(item.summary);
    const tags = Array.isArray(item.tags) ? item.tags : [];
    const summaryHtml = stripScripts(summarySource);

    map.set(versionMatch[1], {
      version: versionMatch[1],
      title: asString(item.title),
      url: rawUrl,
      lts: tags.includes("LTS"),
      nonSkippable: /must not be skipped/i.test(summarySource),
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
