export type EventKind = "mcp" | "api" | "page";

export interface TrackEventInput {
  kind: EventKind;
  name: string;
  sessionHash: string;
  latencyMs?: number;
}

const TRACK_TIMEOUT_MS = 2000;
const encoder = new TextEncoder();

const toHex = (buf: ArrayBuffer): string => {
  const bytes = new Uint8Array(buf);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
};

const isConfigured = (): { url: string; secret: string } | null => {
  const url = process.env.ANALYTICS_WORKER_URL?.trim();
  const secret = process.env.ANALYTICS_WORKER_SECRET?.trim();
  if (!url || !secret) return null;
  return { url: url.replace(/\/+$/, ""), secret };
};

const signBody = async (
  secret: string,
  timestamp: string,
  body: string,
): Promise<string> => {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${timestamp}.${body}`),
  );
  return toHex(sig);
};

export const trackEvent = async (input: TrackEventInput): Promise<void> => {
  const cfg = isConfigured();
  if (!cfg) return;

  const body = JSON.stringify({
    kind: input.kind,
    name: input.name.slice(0, 256),
    sessionHash: input.sessionHash,
    ...(typeof input.latencyMs === "number"
      ? { latencyMs: Math.max(0, Math.round(input.latencyMs)) }
      : {}),
  });
  const timestamp = Date.now().toString();
  const signature = await signBody(cfg.secret, timestamp, body);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TRACK_TIMEOUT_MS);

  try {
    await fetch(`${cfg.url}/track`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Timestamp": timestamp,
        "X-Signature": signature,
      },
      body,
      signal: controller.signal,
    });
  } catch {
    // Analytics must never break a real request. Swallow.
  } finally {
    clearTimeout(timer);
  }
};

export interface KindStats {
  total: number;
  uv: number;
  byName: Array<{ name: string; hits: number }>;
}

export interface AnalyticsQueryResponse {
  window: "7d" | "30d" | "90d";
  generatedAt: string;
  mcp: KindStats;
  api: KindStats;
  page: KindStats;
}

export const queryAnalytics = async (
  window: "7d" | "30d" | "90d",
): Promise<AnalyticsQueryResponse> => {
  const cfg = isConfigured();
  if (!cfg) {
    throw new Error("analytics worker not configured");
  }

  const body = JSON.stringify({ window });
  const timestamp = Date.now().toString();
  const signature = await signBody(cfg.secret, timestamp, body);

  const res = await fetch(`${cfg.url}/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Timestamp": timestamp,
      "X-Signature": signature,
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `analytics query failed: ${res.status} ${text.slice(0, 200)}`,
    );
  }

  return (await res.json()) as AnalyticsQueryResponse;
};
