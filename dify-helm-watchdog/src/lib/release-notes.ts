import semver from "semver";
import TurndownService from "turndown";

const EE_ORIGIN = "https://ee.dify.ai";
const DOCS_BASE_URL = "https://langgenius.github.io/dify-helm/";
const DOCS_PAGE_BASE = `${DOCS_BASE_URL}pages/`;
const EE_THRESHOLD = "3.9.0";
const TARGET_CLASS =
  'w-[960px] max-w-full mx-auto px-5 py-2xl flex flex-col gap-2xl';

const extractTargetDiv = (html: string): string | null => {
  const needle = `class="${TARGET_CLASS}"`;
  const classIdx = html.indexOf(needle);
  if (classIdx === -1) return null;

  const openTag = html.lastIndexOf("<div", classIdx);
  if (openTag === -1) return null;

  let depth = 0;
  const divOpen = /<div[\s>]/gi;
  const divClose = /<\/div\s*>/gi;

  type TagHit = { pos: number; isOpen: boolean };
  const hits: TagHit[] = [];

  divOpen.lastIndex = openTag;
  let m: RegExpExecArray | null;
  while ((m = divOpen.exec(html)) !== null) {
    hits.push({ pos: m.index, isOpen: true });
  }
  divClose.lastIndex = openTag;
  while ((m = divClose.exec(html)) !== null) {
    hits.push({ pos: m.index, isOpen: false });
  }
  hits.sort((a, b) => a.pos - b.pos);

  for (const hit of hits) {
    depth += hit.isOpen ? 1 : -1;
    if (depth === 0) {
      const end = html.indexOf(">", hit.pos) + 1;
      return html.slice(openTag, end);
    }
  }

  return null;
};

const stripScripts = (html: string): string =>
  html.replace(/<script[\s\S]*?<\/script\s*>/gi, "");

const rewriteEeLinks = (html: string): string =>
  html
    .replace(
      /(<a\s[^>]*?)href="(\/[^"]*)"([^>]*>)/gi,
      (_match, before: string, path: string, after: string) =>
        `${before}href="${EE_ORIGIN}${path}" target="_blank" rel="noopener noreferrer"${after}`,
    )
    .replace(
      /(<img\s[^>]*?)src="(\/[^"]*)"([^>]*>)/gi,
      (_match, before: string, path: string, after: string) =>
        `${before}src="${EE_ORIGIN}${path}"${after}`,
    );

export const sanitizeEeReleaseHtml = (rawHtml: string): string | null => {
  const extracted = extractTargetDiv(rawHtml);
  if (!extracted) return null;
  return rewriteEeLinks(stripScripts(extracted));
};

const resolveDocsUrl = (raw: string): string => {
  const trimmed = raw.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  try {
    return new URL(trimmed, DOCS_PAGE_BASE).href;
  } catch {
    return trimmed;
  }
};

const normalizeDocsMarkdown = (content: string): string =>
  content
    .replace(
      /<a\s+[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi,
      (_match, rawHref: string, label: string) =>
        `[${label}](${resolveDocsUrl(rawHref)})`,
    )
    .replace(/<img\s+[^>]*>/gi, (match) => {
      const srcMatch = match.match(/src=["']([^"']+)["']/i);
      if (!srcMatch) return match;
      const altMatch = match.match(/alt=["']([^"']*?)["']/i);
      return `![${altMatch?.[1] ?? ""}](${resolveDocsUrl(srcMatch[1])})`;
    })
    .replace(
      /!\[([^\]]*)\]\(([^)]+)\)/g,
      (_match, alt: string, rawSrc: string) =>
        `![${alt}](${resolveDocsUrl(rawSrc)})`,
    );

let turndownInstance: TurndownService | null = null;
const getTurndown = (): TurndownService => {
  if (!turndownInstance) {
    turndownInstance = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
      bulletListMarker: "-",
    });
  }
  return turndownInstance;
};

export type ReleaseNotesSource = "ee" | "docs";

export interface ReleaseNotesResult {
  version: string;
  source: ReleaseNotesSource;
  sourceUrl: string;
  content: string;
}

export class ReleaseNotesError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ReleaseNotesError";
    this.status = status;
  }
}

export const isEeVersion = (version: string): boolean =>
  semver.valid(version) !== null && semver.gte(version, EE_THRESHOLD);

export const fetchReleaseNotesAsMarkdown = async (
  version: string,
): Promise<ReleaseNotesResult> => {
  if (!/^\d+\.\d+\.\d+/.test(version)) {
    throw new ReleaseNotesError(
      `Invalid version format: ${version}`,
      400,
    );
  }

  const headers = { "User-Agent": "dify-helm-watchdog/1.0" };

  if (isEeVersion(version)) {
    const sourceUrl = `${EE_ORIGIN}/releases/v${version}`;
    const res = await fetch(sourceUrl, {
      headers,
      next: { revalidate: 3600 },
    });
    if (!res.ok) {
      throw new ReleaseNotesError(
        `Upstream returned HTTP ${res.status}`,
        502,
      );
    }
    const html = await res.text();
    const sanitised = sanitizeEeReleaseHtml(html);
    if (!sanitised) {
      throw new ReleaseNotesError(
        "Could not locate release notes content on upstream page",
        502,
      );
    }
    const markdown = getTurndown().turndown(sanitised);
    return {
      version,
      source: "ee",
      sourceUrl,
      content: markdown,
    };
  }

  const docsVersion = version.replace(/\./g, "_");
  const sourceUrl = `${DOCS_PAGE_BASE}${docsVersion}.md`;
  const res = await fetch(sourceUrl, {
    headers,
    next: { revalidate: 3600 },
  });
  if (!res.ok) {
    throw new ReleaseNotesError(
      `Upstream returned HTTP ${res.status}`,
      res.status === 404 ? 404 : 502,
    );
  }
  const raw = await res.text();
  const normalised = normalizeDocsMarkdown(raw);
  return {
    version,
    source: "docs",
    sourceUrl,
    content: normalised,
  };
};
