# analytics-worker

Cloudflare Worker that ingests analytics events for `dify-helm-watchdog` and
exposes a query endpoint for the public `/dashboard` page on the Vercel app.

Wire-up: Vercel middleware / MCP handler → `POST /track` → Analytics Engine.
Dashboard read: Vercel route → `POST /query` → SQL API → Analytics Engine.
Browser never talks to this Worker directly.

## Analytics Engine row schema (`dify_watchdog_events`)

| Column | Source | Example |
|---|---|---|
| `blob1` | event kind | `mcp` / `api` / `page` |
| `blob2` | event name | `list_images` / `versions/3.9.0/values` / `home` |
| `blob3` | ISO-3166-1 alpha-2 country, server-extracted from `x-vercel-ip-country` | `US` / `CN` / `XX` (unknown) |
| `index1` | session hash, `sha256(ip + ua + salt)` — used for UV via `count(DISTINCT index1)` | 64-char hex |
| `double1` | latency ms (MCP only; 0 for api/page) | `12` |
| `timestamp` | AE auto | — |
| `_sample_interval` | AE auto sampling weight; `sum(_sample_interval)` is the real hit count | — |

No raw IP, user-agent, referrer, URL params, or body is ever stored. Country
is set by Vercel's edge based on the caller IP and cannot be forged by the
client (it never appears in the JSON-RPC / HTTP body).

## `/query` response

`POST /query` (signed) returns window-aggregated stats: per-kind totals
(`mcp` / `api` / `page`), `byCountry` (top countries), and `timeseries` —
one `{ date, country, hits }` row per day per country
(`GROUP BY toStartOfInterval(timestamp, INTERVAL '1' DAY), blob3`). The
dashboard rolls the daily rows up to weekly buckets client-side for the 90d
window; the SQL always returns daily granularity.

## What exists in Cloudflare (as of first deploy)

| Resource | Identifier | Where to find it |
|---|---|---|
| CF account | `LangGenius OPC 环境` (`8f7d374db5cb1f025b7f71e28b84c9bb`) | dash.cloudflare.com (account switcher) |
| Worker | `dify-watchdog-analytics` | Workers & Pages → Overview |
| Custom domain | `dify-watchdog-analytics.langgenius.app` | Worker → Settings → Domains & Routes (DNS auto-created in `langgenius.app` zone) |
| Analytics Engine dataset | `dify_watchdog_events` | bound as `env.EVENTS` (writes); reads via SQL API |
| Worker secret | `ANALYTICS_WORKER_SECRET` | HMAC shared with Vercel — must match `ANALYTICS_WORKER_SECRET` in Vercel env |
| Worker secret | `CF_ACCOUNT_ID` | same value as the account ID above, used by `/query` against the SQL API |
| Worker secret | `CF_ANALYTICS_TOKEN` | API token, name `dify-watchdog-analytics-engine-read`, scope `Account Analytics:Read` on the LangGenius OPC account |
| CF API token | `dify-watchdog-analytics-engine-read` | User → My Profile → API Tokens |

Vercel side (project `dify-helm-watchdog`):

| Env var | Where set | Notes |
|---|---|---|
| `ANALYTICS_WORKER_URL` | Production (+ Preview after merge if needed) | `https://dify-watchdog-analytics.langgenius.app` |
| `ANALYTICS_WORKER_SECRET` | Production | must equal the Worker secret of the same name |
| `ANALYTICS_SESSION_SALT` | Production | random hex, salts `sha256(ip + ua + salt)` to derive session ID; rotating invalidates uniqueness continuity |

## Deploy / update

```bash
cd cloudflare/analytics-worker

# one-time: log in (skip if already authenticated to LangGenius OPC)
# unset CF_API_TOKEN CLOUDFLARE_API_TOKEN   # if a User Token from another account is exported in your shell
# wrangler login

wrangler deploy
```

To rotate a Worker secret:

```bash
wrangler secret put ANALYTICS_WORKER_SECRET   # paste new value
# remember to update the Vercel side too, otherwise HMAC verification fails
```

## Tail / debug

```bash
wrangler tail                # live event stream
wrangler secret list         # names only, no values
```

The Worker only accepts POST. A `curl https://dify-watchdog-analytics.langgenius.app/`
returning `405 Method Not Allowed` is the healthy idle response.

## Full teardown (in this order)

1. **Vercel env vars** — remove `ANALYTICS_WORKER_URL`, `ANALYTICS_WORKER_SECRET`,
   `ANALYTICS_SESSION_SALT` from Production (and Preview if you added them).
   With those unset, tracking becomes a no-op and the `/dashboard` page renders
   empty stats; the rest of the site is unaffected.
2. **CF API token** — dashboard → My Profile → API Tokens → revoke
   `dify-watchdog-analytics-engine-read`.
3. **Worker** — `wrangler delete` from this directory. This removes the
   `dify-watchdog-analytics.langgenius.app` DNS record (custom domain) and the
   Worker itself. Worker secrets are deleted along with the Worker.
4. **Analytics Engine dataset** — there is no manual delete for Analytics Engine
   row data; the free-tier 90-day retention will age it out. Just stop writing.
   The dataset binding name is `dify_watchdog_events` and lives only in this
   `wrangler.toml`, so removing the Worker effectively orphans it.
