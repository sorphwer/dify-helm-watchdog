# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**dify-helm-watchdog** is a Next.js application that monitors the [Dify Helm chart](https://langgenius.github.io/dify-helm) by taking daily snapshots of chart versions. It provides a cyber-dark themed dashboard and RESTful API for accessing Helm chart metadata, values.yaml files, Docker image lists, and image validation results. All artifacts are cached in Vercel Blob storage.

## Development Commands

```bash
# Development server (uses Turbopack)
yarn dev

# Warm cache locally (optional but recommended before viewing UI)
curl -X POST http://localhost:3000/api/v1/cron
# or
yarn warm-cache

# Run tests
yarn test

# Linting
yarn lint

# Production build
yarn build

# Start production server
yarn start
```

## Environment Configuration

Required environment variables (copy from `.env.example`):

```bash
BLOB_READ_WRITE_TOKEN="vercel_blob_rw_..." # Vercel Blob storage token
CRON_API_KEY="..."                         # Optional: protects /api/v1/cron endpoint
```

Create `.env.local` for local development. The cron endpoint requires the blob token even in development.

## Architecture

### Data Flow

```
Vercel Cron (daily 2am UTC)
  ↓
POST /api/v1/cron
  ↓
syncHelmData() in lib/helm.ts
  ├─ Fetch Helm index.yaml
  ├─ Extract values.yaml for each version
  ├─ Extract docker-images.yaml
  └─ Validate Docker images exist in registries
  ↓
Store in Vercel Blob
  ├─ cache.json (version metadata, hashes)
  ├─ values/*.yaml
  ├─ images/*.yaml
  └─ validation/*.json
  ↓
Next.js UI + REST API + MCP Endpoints
```

### Core Modules

- **`src/lib/helm.ts`**: Core logic for syncing Helm data, extracting values/images, and cache management. The heart of the application (~34KB).
- **`src/lib/validation.ts`**: Docker image validation against registries (Docker Hub, GitHub Container Registry).
- **`src/lib/values-wizard.ts`**: Template-based merging of user overrides into new Helm chart versions with tag enforcement.
- **`src/lib/mcp/`**: Model Context Protocol (MCP) server implementation for AI model integration.
- **`src/lib/api/`**: Shared API utilities and error handling.
- **`src/lib/workflow-logs.ts`**: Structured logging for workflow operations.

### API Routes (`src/app/api/`)

All routes follow the Next.js App Router pattern with `route.ts` files.

**v1 API Structure:**
- `/api/v1/versions` - List all versions (with optional validation stats)
- `/api/v1/versions/latest` - Get latest version info
- `/api/v1/versions/{version}` - Version details
- `/api/v1/versions/{version}/images` - Image list (JSON/YAML format)
- `/api/v1/versions/{version}/values` - Download values.yaml
- `/api/v1/versions/{version}/validation` - Image validation report
- `/api/v1/cache` - Full cache inspection (legacy)
- `/api/v1/cron` - Trigger sync job (protected by bearer auth if `CRON_API_KEY` is set)

**MCP Endpoints:**
- `/api/v1/mcp` - MCP server info (GET) and JSON-RPC handler (POST)
- `/api/v1/sse` - Server-Sent Events transport for MCP

See `docs/API.md` for full API documentation.

### UI Components (`src/components/`)

- **`version-explorer.tsx`**: Main UI component (~38KB) with version rail and code panes
- **`image-validation-table.tsx`**: Table displaying Docker image validation results
- **`modals/`**: Dialog components for logs, diffs, and other overlays
- **`ui/`**: shadcn/ui components (button, dialog, etc.)

## Testing

**Framework:** Jest with Next.js integration
**Location:** `src/test/`
**Coverage:** 65 test cases across 10 test files

### Running Tests

```bash
yarn test
```

### Test Structure

Tests follow the `src/test/api/v1/` structure matching the API routes. Each test file mocks:
- `@/lib/helm` (loadCache, syncHelmData)
- `next/cache` (revalidatePath)
- Global `fetch` for blob storage requests

Key test patterns:
- All tests use `beforeEach`/`afterEach` for mock cleanup
- Request simulation: `new Request("http://localhost/api/...")`
- Response validation: check status, headers, and JSON payload structure
- Stream testing: decode response body chunks for cron endpoint

See `UT-spec-description.md` for comprehensive test documentation.

## API Design Rules

From `.cursor/rules/api-rule.mdc`:
- Follow [Google API Improvement Proposals (AIP)](https://google.aip.dev/general) for REST API design
- CRON API **must** have authentication (enforced via `CRON_API_KEY` and Bearer token)

## Caching Strategy

Different endpoints use different cache durations:

| Endpoint | Cache-Control | Rationale |
|----------|---------------|-----------|
| `/api/v1/versions` | `s-maxage=3600, stale-while-revalidate=86400` | Version list changes infrequently |
| `/api/v1/versions/latest` | `s-maxage=1800, stale-while-revalidate=3600` | Latest version changes more often |
| `/api/v1/versions/{version}/*` | `s-maxage=3600, stale-while-revalidate=86400` | Version-specific data is immutable |
| `/api/v1/cron` | `no-store` | Dynamic operation, never cache |

## Working with the Cron Job

The sync job (`POST /api/v1/cron`):

1. **Authentication**: Requires `Authorization: Bearer <CRON_API_KEY>` header unless request has `x-vercel-cron: true` (Vercel platform cron)
2. **Streaming response**: Returns `text/plain` with real-time log lines prefixed with `[sync]`
3. **Query parameters**:
   - `version` (repeatable or comma-separated): Force sync specific versions (e.g., `?version=2.5.0,2.4.0`)
   - `pause` (integer): Delay in seconds before starting (max 300)
4. **Post-sync actions**:
   - Calls `revalidatePath("/", "page")` to invalidate Next.js ISR cache
   - Optionally warms cache by fetching homepage if `ENABLE_CACHE_WARMUP` is enabled

## Image Validation

The validation pipeline (in `lib/validation.ts`):

1. Parse `docker-images.yaml` to extract image references
2. For each image:
   - Detect registry (Docker Hub, GHCR)
   - Query manifest API for all platforms (linux/amd64, linux/arm64, etc.)
   - Record found/missing status with digest
3. Store validation results as JSON in blob storage
4. Aggregate status: `ALL_FOUND`, `PARTIAL`, `MISSING`, `ERROR`

Status aggregation is used in:
- Version list endpoint with `?includeValidation=true`
- Validation report endpoint
- UI validation table

## Values Wizard

The `values-wizard.ts` module provides template-based upgrading:

**Purpose**: Merge user's custom overrides from old version into new version's template while enforcing new image tags.

**Key function**: `mergeImageOverridesIntoTemplate(overridesYaml, templateYaml, imageMap)`

**Logic**:
1. Parse both YAML documents
2. For each service path in template:
   - Use override's repository if present
   - Always enforce tag from imageMap
   - Fill missing services from template
3. Track changes (added, updated, unchanged, removed)
4. Return updated YAML + change report

Tested with real cache files (`.cache/helm/`) to ensure compatibility across versions.

## MCP (Model Context Protocol) Integration

The application exposes an MCP server allowing AI models to interact programmatically:

**Available tools**:
- `list_versions` - List all Helm chart versions
- `get_latest_version` - Get latest version info
- `get_version_details` - Get version metadata
- `list_images` - List container images for a version
- `validate_images` - Get validation report

**Available resources**:
- `helm://versions` - Version list
- `helm://versions/{version}` - Version details
- `helm://versions/{version}/values` - values.yaml content
- `helm://versions/{version}/images` - Image list
- `helm://versions/{version}/validation` - Validation report

**Available prompts**:
- `update_enterprise_to_version` - Guide for updating Dify Enterprise to specific version
- `analyze_missing_images` - Analyze missing images and provide remediation

**Transports**:
- Streamable HTTP: `POST /api/v1/mcp`
- SSE: `GET /api/v1/sse` + `POST /api/v1/sse?sessionId=...`

## Vercel Deployment

Deployment is configured via `vercel.json`:

```json
{
  "crons": [
    { "path": "/api/v1/cron", "schedule": "0 2 * * *" }
  ]
}
```

The cron runs daily at 2am UTC. Ensure `BLOB_READ_WRITE_TOKEN` is configured in Vercel project settings.

## Shell Scripts (Root Directory)

These are standalone Helm inspection tools (not used by the Next.js app):

- `list-dify-versions.sh` - List available Helm chart versions
- `get-dify-helm-images.sh [version] [format]` - Extract images from a chart version
- `get-dify-values.sh [version] [mode]` - Extract values.yaml from a chart version

These scripts are independent utilities for manual inspection and were likely used during initial development.

## Code Style

- TypeScript with strict mode
- ESLint via `eslint.config.mjs`
- Tailwind CSS v4 with custom animations (`tw-animate-css`)
- shadcn/ui components via `components.json`
- Next.js 15 with App Router (no Pages Router)
- React 19

## Common Development Patterns

### Adding a new API endpoint

1. Create route handler in `src/app/api/v1/[endpoint]/route.ts`
2. Export named functions: `GET`, `POST`, etc.
3. Use `loadCache()` from `@/lib/helm` for data access
4. Return `Response` objects with appropriate cache headers
5. Use error helpers from `@/lib/api` for consistent error structure
6. Add OpenAPI documentation comments (JSDoc style) for automatic schema generation
7. Add tests in `src/test/api/v1/[endpoint].test.ts`

### Cache invalidation

After updating blob storage, call:
```typescript
import { revalidatePath } from 'next/cache';
revalidatePath("/", "page"); // Invalidate homepage
```

### Reading inline vs. fetched content

Version metadata includes both inline content (for quick access) and blob URLs:

```typescript
const version = cache.versions.find(v => v.version === "1.0.0");
const content = version.values.inline || await fetch(version.values.url).then(r => r.text());
```

Inline content is preferred for performance; URLs are fallback.

## Troubleshooting

**Cache not populating**: Run the cron job manually with `curl -X POST http://localhost:3000/api/v1/cron` (or add `Authorization` header if `CRON_API_KEY` is set).

**Tests failing**: Ensure mocks are properly reset in `afterEach` hooks. Check that `@/lib/helm` and other modules are mocked correctly.

**Image validation errors**: Check that the validation logic in `lib/validation.ts` handles rate limiting and auth correctly for Docker Hub and GHCR.

**MCP integration issues**: Verify JSON-RPC 2.0 message format. Use `POST /api/v1/mcp` with `{"jsonrpc":"2.0","id":1,"method":"ping"}` to test connectivity.
