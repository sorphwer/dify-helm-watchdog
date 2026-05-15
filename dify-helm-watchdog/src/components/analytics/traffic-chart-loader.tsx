"use client";

import dynamic from "next/dynamic";

import type { TrafficSeries } from "@/lib/analytics/timeseries";

// ECharts is browser-only and heavy — load it lazily, client-side only, so it
// never enters the SSR bundle or any route other than /dashboard.
const TrafficChart = dynamic(() => import("./traffic-chart"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[280px] items-center justify-center font-mono text-xs text-zinc-600">
      loading chart…
    </div>
  ),
});

export function TrafficChartLoader(props: TrafficSeries) {
  return <TrafficChart {...props} />;
}
