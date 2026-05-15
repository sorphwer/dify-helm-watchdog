import { OTHER_LABEL } from "./countries";
import type { TimeseriesRow } from "./track";

export interface TrafficSeries {
  /** X-axis bucket labels, oldest -> newest (YYYY-MM-DD). */
  buckets: string[];
  /** Stacked series: top-8 countries by total hits, then "Other" last. */
  series: Array<{ country: string; data: number[] }>;
}

type Window = "7d" | "30d" | "90d";

const TOP_N = 8;
const DAY_MS = 86_400_000;

// 7d/30d render daily bars; 90d rolls up to ~13 weekly bars to stay readable.
const BUCKET_SPEC: Record<Window, { bucketDays: number; bucketCount: number }> =
  {
    "7d": { bucketDays: 1, bucketCount: 7 },
    "30d": { bucketDays: 1, bucketCount: 30 },
    "90d": { bucketDays: 7, bucketCount: 13 },
  };

const utcMidnight = (d: Date): number =>
  Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

const fmtDate = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

const parseDate = (s: string): number | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
};

/**
 * Rolls raw per-day-per-country rows into a stacked-bar shape: a fixed grid of
 * time buckets covering the window, and one series per top-8 country (the rest
 * folded into "Other"). `now` is injectable for deterministic tests.
 */
export function buildTrafficSeries(
  rows: TimeseriesRow[],
  window: Window,
  now: Date = new Date(),
): TrafficSeries {
  const { bucketDays, bucketCount } = BUCKET_SPEC[window];
  const today = utcMidnight(now);

  // Bucket labels, oldest -> newest. Each bucket spans `bucketDays` days and is
  // labeled by its first (oldest) day.
  const buckets: string[] = [];
  for (let i = 0; i < bucketCount; i++) {
    const fromEnd = bucketCount - 1 - i;
    const startMs = today - (fromEnd * bucketDays + (bucketDays - 1)) * DAY_MS;
    buckets.push(fmtDate(startMs));
  }

  // Assign each row to a bucket index; drop rows outside the window.
  const placed: Array<{ bucket: number; country: string; hits: number }> = [];
  for (const row of rows) {
    const dateMs = parseDate(row.date);
    if (dateMs === null) continue;
    const daysAgo = Math.max(0, Math.round((today - dateMs) / DAY_MS));
    const fromEnd = Math.floor(daysAgo / bucketDays);
    if (fromEnd >= bucketCount) continue;
    placed.push({
      bucket: bucketCount - 1 - fromEnd,
      country: row.country,
      hits: row.hits,
    });
  }

  // Rank countries by in-window hits; keep top 8, fold the rest into "Other".
  const totals = new Map<string, number>();
  for (const p of placed) {
    totals.set(p.country, (totals.get(p.country) ?? 0) + p.hits);
  }
  const ranked = [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([country]) => country);
  const topCountries = ranked.slice(0, TOP_N);
  const topSet = new Set(topCountries);
  const hasOther = ranked.length > TOP_N;

  const seriesKeys = hasOther ? [...topCountries, OTHER_LABEL] : topCountries;
  const dataByKey = new Map<string, number[]>(
    seriesKeys.map((k) => [k, new Array<number>(bucketCount).fill(0)]),
  );

  for (const p of placed) {
    const key = topSet.has(p.country) ? p.country : OTHER_LABEL;
    dataByKey.get(key)![p.bucket] += p.hits;
  }

  return {
    buckets,
    series: seriesKeys.map((country) => ({
      country,
      data: dataByKey.get(country)!,
    })),
  };
}
