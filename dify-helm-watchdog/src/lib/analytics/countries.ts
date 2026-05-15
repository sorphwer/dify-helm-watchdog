export const COUNTRY_NAMES: Record<string, string> = {
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

export const countryFlag = (code: string): string => {
  if (code === "XX" || !/^[A-Z]{2}$/.test(code)) return "🌐";
  const A = 0x41;
  const REGIONAL_INDICATOR_A = 0x1f1e6;
  return (
    String.fromCodePoint(code.charCodeAt(0) - A + REGIONAL_INDICATOR_A) +
    String.fromCodePoint(code.charCodeAt(1) - A + REGIONAL_INDICATOR_A)
  );
};

export const countryLabel = (code: string): string =>
  COUNTRY_NAMES[code] ?? code;

// Distinct hues tuned for the dark (bg-zinc-950) dashboard. Assigned to the
// stacked-bar series by rank order, so a country always keeps the same color.
export const COUNTRY_COLORS: readonly string[] = [
  "#34d399", // emerald-400
  "#38bdf8", // sky-400
  "#fbbf24", // amber-400
  "#a78bfa", // violet-400
  "#fb7185", // rose-400
  "#22d3ee", // cyan-400
  "#a3e635", // lime-400
  "#fb923c", // orange-400
];

// "Other" rollup bucket.
export const OTHER_COLOR = "#52525b"; // zinc-600
export const OTHER_LABEL = "Other";
