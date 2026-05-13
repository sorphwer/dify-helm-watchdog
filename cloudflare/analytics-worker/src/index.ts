interface Env {
  EVENTS: AnalyticsEngineDataset;
  ANALYTICS_WORKER_SECRET: string;
  CF_ACCOUNT_ID: string;
  CF_ANALYTICS_TOKEN: string;
}

type EventKind = "mcp" | "api" | "page";
type Window = "7d" | "30d" | "90d";

interface TrackPayload {
  kind: EventKind;
  name: string;
  sessionHash: string;
  country?: string;
  latencyMs?: number;
}

interface QueryPayload {
  window: Window;
}

interface KindStats {
  total: number;
  uv: number;
  byName: Array<{ name: string; hits: number }>;
}

interface CountryStats {
  country: string;
  hits: number;
  uv: number;
}

interface QueryResult {
  window: Window;
  generatedAt: string;
  mcp: KindStats;
  api: KindStats;
  page: KindStats;
  byCountry: CountryStats[];
}

const REPLAY_WINDOW_MS = 5 * 60 * 1000;
const WINDOW_DAYS: Record<Window, number> = { "7d": 7, "30d": 30, "90d": 90 };
const DATASET = "dify_watchdog_events";

const encoder = new TextEncoder();

const toHex = (buf: ArrayBuffer): string =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

const constantTimeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
};

const verifyHmac = async (
  secret: string,
  timestamp: string,
  body: string,
  signature: string,
): Promise<boolean> => {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(Date.now() - ts) > REPLAY_WINDOW_MS) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBytes = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${timestamp}.${body}`),
  );
  return constantTimeEqual(toHex(sigBytes), signature.toLowerCase());
};

const authenticate = async (
  req: Request,
  env: Env,
): Promise<{ body: string; payload: unknown } | Response> => {
  const ts = req.headers.get("X-Timestamp");
  const sig = req.headers.get("X-Signature");
  if (!ts || !sig) {
    return new Response("missing signature headers", { status: 401 });
  }
  const body = await req.text();
  const ok = await verifyHmac(env.ANALYTICS_WORKER_SECRET, ts, body, sig);
  if (!ok) {
    return new Response("bad signature", { status: 401 });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return new Response("invalid json", { status: 400 });
  }
  return { body, payload };
};

const isTrackPayload = (x: unknown): x is TrackPayload => {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  const countryOk =
    o.country === undefined ||
    (typeof o.country === "string" && /^[A-Z]{2}$/.test(o.country));
  return (
    (o.kind === "mcp" || o.kind === "api" || o.kind === "page") &&
    typeof o.name === "string" &&
    o.name.length > 0 &&
    o.name.length <= 256 &&
    typeof o.sessionHash === "string" &&
    o.sessionHash.length > 0 &&
    o.sessionHash.length <= 128 &&
    countryOk &&
    (o.latencyMs === undefined || typeof o.latencyMs === "number")
  );
};

const isQueryPayload = (x: unknown): x is QueryPayload => {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return o.window === "7d" || o.window === "30d" || o.window === "90d";
};

const handleTrack = async (
  payload: unknown,
  env: Env,
): Promise<Response> => {
  if (!isTrackPayload(payload)) {
    return new Response("invalid track payload", { status: 400 });
  }

  env.EVENTS.writeDataPoint({
    blobs: [payload.kind, payload.name, payload.country ?? "XX"],
    indexes: [payload.sessionHash],
    doubles: [payload.latencyMs ?? 0],
  });

  return new Response(JSON.stringify({ ok: true }), {
    status: 202,
    headers: { "content-type": "application/json" },
  });
};

interface AnalyticsRow {
  name?: string;
  hits?: number;
  uv?: number;
  country?: string;
}

interface AnalyticsResponse {
  data?: AnalyticsRow[];
}

const runSql = async (
  env: Env,
  sql: string,
): Promise<AnalyticsRow[]> => {
  const url = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/analytics_engine/sql`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.CF_ANALYTICS_TOKEN}`,
      "Content-Type": "text/plain",
    },
    body: sql,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`analytics_engine sql ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as AnalyticsResponse;
  return json.data ?? [];
};

const escapeKind = (kind: EventKind): string => {
  // kind comes from a closed enum so it's safe; defensive sanitize anyway.
  return kind.replace(/[^a-z]/g, "");
};

const queryKind = async (
  env: Env,
  kind: EventKind,
  days: number,
): Promise<KindStats> => {
  const safeKind = escapeKind(kind);
  const breakdownSql = `
    SELECT
      blob2 AS name,
      sum(_sample_interval) AS hits
    FROM ${DATASET}
    WHERE blob1 = '${safeKind}'
      AND timestamp > NOW() - INTERVAL '${days}' DAY
    GROUP BY name
    ORDER BY hits DESC
    LIMIT 20
    FORMAT JSON
  `;
  const totalSql = `
    SELECT
      sum(_sample_interval) AS hits,
      count(DISTINCT index1) AS uv
    FROM ${DATASET}
    WHERE blob1 = '${safeKind}'
      AND timestamp > NOW() - INTERVAL '${days}' DAY
    FORMAT JSON
  `;

  const [breakdown, totals] = await Promise.all([
    runSql(env, breakdownSql),
    runSql(env, totalSql),
  ]);

  const totalRow = totals[0] ?? {};
  return {
    total: Number(totalRow.hits ?? 0),
    uv: Number(totalRow.uv ?? 0),
    byName: breakdown.map((row) => ({
      name: String(row.name ?? ""),
      hits: Number(row.hits ?? 0),
    })),
  };
};

const queryCountries = async (
  env: Env,
  days: number,
): Promise<CountryStats[]> => {
  // Old rows written before blob3 was introduced will have blob3 = ''.
  // We surface those as 'XX' (unknown) instead of dropping them so the
  // dashboard stays honest about coverage during the rollout window.
  const sql = `
    SELECT
      CASE WHEN blob3 = '' THEN 'XX' ELSE blob3 END AS country,
      sum(_sample_interval) AS hits,
      count(DISTINCT index1) AS uv
    FROM ${DATASET}
    WHERE timestamp > NOW() - INTERVAL '${days}' DAY
    GROUP BY country
    ORDER BY hits DESC
    LIMIT 20
    FORMAT JSON
  `;
  const rows = await runSql(env, sql);
  return rows.map((row) => ({
    country: String(row.country ?? "XX"),
    hits: Number(row.hits ?? 0),
    uv: Number(row.uv ?? 0),
  }));
};

const handleQuery = async (
  payload: unknown,
  env: Env,
): Promise<Response> => {
  if (!isQueryPayload(payload)) {
    return new Response("invalid query payload", { status: 400 });
  }
  const days = WINDOW_DAYS[payload.window];

  try {
    const [mcp, api, page, byCountry] = await Promise.all([
      queryKind(env, "mcp", days),
      queryKind(env, "api", days),
      queryKind(env, "page", days),
      queryCountries(env, days),
    ]);
    const result: QueryResult = {
      window: payload.window,
      generatedAt: new Date().toISOString(),
      mcp,
      api,
      page,
      byCountry,
    };
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "query failed";
    return new Response(
      JSON.stringify({ error: "query_failed", message }),
      { status: 502, headers: { "content-type": "application/json" } },
    );
  }
};

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method !== "POST") {
      return new Response("method not allowed", { status: 405 });
    }
    const url = new URL(req.url);
    const auth = await authenticate(req, env);
    if (auth instanceof Response) return auth;

    if (url.pathname === "/track") {
      return handleTrack(auth.payload, env);
    }
    if (url.pathname === "/query") {
      return handleQuery(auth.payload, env);
    }
    return new Response("not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
