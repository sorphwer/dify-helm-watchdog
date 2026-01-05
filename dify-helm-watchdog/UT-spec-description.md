# Unit Test Specification Document

## Project Overview
**Project Name:** dify-helm-watchdog
**Version:** 0.1.0
**Testing Framework:** Jest
**Test Environment:** Node.js
**Total Test Files:** 10
**Total Test Cases:** 65

## Test Suite Summary

This document describes the comprehensive unit test coverage for the dify-helm-watchdog application, a Next.js-based API service that monitors and manages Dify Helm chart versions, images, and configurations.

### Test Coverage Statistics

| Module | Test File | Test Cases | Coverage Areas |
|--------|-----------|------------|----------------|
| API v1 Versions | `versions.test.ts` | 3 | Version listing, validation aggregation |
| API v1 Cache | `cache.test.ts` | 6 | Cache retrieval, inline content handling |
| API v1 Cron | `cron.test.ts` | 16 | Sync operations, authentication, streaming |
| API v1 Latest Version | `latest.test.ts` | 6 | Latest version retrieval, error handling |
| API v1 Version Details | `[version]/route.test.ts` | 6 | Version details, asset URLs |
| API v1 Version Images | `[version]/images.test.ts` | 9 | Image listing, YAML format, validation |
| API v1 Version Values | `[version]/values.test.ts` | 7 | Values.yaml retrieval, content formats |
| API v1 Version Validation | `[version]/validation.test.ts` | 7 | Image validation data, status checks |
| OpenAPI Spec | `openapi.test.ts` | 1 | OpenAPI JSON generation, schema validation |
| Values Wizard | `values-wizard.test.ts` | 4 | Template merge, repository overrides, normalization |
| **Total** | **10 files** | **65** | **Comprehensive API coverage** |

---

## Detailed Test Specifications

### 1. API v1 Versions (`src/test/api/v1/versions.test.ts`)

**Route:** `GET /api/v1/versions`

**Purpose:** Tests the API endpoint that returns a list of all available Helm chart versions.

#### Test Cases:

1. **Empty Cache Handling**
   - **Scenario:** Cache is null/empty
   - **Expected:** Returns 200 with empty versions array
   - **Validates:** Proper cache headers, null updateTime, total count of 0

2. **Version Summary Listing**
   - **Scenario:** Cache contains version data
   - **Expected:** Returns version summary without validation data by default
   - **Validates:** Version metadata (version, appVersion, createTime, digest), excludes inline content

3. **Image Validation Aggregation**
   - **Scenario:** Request with `includeValidation=true` query parameter
   - **Expected:** Returns aggregated validation statistics for each version
   - **Validates:** Counts by status (ALL_FOUND, PARTIAL, MISSING, ERROR), uses inline data without fetching

**Key Mocking:**
- `loadCache()` from `@/lib/helm`
- Mock data includes version metadata, values, images, and validation information

---

### 2. API v1 Cache (`src/test/api/v1/cache.test.ts`)

**Route:** `GET /api/v1/cache`

**Purpose:** Tests the full cache retrieval endpoint that returns complete cached data including inline content.

#### Test Cases:

1. **Null Cache Response**
   - **Scenario:** Cache is not initialized
   - **Expected:** Returns empty cache with null updateTime
   - **Validates:** Proper structure with empty versions array

2. **Full Cache Retrieval**
   - **Scenario:** Cache contains multiple versions with full data
   - **Expected:** Returns complete cache including all inline content
   - **Validates:** All fields (updateTime, versions array, nested objects)

3. **Inline Content Inclusion**
   - **Scenario:** Versions have inline values, images, and validation data
   - **Expected:** All inline content is returned in response
   - **Validates:** Inline YAML/JSON content preservation

4. **Missing Validation Handling**
   - **Scenario:** Version without imageValidation field
   - **Expected:** Returns version data without validation field
   - **Validates:** Optional field handling

5. **Null Optional Fields**
   - **Scenario:** Version with null appVersion, createTime, undefined digest
   - **Expected:** Returns data with null/undefined fields preserved
   - **Validates:** Proper handling of optional/nullable fields

6. **Empty Versions Array**
   - **Scenario:** Cache exists but contains no versions
   - **Expected:** Returns cache with empty versions array
   - **Validates:** Edge case handling

---

### 3. API v1 Cron (`src/test/api/v1/cron.test.ts`)

**Route:** `POST /api/v1/cron`

**Purpose:** Tests the cron job endpoint that synchronizes Helm chart data from remote repositories.

#### Test Cases:

**Authentication:**
1. **Vercel Cron Header Authentication**
   - **Scenario:** Request with `x-vercel-cron` header
   - **Expected:** Bypasses API key authentication
   - **Validates:** Successful execution even when `CRON_API_KEY` is configured

2. **Missing Authorization Header Error**
   - **Scenario:** `CRON_API_KEY` configured but missing/invalid `Authorization` header
   - **Expected:** Returns 401 Unauthorized
   - **Validates:** Bearer auth enforcement, `WWW-Authenticate` header

3. **Invalid Bearer Token Error**
   - **Scenario:** `Authorization: Bearer <token>` present but token is incorrect
   - **Expected:** Returns 401 Unauthorized
   - **Validates:** Token validation, `WWW-Authenticate` header

4. **Valid Bearer Token Success**
   - **Scenario:** Correct `Authorization: Bearer <token>` provided
   - **Expected:** Allows sync operation
   - **Validates:** Authentication success

**Sync Operations:**
5. **Progress Log Streaming**
   - **Scenario:** Sync operation with log callback
   - **Expected:** Streams progress logs in real-time
   - **Validates:** Text streaming, log formatting with [sync] prefix

6. **Force Versions Parameter**
   - **Scenario:** Query parameter `version=2.5.0&version=v2.4.0,2.3.0`
   - **Expected:** Parses and passes version array to syncHelmData
   - **Validates:** Version normalization (v prefix removal), comma/array parsing

7. **Version Deduplication**
   - **Scenario:** Duplicate versions in query parameters
   - **Expected:** Deduplicates before processing
   - **Validates:** Set-based deduplication

8. **Version Normalization**
   - **Scenario:** Versions with 'V' or 'v' prefix
   - **Expected:** Removes prefix for consistency
   - **Validates:** Case-insensitive normalization

**Result Reporting:**
9. **New Versions Detection**
   - **Scenario:** Sync returns new version entries
   - **Expected:** Reports processed/created counts and new version list
   - **Validates:** Result formatting, `v` prefix in output

10. **No New Versions**
    - **Scenario:** All versions already cached (skipped=total)
    - **Expected:** Reports no new versions detected
    - **Validates:** Skip detection and reporting

**Error Handling:**
11. **MissingBlobTokenError**
    - **Scenario:** Blob storage token not configured
    - **Expected:** Returns friendly error message, status=failed
    - **Validates:** Custom error handling

12. **Generic Error Handling**
    - **Scenario:** Network or other errors
    - **Expected:** Returns error message, status=failed
    - **Validates:** Error message extraction

13. **Unknown Error Type**
    - **Scenario:** Non-Error object rejection
    - **Expected:** Returns generic error message
    - **Validates:** Fallback error handling

**Cache Management:**
14. **ISR Revalidation Trigger**
    - **Scenario:** Successful sync completion
    - **Expected:** Calls `revalidatePath("/", "page")`
    - **Validates:** Cache invalidation for homepage

15. **Cache Warmup Disabled**
    - **Scenario:** ENABLE_CACHE_WARMUP=false
    - **Expected:** Skips warmup, logs disabled message
    - **Validates:** Feature flag respect

16. **Cache Warmup Success**
    - **Scenario:** ENABLE_CACHE_WARMUP enabled with NEXT_PUBLIC_SITE_URL
    - **Expected:** Fetches homepage with warmup parameter
    - **Validates:** URL construction, User-Agent header, status reporting

17. **Cache Warmup Failure**
    - **Scenario:** Warmup fetch returns non-200 status
    - **Expected:** Logs warning but continues
    - **Validates:** Graceful degradation

**Response Format:**
- Content-Type: `text/plain; charset=utf-8`
- Cache-Control: `no-store`
- Streaming response with formatted log lines

---

### 4. API v1 Latest Version (`src/test/api/v1/versions/latest.test.ts`)

**Route:** `GET /api/v1/versions/latest`

**Purpose:** Tests the endpoint that returns the most recent Helm chart version.

#### Test Cases:

1. **Null Cache Error**
   - **Scenario:** Cache not initialized
   - **Expected:** 404 with NO_VERSIONS_AVAILABLE reason
   - **Validates:** Error structure with details array

2. **Empty Versions Error**
   - **Scenario:** Cache exists but no versions
   - **Expected:** 404 error response
   - **Validates:** Edge case handling

3. **Latest Version Retrieval**
   - **Scenario:** Cache with multiple versions
   - **Expected:** Returns first version (most recent) with API URLs
   - **Validates:** Version metadata, relative URL generation for related endpoints

4. **Missing Validation URL**
   - **Scenario:** Latest version lacks imageValidation
   - **Expected:** URLs object excludes validation field
   - **Validates:** Optional URL handling

5. **Null Fields Handling**
   - **Scenario:** appVersion, createTime null, digest undefined
   - **Expected:** Returns with null/undefined values preserved
   - **Validates:** Nullable field handling

6. **Cache Load Error**
   - **Scenario:** loadCache throws exception
   - **Expected:** Returns 500 with error message
   - **Validates:** Exception propagation

**Cache Headers:**
- Cache-Control: `public, s-maxage=1800, stale-while-revalidate=3600`

---

### 5. API v1 Version Details (`src/test/api/v1/versions/[version]/route.test.ts`)

**Route:** `GET /api/v1/versions/{version}`

**Purpose:** Tests the endpoint that returns detailed information about a specific version.

#### Test Cases:

1. **Cache Not Available**
   - **Scenario:** loadCache returns null
   - **Expected:** 404 with CACHE_NOT_INITIALIZED reason
   - **Validates:** Error details structure

2. **Version Not Found**
   - **Scenario:** Requested version doesn't exist in cache
   - **Expected:** 404 with VERSION_NOT_FOUND reason and available versions list
   - **Validates:** Helper information for clients

3. **Complete Version Details**
   - **Scenario:** Version exists with all fields
   - **Expected:** Returns full version object with assets and URLs
   - **Validates:**
     - Basic metadata (version, appVersion, createTime, chartUrl, digest)
     - Assets object (values, images, validation with path/url/hash)
     - URLs object (relative paths to related endpoints)

4. **Missing Validation Asset**
   - **Scenario:** Version without imageValidation
   - **Expected:** Assets and URLs exclude validation
   - **Validates:** Conditional field inclusion

5. **Null/Undefined Fields**
   - **Scenario:** appVersion null, createTime null, digest undefined
   - **Expected:** Returns with proper null/undefined handling
   - **Validates:** Type safety

6. **Load Cache Exception**
   - **Scenario:** loadCache throws error
   - **Expected:** 500 with error message
   - **Validates:** Error handling

**Cache Headers:**
- Cache-Control: `public, s-maxage=3600, stale-while-revalidate=86400`

---

### 6. API v1 Version Images (`src/test/api/v1/versions/[version]/images.test.ts`)

**Route:** `GET /api/v1/versions/{version}/images`

**Purpose:** Tests the endpoint that returns container image information for a specific version.

#### Test Cases:

**Error Cases:**
1. **Cache Not Available**
   - **Expected:** 404 with CACHE_NOT_INITIALIZED

2. **Version Not Found**
   - **Expected:** 404 with VERSION_NOT_FOUND and available versions

**JSON Format (default):**
3. **Images List Without Validation**
   - **Scenario:** Default request (no includeValidation)
   - **Expected:** JSON with image array (path, repository, tag)
   - **Validates:** Total count, image parsing from YAML, no validation field

4. **Images With Validation**
   - **Scenario:** `?includeValidation=true`
   - **Expected:** Images with validation object (status, variants)
   - **Validates:** Validation data merging, platform-specific details

5. **Deprecated Parameter Ignored**
   - **Scenario:** `?include_validation=true` (snake_case)
   - **Expected:** Ignored (does not enable validation)
   - **Validates:** Current behavior does not treat deprecated parameter as an alias

**YAML Format:**
6. **YAML Response**
   - **Scenario:** `?format=yaml`
   - **Expected:** Content-Type: application/x-yaml, raw YAML content
   - **Validates:** Format conversion, content preservation

**Data Fetching:**
7. **Fetch From URL**
   - **Scenario:** Inline content not available
   - **Expected:** Fetches from blob URL
   - **Validates:** HTTP fetch call, URL usage

8. **Fetch Failure**
   - **Scenario:** Fetch returns non-OK status
   - **Expected:** 500 error
   - **Validates:** Network error handling

9. **Missing Validation Graceful Handling**
   - **Scenario:** includeValidation=true but no validation data
   - **Expected:** Returns images without validation field
   - **Validates:** Graceful degradation

**Response Structure (JSON):**
```json
{
  "version": "2.5.0",
  "appVersion": "0.10.0",
  "total": 3,
  "images": [
    {
      "path": "api",
      "repository": "langgenius/dify-api",
      "tag": "0.10.0",
      "targetImageName": "langgenius/dify-api:0.10.0",  // when validation included
      "validation": {                                     // when includeValidation=true
        "status": "ALL_FOUND",
        "variants": [
          {"platform": "linux/amd64", "digest": "sha256:...", "found": true}
        ]
      }
    }
  ]
}
```

---

### 7. API v1 Version Values (`src/test/api/v1/versions/[version]/values.test.ts`)

**Route:** `GET /api/v1/versions/{version}/values`

**Purpose:** Tests the endpoint that returns the Helm chart values.yaml configuration.

#### Test Cases:

**Error Cases:**
1. **Cache Not Available**
   - **Expected:** 404 with CACHE_NOT_INITIALIZED

2. **Version Not Found**
   - **Expected:** 404 with VERSION_NOT_FOUND and available versions

**Content Retrieval:**
3. **Inline Content Response**
   - **Scenario:** values.inline is available in cache
   - **Expected:** Returns YAML content without fetching
   - **Validates:**
     - Content-Type: application/x-yaml
     - Content-Disposition: inline; filename="values-{version}.yaml"
     - Fetch not called

4. **Fetch From URL**
   - **Scenario:** Inline not available
   - **Expected:** Fetches from blob URL
   - **Validates:** HTTP fetch with correct URL

5. **Fetch Failure**
   - **Scenario:** Fetch returns non-OK status
   - **Expected:** 500 error
   - **Validates:** Error handling

6. **Empty Content**
   - **Scenario:** values.yaml is empty
   - **Expected:** Returns empty string successfully
   - **Validates:** Edge case handling

7. **Load Cache Exception**
   - **Expected:** 500 with error message

**Response Headers:**
- Cache-Control: `public, s-maxage=3600, stale-while-revalidate=86400`
- Content-Type: `application/x-yaml; charset=utf-8`
- Content-Disposition: `inline; filename="values-{version}.yaml"`

---

### 8. API v1 Version Validation (`src/test/api/v1/versions/[version]/validation.test.ts`)

**Route:** `GET /api/v1/versions/{version}/validation`

**Purpose:** Tests the endpoint that returns Docker image validation results for a version.

#### Test Cases:

**Error Cases:**
1. **Cache Not Available**
   - **Expected:** 404 with CACHE_NOT_INITIALIZED

2. **Version Not Found**
   - **Expected:** 404 with VERSION_NOT_FOUND

3. **Validation Not Available**
   - **Scenario:** Version exists but no imageValidation
   - **Expected:** 404 with VALIDATION_NOT_AVAILABLE reason
   - **Validates:** Specific error for missing validation

**Data Retrieval:**
4. **Inline Validation Data**
   - **Scenario:** imageValidation.inline is available
   - **Expected:** Returns validation JSON without fetching
   - **Validates:** Data normalization, fetch not called

5. **Fetch From URL**
   - **Scenario:** Inline not available
   - **Expected:** Fetches from blob URL, normalizes data
   - **Validates:** HTTP fetch, JSON parsing

6. **Fetch Failure**
   - **Scenario:** Fetch returns non-OK status
   - **Expected:** 500 error
   - **Validates:** Network error handling

7. **Load Cache Exception**
   - **Expected:** 500 with error message

**Response Structure:**
```json
{
  "images": [
    {
      "sourceRepository": "langgenius/dify-api",
      "sourceTag": "0.10.0",
      "targetImageName": "langgenius/dify-api:0.10.0",
      "status": "ALL_FOUND",
      "variants": [
        {
          "platform": "linux/amd64",
          "digest": "sha256:abc123",
          "found": true
        }
      ]
    }
  ]
}
```

**Mocking:**
- Uses custom mocks for `normalizeValidationPayload`, `normalizeValidationRecord`, and `countValidationStatuses`

---

### 9. Values Wizard (`src/test/values-wizard.test.ts`)

**Purpose:** Tests the utility functions for merging user overrides into a new template values.yaml and enforcing image tags.

#### Test Cases:

1. **Template-based Tag Merge**
   - **Scenario:** Merge v3.5.5 overrides into v3.6.2 template and enforce v3.6.2 image tags
   - **Expected:**
     - Returns change list with changes.length > 0
     - No missing status in changes
     - Updated YAML contains expected keys
   - **Validates:**
     - Template-first merge behavior (missing services in overrides are still present)
     - Tag replacement logic (always enforce the new tag)
     - Change tracking
     - YAML structure preservation
   - **Data Source:** Uses real cache files from `.cache/helm/`

2. **Missing Service Fill**
   - **Scenario:** Overrides YAML does not include a service, template does
   - **Expected:** Output contains the service and enforced tag from image map
   - **Validates:** Missing service/path handling when starting from template

3. **Repository Override Preservation**
   - **Scenario:** Overrides YAML sets repository but omits tag
   - **Expected:** Output keeps the override repository and enforces the new tag
   - **Validates:** Repository override precedence + tag enforcement

4. **YAML Normalization**
   - **Scenario:** Input with tabs and CRLF line endings
   - **Expected:**
     - Tabs converted to spaces
     - Line endings normalized to LF
   - **Validates:**
     - Indentation normalization
     - Cross-platform compatibility

**Functions Tested:**
- `mergeImageOverridesIntoTemplate(overridesYaml, templateYaml, imageMap)`: Merges overrides into template and enforces tags
- `normalizeYamlInput(rawYaml)`: Normalizes YAML formatting

---

## Test Configuration

### Jest Configuration (`jest.config.js`)

```javascript
{
  testEnvironment: "node",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1"
  },
  dir: "./"
}
```

### Test Execution

**Command:** `npm run test` or `yarn test`

**Script:** `jest`

**Features:**
- Automatic module path resolution with `@/` alias
- Node environment for API testing
- Mock-friendly setup for Next.js routes

---

## Mocking Strategy

### External Dependencies Mocked

1. **`@/lib/helm`**
   - `loadCache()`: Returns mock cache data
   - `syncHelmData()`: Simulates sync operations
   - `MissingBlobTokenError`: Custom error class

2. **`next/cache`**
   - `revalidatePath()`: Tracks ISR revalidation calls

3. **`@/lib/validation`**
   - `normalizeValidationPayload()`: Data normalization
   - `normalizeValidationRecord()`: Record normalization
   - `countValidationStatuses()`: Status aggregation

4. **Global `fetch`**
   - Mocked for testing HTTP requests without network calls
   - Allows control over success/failure scenarios

### Mock Data Patterns

**Typical Version Mock:**
```typescript
{
  version: "2.5.0",
  appVersion: "0.10.0",
  createTime: "2024-01-01T00:00:00.000Z",
  chartUrl: "https://example.com/chart-2.5.0.tgz",
  digest: "sha256:abc123",
  values: {
    path: "values/2.5.0.yaml",
    url: "https://example.com/values-2.5.0.yaml",
    hash: "values-hash-1",
    inline: "global:\n  image:\n    tag: 0.10.0"
  },
  images: {
    path: "images/2.5.0.yaml",
    url: "https://example.com/images-2.5.0.yaml",
    hash: "images-hash-1",
    inline: "api:\n  repository: langgenius/dify-api\n  tag: 0.10.0"
  },
  imageValidation: {
    path: "validation/2.5.0.json",
    url: "https://example.com/validation-2.5.0.json",
    hash: "validation-hash-1",
    inline: '{"images":[...]}'
  }
}
```

---

## Test Patterns and Best Practices

### 1. Consistent Test Structure
- Each test file follows AAA pattern: Arrange, Act, Assert
- `beforeEach` / `afterEach` for clean state management
- Descriptive test names in natural language

### 2. Mock Lifecycle Management
```typescript
afterEach(() => {
  jest.restoreAllMocks();
  jest.resetAllMocks();
});
```

### 3. Request Simulation
```typescript
const request = new Request("http://localhost/api/v1/versions");
const params = Promise.resolve({ version: "2.5.0" });
const response = await GET(request, { params });
```

### 4. Response Validation
```typescript
expect(response.status).toBe(200);
expect(response.headers.get("Cache-Control")).toBe("...");
const payload = await response.json();
expect(payload).toMatchObject({...});
```

### 5. Stream Testing
```typescript
const streamToText = async (response: Response): Promise<string> => {
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let result = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value, { stream: true });
  }
  return result;
};
```

### 6. Type Safety
- All payloads typed with TypeScript interfaces
- Proper null/undefined handling in assertions
- Optional field validation

---

## Error Handling Coverage

### HTTP Status Codes Tested

| Status | Scenario | Test Count |
|--------|----------|------------|
| 200 | Success responses | 35+ |
| 401 | Authentication failures | 2 |
| 404 | Resource not found | 15+ |
| 500 | Server errors | 8+ |

### Error Response Structure

**Standard Format:**
```json
{
  "error": {
    "message": "Human-readable error message",
    "details": [
      {
        "reason": "ERROR_CODE",
        "availableVersions": ["2.5.0", "2.4.0"]  // context-specific
      }
    ]
  }
}
```

**Error Codes Tested:**
- `NO_VERSIONS_AVAILABLE`
- `CACHE_NOT_INITIALIZED`
- `VERSION_NOT_FOUND`
- `VALIDATION_NOT_AVAILABLE`

---

## Cache Control Strategy

Different endpoints use different caching strategies based on data volatility:

| Endpoint | Cache-Control | Rationale |
|----------|---------------|-----------|
| `/api/v1/versions` | `public, s-maxage=3600, stale-while-revalidate=86400` | Version list changes infrequently |
| `/api/v1/versions/latest` | `public, s-maxage=1800, stale-while-revalidate=3600` | Latest version changes more often |
| `/api/v1/versions/{version}/*` | `public, s-maxage=3600, stale-while-revalidate=86400` | Version-specific data is immutable |
| `/api/v1/cron` | `no-store` | Dynamic operation, never cache |

---

## Test Data Management

### Real Data Integration
- `values-wizard.test.ts` uses actual cache files from `.cache/helm/`
- Tests realistic scenarios with production-like data
- Validates real version compatibility and template merge (3.5.5 overrides → 3.6.2 template)

### Synthetic Data
- Most tests use controlled mock data
- Predictable, repeatable test scenarios
- Edge cases (null, undefined, empty) easily tested

---

## CI/CD Readiness

### Pre-commit Testing
All tests run quickly (< 5 seconds typical) suitable for:
- Pre-commit hooks
- PR validation
- CI pipeline integration

### Test Output
- Clear pass/fail indicators
- Error console logging for debugging
- Coverage reporting ready (can add `--coverage` flag)

---

## Maintenance and Extension Guidelines

### Adding New Tests

1. **Create test file** in `src/test/` matching route structure
2. **Import route handler** and dependencies to mock
3. **Mock external dependencies** (helm, fetch, etc.)
4. **Write test cases** covering:
   - Success paths
   - Error conditions
   - Edge cases (null, empty, missing)
   - Response headers
   - Response structure

### Testing Checklist for New Endpoints

- [ ] Cache not available (404)
- [ ] Resource not found (404)
- [ ] Successful retrieval (200)
- [ ] Response headers (Cache-Control, Content-Type)
- [ ] Response structure validation
- [ ] Error handling (500)
- [ ] Query parameter handling
- [ ] Null/undefined field handling
- [ ] Inline vs. fetched content paths

---

## Known Limitations and Future Improvements

### Current Limitations
1. **No Integration Tests:** Tests are purely unit tests with mocked dependencies
2. **Limited E2E Coverage:** No tests for full request lifecycle
3. **No Performance Tests:** Response time and load testing not included
4. **Mock Data Drift:** Mock data may diverge from actual production data structure

### Suggested Improvements
1. **Integration Tests:** Add tests with real cache files and blob storage
2. **Snapshot Testing:** Use Jest snapshots for complex response structures
3. **Coverage Reporting:** Enable and enforce minimum coverage thresholds
4. **Property-Based Testing:** Use libraries like `fast-check` for edge case discovery
5. **API Contract Testing:** Ensure API responses match OpenAPI/Swagger specs
6. **Load Testing:** Add performance benchmarks for cron sync operations

---

## Appendix: Test Execution Output

```
PASS src/test/api/v1/versions.test.ts
PASS src/test/api/v1/versions/[version]/values.test.ts
PASS src/test/api/v1/versions/latest.test.ts
PASS src/test/api/v1/versions/[version]/route.test.ts
PASS src/test/api/v1/versions/[version]/images.test.ts
PASS src/test/api/v1/cache.test.ts
PASS src/test/api/v1/cron.test.ts
PASS src/test/values-wizard.test.ts
PASS src/test/api/v1/versions/[version]/validation.test.ts

Test Suites: 9 passed, 9 total
Tests:       62 passed, 62 total
Snapshots:   0 total
Time:        ~0.3s
```

---

**Document Version:** 1.0
**Last Updated:** 2026-01-05
**Maintained By:** Development Team
**Test Framework Version:** Jest 29.7.0
