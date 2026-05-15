import { buildTrafficSeries } from "@/lib/analytics/timeseries";
import type { TimeseriesRow } from "@/lib/analytics/track";

const NOW = new Date("2026-05-15T12:00:00Z");

describe("buildTrafficSeries", () => {
  it("generates 7 daily buckets for the 7d window with empty input", () => {
    const result = buildTrafficSeries([], "7d", NOW);
    expect(result.buckets).toEqual([
      "2026-05-09",
      "2026-05-10",
      "2026-05-11",
      "2026-05-12",
      "2026-05-13",
      "2026-05-14",
      "2026-05-15",
    ]);
    expect(result.series).toEqual([]);
  });

  it("generates 30 daily buckets for the 30d window", () => {
    const result = buildTrafficSeries([], "30d", NOW);
    expect(result.buckets).toHaveLength(30);
    expect(result.buckets[29]).toBe("2026-05-15");
    expect(result.buckets[0]).toBe("2026-04-16");
  });

  it("generates 13 weekly buckets for the 90d window", () => {
    const result = buildTrafficSeries([], "90d", NOW);
    expect(result.buckets).toHaveLength(13);
    // newest bucket is the 7-day window ending today, labeled by its start
    expect(result.buckets[12]).toBe("2026-05-09");
  });

  it("places daily rows in the correct bucket and sums hits", () => {
    const rows: TimeseriesRow[] = [
      { date: "2026-05-15", country: "US", hits: 10 },
      { date: "2026-05-15", country: "US", hits: 5 },
      { date: "2026-05-09", country: "US", hits: 3 },
    ];
    const result = buildTrafficSeries(rows, "7d", NOW);
    const us = result.series.find((s) => s.country === "US");
    expect(us).toBeDefined();
    expect(us!.data[6]).toBe(15);
    expect(us!.data[0]).toBe(3);
    expect(us!.data[3]).toBe(0);
  });

  it("drops rows older than the window", () => {
    const rows: TimeseriesRow[] = [
      { date: "2026-05-08", country: "US", hits: 99 },
    ];
    const result = buildTrafficSeries(rows, "7d", NOW);
    expect(result.series).toEqual([]);
  });

  it("aggregates rows within the same week for the 90d window", () => {
    const rows: TimeseriesRow[] = [
      { date: "2026-05-15", country: "US", hits: 4 },
      { date: "2026-05-11", country: "US", hits: 6 },
    ];
    const result = buildTrafficSeries(rows, "90d", NOW);
    const us = result.series.find((s) => s.country === "US")!;
    expect(us.data[12]).toBe(10);
  });

  it("keeps the top 8 countries and folds the rest into Other", () => {
    const rows: TimeseriesRow[] = [
      "US",
      "CN",
      "JP",
      "KR",
      "DE",
      "GB",
      "FR",
      "IN",
      "SG",
      "HK",
    ].map((country, i) => ({
      date: "2026-05-15",
      country,
      hits: 100 - i, // US highest, HK lowest
    }));
    const result = buildTrafficSeries(rows, "7d", NOW);
    const names = result.series.map((s) => s.country);
    expect(names).toHaveLength(9);
    expect(names.slice(0, 8)).toEqual([
      "US",
      "CN",
      "JP",
      "KR",
      "DE",
      "GB",
      "FR",
      "IN",
    ]);
    expect(names[8]).toBe("Other");
    const other = result.series[8];
    // SG (92) + HK (91)
    expect(other.data[6]).toBe(183);
  });

  it("does not emit an Other series when there are 8 or fewer countries", () => {
    const rows: TimeseriesRow[] = ["US", "CN", "JP"].map((country) => ({
      date: "2026-05-15",
      country,
      hits: 10,
    }));
    const result = buildTrafficSeries(rows, "7d", NOW);
    expect(result.series.map((s) => s.country)).toEqual(["US", "CN", "JP"]);
  });

  it("orders series by total hits descending", () => {
    const rows: TimeseriesRow[] = [
      { date: "2026-05-15", country: "CN", hits: 50 },
      { date: "2026-05-15", country: "US", hits: 80 },
      { date: "2026-05-14", country: "JP", hits: 65 },
    ];
    const result = buildTrafficSeries(rows, "7d", NOW);
    expect(result.series.map((s) => s.country)).toEqual(["US", "JP", "CN"]);
  });
});
