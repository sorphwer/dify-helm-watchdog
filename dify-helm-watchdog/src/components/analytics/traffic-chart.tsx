"use client";

import { useEffect, useRef } from "react";

import * as echarts from "echarts/core";
import { BarChart } from "echarts/charts";
import {
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

import {
  COUNTRY_COLORS,
  OTHER_COLOR,
  OTHER_LABEL,
  countryFlag,
  countryLabel,
} from "@/lib/analytics/countries";
import type { TrafficSeries } from "@/lib/analytics/timeseries";

echarts.use([
  BarChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  CanvasRenderer,
]);

interface TooltipParam {
  seriesName: string;
  value: number;
  axisValueLabel: string;
}

const seriesColor = (country: string, index: number): string =>
  country === OTHER_LABEL
    ? OTHER_COLOR
    : COUNTRY_COLORS[index % COUNTRY_COLORS.length];

const formatTooltip = (raw: unknown): string => {
  const params = (Array.isArray(raw) ? raw : [raw]) as TooltipParam[];
  if (params.length === 0) return "";
  const rows = params
    .filter((p) => Number(p.value) > 0)
    .sort((a, b) => Number(b.value) - Number(a.value));
  const total = params.reduce((sum, p) => sum + Number(p.value || 0), 0);

  const header = `<div style="margin-bottom:4px;color:#a1a1aa">${params[0].axisValueLabel}</div>`;
  if (rows.length === 0) {
    return `${header}<div style="color:#52525b">no traffic</div>`;
  }
  const body = rows
    .map((p) => {
      const name = `${countryFlag(p.seriesName)} ${countryLabel(p.seriesName)}`;
      return `<div style="display:flex;justify-content:space-between;gap:16px"><span>${name}</span><span style="color:#e4e4e7">${Number(p.value).toLocaleString("en-US")}</span></div>`;
    })
    .join("");
  const totalRow = `<div style="display:flex;justify-content:space-between;gap:16px;margin-top:4px;border-top:1px solid #3f3f46;padding-top:4px;color:#a1a1aa"><span>total</span><span>${total.toLocaleString("en-US")}</span></div>`;
  return `${header}${body}${totalRow}`;
};

export default function TrafficChart({ buckets, series }: TrafficSeries) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof echarts.init> | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = echarts.init(containerRef.current, undefined, {
      renderer: "canvas",
    });
    chartRef.current = chart;

    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const option = {
      backgroundColor: "transparent",
      grid: { top: 36, right: 12, bottom: 28, left: 44 },
      legend: {
        top: 0,
        textStyle: { color: "#a1a1aa", fontFamily: "monospace", fontSize: 11 },
        // No color swatch — the flag emoji alone identifies each country.
        itemWidth: 0,
        itemHeight: 0,
        itemGap: 14,
        formatter: (name: string) =>
          `${countryFlag(name)} ${countryLabel(name)}`,
      },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        backgroundColor: "#18181b",
        borderColor: "#3f3f46",
        textStyle: { color: "#d4d4d8", fontFamily: "monospace", fontSize: 11 },
        formatter: formatTooltip,
      },
      xAxis: {
        type: "category",
        data: buckets,
        axisLine: { lineStyle: { color: "#3f3f46" } },
        axisTick: { show: false },
        axisLabel: {
          color: "#71717a",
          fontFamily: "monospace",
          fontSize: 10,
          formatter: (value: string) => value.slice(5),
        },
      },
      yAxis: {
        type: "value",
        splitLine: { lineStyle: { color: "#27272a" } },
        axisLabel: { color: "#71717a", fontFamily: "monospace", fontSize: 10 },
      },
      series: series.map((s, i) => ({
        name: s.country,
        type: "bar",
        stack: "total",
        data: s.data,
        itemStyle: { color: seriesColor(s.country, i) },
        emphasis: { focus: "series" },
        barMaxWidth: 36,
      })),
    };

    chart.setOption(option as echarts.EChartsCoreOption, true);
  }, [buckets, series]);

  const hasData = series.some((s) => s.data.some((v) => v > 0));

  return (
    <div className="relative">
      <div ref={containerRef} className="h-[280px] w-full" />
      {!hasData ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="font-mono text-xs text-zinc-600">
            no traffic in this window
          </p>
        </div>
      ) : null}
    </div>
  );
}
