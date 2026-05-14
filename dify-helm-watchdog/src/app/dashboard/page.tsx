import type { Metadata } from "next";
import { unstable_cache } from "next/cache";

import {
  queryAnalytics,
  type AnalyticsQueryResponse,
  type CountryStats,
  type KindStats,
} from "@/lib/analytics/track";

import { WindowToggle } from "./window-toggle";

const getCachedAnalytics = unstable_cache(
  (window: "7d" | "30d" | "90d") => queryAnalytics(window),
  ["dashboard-analytics"],
  { revalidate: 300, tags: ["analytics"] },
);

export const metadata: Metadata = {
  title: "Dashboard",
  description:
    "Public usage stats for dify-helm-watchdog — MCP tool calls, REST API requests, and page views.",
};

export const dynamic = "force-dynamic";

const ALLOWED_WINDOWS = ["7d", "30d", "90d"] as const;
type WindowParam = (typeof ALLOWED_WINDOWS)[number];

const parseWindow = (raw: string | string[] | undefined): WindowParam => {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value && (ALLOWED_WINDOWS as readonly string[]).includes(value)) {
    return value as WindowParam;
  }
  return "7d";
};

interface PageProps {
  searchParams: Promise<{ window?: string | string[] }>;
}

const formatNumber = (n: number): string => {
  if (!Number.isFinite(n)) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString("en-US");
};

interface PanelProps {
  title: string;
  subtitle: string;
  stats: KindStats;
  showBreakdown: boolean;
}

function Panel({ title, subtitle, stats, showBreakdown }: PanelProps) {
  const top = stats.byName.slice(0, 5);
  const max = top.reduce((m, r) => (r.hits > m ? r.hits : m), 0) || 1;

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-zinc-800/80 bg-zinc-950/50 p-5">
      <header>
        <p className="text-xs uppercase tracking-widest text-zinc-500">
          {subtitle}
        </p>
        <h2 className="mt-1 font-mono text-sm text-zinc-200">{title}</h2>
      </header>

      <div className="font-mono text-4xl font-semibold tabular-nums text-emerald-300">
        {formatNumber(stats.total)}
      </div>

      {showBreakdown && top.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {top.map((row) => {
            const pct = Math.round((row.hits / max) * 100);
            return (
              <li
                key={row.name}
                className="flex flex-col gap-0.5 font-mono text-xs"
              >
                <div className="flex items-baseline justify-between">
                  <span className="truncate text-zinc-300" title={row.name}>
                    {row.name}
                  </span>
                  <span className="tabular-nums text-zinc-500">
                    {formatNumber(row.hits)}
                  </span>
                </div>
                <div className="h-[3px] w-full overflow-hidden rounded-sm bg-zinc-800/80">
                  <div
                    className="h-full bg-emerald-500/60"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      ) : showBreakdown ? (
        <p className="font-mono text-xs text-zinc-600">no calls in this window</p>
      ) : null}

      <footer className="mt-auto border-t border-zinc-800/60 pt-3 font-mono text-xs text-zinc-500">
        ≈ {formatNumber(stats.uv)} unique visitors
      </footer>
    </section>
  );
}

const EMPTY_STATS: KindStats = { total: 0, uv: 0, byName: [] };

const COUNTRY_NAMES: Record<string, string> = {
  US: "United States",
  CN: "China",
  JP: "Japan",
  KR: "South Korea",
  DE: "Germany",
  GB: "United Kingdom",
  FR: "France",
  IN: "India",
  SG: "Singapore",
  HK: "Hong Kong",
  TW: "Taiwan",
  CA: "Canada",
  AU: "Australia",
  NL: "Netherlands",
  BR: "Brazil",
  RU: "Russia",
  XX: "Unknown",
};

const countryFlag = (code: string): string => {
  if (code === "XX" || !/^[A-Z]{2}$/.test(code)) return "🌐";
  const A = 0x41;
  const REGIONAL_INDICATOR_A = 0x1f1e6;
  return (
    String.fromCodePoint(code.charCodeAt(0) - A + REGIONAL_INDICATOR_A) +
    String.fromCodePoint(code.charCodeAt(1) - A + REGIONAL_INDICATOR_A)
  );
};

function CountryPanel({ rows }: { rows: CountryStats[] }) {
  const top = rows.slice(0, 10);
  const max = top.reduce((m, r) => (r.hits > m ? r.hits : m), 0) || 1;

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-zinc-800/80 bg-zinc-950/50 p-5">
      <header>
        <p className="text-xs uppercase tracking-widest text-zinc-500">
          geo distribution
        </p>
        <h2 className="mt-1 font-mono text-sm text-zinc-200">
          Top countries (all traffic)
        </h2>
      </header>

      {top.length === 0 ? (
        <p className="font-mono text-xs text-zinc-600">
          no traffic in this window
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {top.map((row) => {
            const pct = Math.round((row.hits / max) * 100);
            const label = COUNTRY_NAMES[row.country] ?? row.country;
            return (
              <li
                key={row.country}
                className="flex flex-col gap-0.5 font-mono text-xs"
              >
                <div className="flex items-baseline justify-between">
                  <span className="truncate text-zinc-300">
                    <span className="mr-1.5">{countryFlag(row.country)}</span>
                    {label}
                    <span className="ml-2 text-zinc-600">[{row.country}]</span>
                  </span>
                  <span className="tabular-nums text-zinc-500">
                    {formatNumber(row.hits)}
                  </span>
                </div>
                <div className="h-[3px] w-full overflow-hidden rounded-sm bg-zinc-800/80">
                  <div
                    className="h-full bg-emerald-500/60"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default async function DashboardPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const windowParam = parseWindow(params.window);

  let data: AnalyticsQueryResponse | null = null;
  let errorMessage: string | null = null;

  try {
    data = await getCachedAnalytics(windowParam);
  } catch (error) {
    errorMessage =
      error instanceof Error ? error.message : "analytics unavailable";
  }

  const mcp = data?.mcp ?? EMPTY_STATS;
  const api = data?.api ?? EMPTY_STATS;
  const page = data?.page ?? EMPTY_STATS;
  const byCountry = data?.byCountry ?? [];
  const generatedAt = data?.generatedAt
    ? new Date(data.generatedAt).toLocaleString("en-US", {
        timeZone: "UTC",
      })
    : null;

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-emerald-400/80">
            usage
          </p>
          <h1 className="mt-1 font-mono text-2xl text-zinc-100">
            dify-helm-watchdog
          </h1>
          <p className="mt-2 font-mono text-xs text-zinc-500">
            {generatedAt
              ? `last refreshed ${generatedAt} UTC`
              : "live (cache 5 min)"}
          </p>
        </div>
        <WindowToggle current={windowParam} />
      </header>

      {errorMessage ? (
        <div className="rounded-md border border-red-900/40 bg-red-950/20 p-4 font-mono text-xs text-red-300">
          analytics unavailable: {errorMessage}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Panel
          title="MCP tool calls"
          subtitle="model context protocol"
          stats={mcp}
          showBreakdown
        />
        <Panel
          title="REST API requests"
          subtitle="public json api"
          stats={api}
          showBreakdown
        />
        <Panel
          title="Page views"
          subtitle="web ui"
          stats={page}
          showBreakdown={false}
        />
      </div>

      <CountryPanel rows={byCountry} />

      <footer className="font-mono text-[11px] text-zinc-600">
        Aggregated counts only — no IPs, user agents, or request bodies are
        stored. Country is derived server-side from the Vercel geo header
        (ISO-3166-1 alpha-2); &quot;XX&quot; means unknown / local dev.
      </footer>
    </main>
  );
}
