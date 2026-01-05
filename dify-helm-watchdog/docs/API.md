# API Documentation

This document describes the REST API exposed by **dify-helm-watchdog**.
The source of truth is the OpenAPI document served at `/openapi.json` (generated from Next.js route handler Swagger annotations).

## Quick links

- **OpenAPI JSON**: `https://dify-helm-watchdog.vercel.app/openapi.json` (also available at `/openapi.json`)
- **Swagger UI**: `https://dify-helm-watchdog.vercel.app/swagger` (also available at `/swagger`)
- **API base path**: `/api/v1`

---

## Base URL & versioning

- **Base URL**: `https://dify-helm-watchdog.vercel.app`
- **API base path**: `/api/v1`

Example:

```bash
curl 'https://dify-helm-watchdog.vercel.app/api/v1/versions'
```

---

## Authentication

- **Public endpoints**: no authentication required.
- **Cron endpoint** (`POST /api/v1/cron`):
  - If the environment variable `CRON_API_KEY` is set, requests must include:
    - `Authorization: Bearer <token>`
  - Requests coming from the platform cron scheduler may bypass auth when the request contains:
    - `x-vercel-cron: true`

---

## Caching & conditional requests

Some endpoints set CDN caching headers (for example `Cache-Control: public, s-maxage=...`).
JSON/text responses include an `ETag`. Clients may send `If-None-Match` and receive **304 Not Modified**.

---

## Error format

When an endpoint returns an error using the standard error helper, the response body looks like:

```json
{
  "error": {
    "code": 5,
    "message": "Cache not available. Trigger the cron job first.",
    "status": "NOT_FOUND",
    "details": [
      {
        "reason": "CACHE_NOT_INITIALIZED"
      }
    ]
  }
}
```

Common `details[].reason` values:

- `CACHE_NOT_INITIALIZED`
- `NO_VERSIONS_AVAILABLE`
- `VERSION_NOT_FOUND`
- `VALIDATION_NOT_AVAILABLE`

---

## Endpoints

### 1) List chart versions

```http
GET /api/v1/versions
```

Query parameters:

| Name | Type | Default | Notes |
|------|------|---------|-------|
| `includeValidation` | boolean | `false` | Includes aggregated image validation stats per version (when available). |
| `include_validation` | boolean | `false` | Deprecated alias of `includeValidation`. |

Example:

```bash
curl 'https://dify-helm-watchdog.vercel.app/api/v1/versions?includeValidation=true'
```

Caching:

- `Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400`

---

### 2) Get the latest cached version

```http
GET /api/v1/versions/latest
```

Query parameters:

| Name | Type | Default | Notes |
|------|------|---------|-------|
| `versionOnly` | boolean | `false` | When `true`, returns only the version string as **plain text**. |

Examples:

```bash
# JSON response
curl 'https://dify-helm-watchdog.vercel.app/api/v1/versions/latest'

# Plain text response (just the version)
curl 'https://dify-helm-watchdog.vercel.app/api/v1/versions/latest?versionOnly=true'
```

Caching:

- `Cache-Control: public, s-maxage=1800, stale-while-revalidate=3600`

---

### 3) Get version details

```http
GET /api/v1/versions/{version}
```

Path parameters:

| Name | Type | Notes |
|------|------|-------|
| `version` | string | Must match a cached version string (e.g. `1.0.0`). |

Caching:

- `Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400`

---

### 4) List images for a version

```http
GET /api/v1/versions/{version}/images
```

Query parameters:

| Name | Type | Default | Notes |
|------|------|---------|-------|
| `format` | string | `json` | `json` or `yaml`. |
| `includeValidation` | boolean | `false` | When `true`, enriches images with validation status/variants (if available). |

Examples:

```bash
# JSON (default)
curl 'https://dify-helm-watchdog.vercel.app/api/v1/versions/1.0.0/images'

# YAML
curl 'https://dify-helm-watchdog.vercel.app/api/v1/versions/1.0.0/images?format=yaml'

# JSON + validation fields (if validation exists for that version)
curl 'https://dify-helm-watchdog.vercel.app/api/v1/versions/1.0.0/images?includeValidation=true'
```

Caching:

- `Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400`

---

### 5) Download `values.yaml`

```http
GET /api/v1/versions/{version}/values
```

Response:

- **Content-Type**: `application/x-yaml; charset=utf-8`
- Sets `Content-Disposition: inline; filename="values-{version}.yaml"`

Example:

```bash
curl 'https://dify-helm-watchdog.vercel.app/api/v1/versions/1.0.0/values' -o values-1.0.0.yaml
```

Caching:

- `Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400`

---

### 6) Get validation report

```http
GET /api/v1/versions/{version}/validation
```

Query parameters:

| Name | Type | Default | Notes |
|------|------|---------|-------|
| `isMissing` | boolean | `false` | When `true`, returns only images whose overall status is `MISSING`. |

Example:

```bash
# Full report
curl 'https://dify-helm-watchdog.vercel.app/api/v1/versions/1.0.0/validation'

# Only missing images
curl 'https://dify-helm-watchdog.vercel.app/api/v1/versions/1.0.0/validation?isMissing=true'
```

Caching:

- `Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400`

---

### 7) Inspect cache payload

```http
GET /api/v1/cache
```

Notes:

- When the cache is not initialized, this endpoint returns:
  - `{"updateTime": null, "versions": []}`

Example:

```bash
curl 'https://dify-helm-watchdog.vercel.app/api/v1/cache'
```

---

### 8) Trigger Helm cache synchronization (Cron)

```http
POST /api/v1/cron
```

Authentication:

- If `CRON_API_KEY` is configured:
  - `Authorization: Bearer <token>`
- Requests with `x-vercel-cron: true` may bypass auth checks.

Query parameters:

| Name | Type | Notes |
|------|------|-------|
| `version` | string[] | Optional. Repeat the param (`?version=1.0.0&version=1.0.1`) or pass a comma-separated list (`?version=1.0.0,1.0.1`). A leading `v` is accepted and stripped (e.g. `v1.0.0`). |
| `pause` | integer | Optional. Seconds to wait before starting. Clamped to `MAX_PAUSE_SECONDS` (default `300`). Heartbeat messages are emitted every 10 seconds. |

Response:

- **Content-Type**: `text/plain; charset=utf-8`
- **Streaming logs**, one line per message.
- `Cache-Control: no-store`

Examples:

```bash
# Sync all versions (when CRON_API_KEY is not set)
curl -X POST 'https://dify-helm-watchdog.vercel.app/api/v1/cron'

# Sync with Bearer token
curl -X POST 'https://dify-helm-watchdog.vercel.app/api/v1/cron' \
  -H 'Authorization: Bearer your-cron-api-key'

# Refresh specific versions
curl -X POST 'https://dify-helm-watchdog.vercel.app/api/v1/cron?version=1.0.0,1.0.1' \
  -H 'Authorization: Bearer your-cron-api-key'

# Pause before starting (seconds)
curl -X POST 'https://dify-helm-watchdog.vercel.app/api/v1/cron?pause=60' \
  -H 'Authorization: Bearer your-cron-api-key'
```

---

## Environment variables (relevant to API behavior)

- `CRON_API_KEY`: Enables Bearer token protection for `/api/v1/cron`.
- `MAX_PAUSE_SECONDS`: Maximum accepted `pause` value (seconds). Default: `300`.
- `ENABLE_CACHE_WARMUP`: Set to `false` to disable post-sync cache warmup. Default: enabled.
- `NEXT_PUBLIC_SITE_URL`: Used for OpenAPI `servers[0].url` and cache warmup base URL.
- `VERCEL_URL`: Used as base URL on Vercel if present.


