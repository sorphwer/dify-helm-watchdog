# dify-helm-watchdog

Cyber-dark dashboard that snapshots the [Dify Helm chart](https://langgenius.github.io/dify-helm) every day. A scheduled Vercel Cron job downloads new chart versions, extracts `values.yaml` and a curated `docker-images.yaml`, caches both artifacts in Cloudflare R2, and exposes them through a Tailwind + shadcn styled Next.js UI.

## Features

- **Daily cron** via `/api/v1/cron` (configured in `vercel.json`) keeps `cache.json`, `values.yaml`, and `docker-images.yaml` files fresh.
- **Cloudflare R2** persists cached artifacts via the S3-compatible API, served publicly through a custom domain; hashes are tracked in `cache.json` for quick diffing.
- **Cyber dark UI** with a left-hand version rail and dual copyable code panes powered by a shadcn-inspired `CodeBlock`.
- **Public usage dashboard** at `/dashboard` showing MCP / REST / page-view counts plus top countries, backed by a Cloudflare Worker + Analytics Engine (no IPs, UAs, or bodies stored — only a hashed session ID and a derived country code).
- **RESTful API** for programmatic access:
  - `GET /api/v1/versions` – list all cached Helm versions
  - `GET /api/v1/versions/latest` – get latest version info
  - `GET /api/v1/versions/{version}/images` – get image list (supports JSON/YAML format)
  - `GET /api/v1/versions/{version}/values` – download values.yaml
  - `GET /api/v1/versions/{version}/validation` – get image validation results
  - `GET /api/v1/analytics?window=7d|30d|90d` – aggregated dashboard stats (proxies the Worker)
  - `POST /api/v1/cron` – runs the synchronisation job
  - `GET /api/v1/cache` – returns the latest cache payload (legacy endpoint)
  
  📖 **[Full API Documentation](./docs/API.md)** | 🚀 **[Quick Start Guide](./docs/QUICKSTART.md)**

## Prerequisites

- Node.js 20+
- Yarn (project uses `yarn.lock`)
- Vercel account (deployment) and Cloudflare account with an R2 bucket + S3 API token

## Local Setup

1. Install dependencies:
   ```bash
   yarn install
   ```

2. Configure environment variables:
   ```bash
   cp .env.example .env.local
   # Edit .env.local and set the R2_* variables
   ```
   Create an R2 bucket in the Cloudflare dashboard, then generate an S3 API token (Object Read & Write) scoped to that bucket. Attach a public custom domain and use it as `R2_PUBLIC_BASE_URL`. To skip R2 entirely during local development, set `ENABLE_LOCAL_MODE=true` and the cache will be written under `.cache/helm/` instead.

3. Run the dev server:
   ```bash
   yarn dev
   ```

4. Prime the cache (optional but recommended before visiting the UI):
   ```bash
   curl -X POST http://localhost:3000/api/v1/cron
   ```
   Once complete, the UI at `http://localhost:3000` will show the latest versions and YAML snapshots.

## Deployment Notes

- `vercel.json` schedules the cron at `0 2 * * *` UTC. Adjust as needed.
- Ensure the five `R2_*` variables (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE_URL`) are configured in the Vercel project settings.
- No additional build steps are required; the cron uses Next.js App Router API routes.

## Development Commands

| Command        | Description                       |
| -------------- | --------------------------------- |
| `yarn dev`     | Run Next.js dev server            |
| `yarn build`   | Production build                  |
| `yarn start`   | Run production server locally     |
| `yarn lint`    | Run ESLint with project defaults  |

## Architecture Overview

```
┌────────────┐      ┌───────────────────────────┐      ┌─────────────────┐
│ Vercel Cron│ ---> │ /api/v1/cron (syncHelmData)  │ ---> │ Cloudflare R2   │
└────────────┘      │ - fetch index.yaml        │      │ cache.json       │
                    │ - extract values/images   │      │ values/*.yaml    │
                    └───────────────────────────┘      │ images/*.yaml    │
                                                         └─────────────────┘
                            │
                            ▼
                     ┌─────────────┐
                     │ Next.js UI  │
                     │ (VersionRail│
                     │  + CodeBlock)│
                     └─────────────┘
```

Run the cron manually after deployment (or wait for the daily trigger) to populate the cache before sharing the dashboard.
