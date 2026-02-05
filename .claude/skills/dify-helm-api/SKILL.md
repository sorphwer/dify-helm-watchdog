---
name: dify-helm-api
description: Use this skill when the user asks about dify-helm-watchdog REST API endpoints, how to call the API, authentication, caching, version management, image listing, or validation reports. Helps construct API requests, explains response formats, and troubleshoots API issues.
---

# Dify Helm Watchdog API Skill

This skill provides comprehensive knowledge about the **dify-helm-watchdog** REST API.

## When to Use This Skill

Activate this skill when the user:
- Asks about available API endpoints
- Needs help calling the dify-helm-watchdog API
- Wants to list chart versions or get version details
- Needs to retrieve image information or validation reports
- Asks about authentication or caching behavior
- Wants to trigger the cron job or check cache status
- Needs to download values.yaml files

## Base Information

**Base URL**: `https://dify-helm-watchdog.vercel.app`
**API Base Path**: `/api/v1`
**OpenAPI Spec**: `https://dify-helm-watchdog.vercel.app/openapi.json`
**Swagger UI**: `https://dify-helm-watchdog.vercel.app/swagger`

## Authentication

- **Public endpoints**: No authentication required
- **Cron endpoint** (`POST /api/v1/cron`):
  - Requires `Authorization: Bearer <token>` if `CRON_API_KEY` is set
  - Requests with `x-vercel-cron: true` may bypass auth

## Available Endpoints

### 1. List Chart Versions

```http
GET /api/v1/versions
```

**Query Parameters:**
- `includeValidation` (boolean, default: `false`): Include aggregated image validation stats
- `include_validation` (boolean): Deprecated alias of `includeValidation`

**Example:**
```bash
curl 'https://dify-helm-watchdog.vercel.app/api/v1/versions?includeValidation=true'
```

**Caching:** `Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400`

---

### 2. Get Latest Cached Version

```http
GET /api/v1/versions/latest
```

**Query Parameters:**
- `versionOnly` (boolean, default: `false`): When `true`, returns only the version string as plain text

**Examples:**
```bash
# JSON response
curl 'https://dify-helm-watchdog.vercel.app/api/v1/versions/latest'

# Plain text response
curl 'https://dify-helm-watchdog.vercel.app/api/v1/versions/latest?versionOnly=true'
```

**Caching:** `Cache-Control: public, s-maxage=1800, stale-while-revalidate=3600`

---

### 3. Get Version Details

```http
GET /api/v1/versions/{version}
```

**Path Parameters:**
- `version` (string): Must match a cached version (e.g., `1.0.0`)

**Example:**
```bash
curl 'https://dify-helm-watchdog.vercel.app/api/v1/versions/1.0.0'
```

**Caching:** `Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400`

---

### 4. List Images for a Version

```http
GET /api/v1/versions/{version}/images
```

**Query Parameters:**
- `format` (string, default: `json`): Either `json` or `yaml`
- `includeValidation` (boolean, default: `false`): Enrich images with validation status/variants

**Examples:**
```bash
# JSON (default)
curl 'https://dify-helm-watchdog.vercel.app/api/v1/versions/1.0.0/images'

# YAML
curl 'https://dify-helm-watchdog.vercel.app/api/v1/versions/1.0.0/images?format=yaml'

# JSON with validation
curl 'https://dify-helm-watchdog.vercel.app/api/v1/versions/1.0.0/images?includeValidation=true'
```

**Caching:** `Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400`

---

### 5. Download values.yaml

```http
GET /api/v1/versions/{version}/values
```

**Response:**
- Content-Type: `application/x-yaml; charset=utf-8`
- Content-Disposition: `inline; filename="values-{version}.yaml"`

**Example:**
```bash
curl 'https://dify-helm-watchdog.vercel.app/api/v1/versions/1.0.0/values' -o values-1.0.0.yaml
```

**Caching:** `Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400`

---

### 6. Get Validation Report

```http
GET /api/v1/versions/{version}/validation
```

**Query Parameters:**
- `isMissing` (boolean, default: `false`): When `true`, returns only images with `MISSING` status

**Examples:**
```bash
# Full report
curl 'https://dify-helm-watchdog.vercel.app/api/v1/versions/1.0.0/validation'

# Only missing images
curl 'https://dify-helm-watchdog.vercel.app/api/v1/versions/1.0.0/validation?isMissing=true'
```

**Caching:** `Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400`

---

### 7. Inspect Cache Payload

```http
GET /api/v1/cache
```

Returns the current cache state. When not initialized:
```json
{"updateTime": null, "versions": []}
```

**Example:**
```bash
curl 'https://dify-helm-watchdog.vercel.app/api/v1/cache'
```

---

### 8. Trigger Helm Cache Synchronization (Cron)

```http
POST /api/v1/cron
```

**Authentication:**
- Requires `Authorization: Bearer <token>` if `CRON_API_KEY` is set
- Requests with `x-vercel-cron: true` may bypass auth

**Query Parameters:**
- `version` (string[]): Optional. Sync specific versions (can repeat or use comma-separated list)
- `pause` (integer): Optional. Seconds to wait before starting (max: `MAX_PAUSE_SECONDS`, default 300)

**Response:**
- Content-Type: `text/plain; charset=utf-8`
- Streaming logs, one line per message
- Cache-Control: `no-store`

**Examples:**
```bash
# Sync all versions
curl -X POST 'https://dify-helm-watchdog.vercel.app/api/v1/cron' \
  -H 'Authorization: Bearer your-cron-api-key'

# Sync specific versions
curl -X POST 'https://dify-helm-watchdog.vercel.app/api/v1/cron?version=1.0.0,1.0.1' \
  -H 'Authorization: Bearer your-cron-api-key'

# Pause before starting
curl -X POST 'https://dify-helm-watchdog.vercel.app/api/v1/cron?pause=60' \
  -H 'Authorization: Bearer your-cron-api-key'
```

---

## Error Format

Standard error response:

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

**Common Error Reasons:**
- `CACHE_NOT_INITIALIZED`
- `NO_VERSIONS_AVAILABLE`
- `VERSION_NOT_FOUND`
- `VALIDATION_NOT_AVAILABLE`

---

## Caching & Conditional Requests

- Endpoints set CDN caching headers (`Cache-Control: public, s-maxage=...`)
- JSON/text responses include `ETag` headers
- Clients can send `If-None-Match` to receive **304 Not Modified** responses

---

## Environment Variables

- `CRON_API_KEY`: Enables Bearer token protection for `/api/v1/cron`
- `MAX_PAUSE_SECONDS`: Maximum pause value (default: 300)
- `ENABLE_CACHE_WARMUP`: Disable with `false` (default: enabled)
- `NEXT_PUBLIC_SITE_URL`: Used for OpenAPI servers and cache warmup
- `VERCEL_URL`: Used as base URL on Vercel

---

## How to Help Users

When users ask about the API:

1. **Identify the endpoint** they need based on their goal
2. **Provide the exact curl command** with all required parameters
3. **Explain query parameters** and their effects
4. **Show response format** examples when helpful
5. **Mention caching behavior** if relevant
6. **Handle authentication** - remind about Bearer token if using cron endpoint
7. **Troubleshoot errors** using the error format reference

## Examples of User Requests

**"How do I get the latest version?"**
→ Use `GET /api/v1/versions/latest` or with `?versionOnly=true` for plain text

**"Show me all images for version 1.0.0"**
→ Use `GET /api/v1/versions/1.0.0/images`

**"Which images are missing in the validation?"**
→ Use `GET /api/v1/versions/{version}/validation?isMissing=true`

**"How do I trigger a sync?"**
→ Use `POST /api/v1/cron` with proper authentication

**"Download values.yaml for a specific version"**
→ Use `GET /api/v1/versions/{version}/values`
