/**
 * Workflow Logs API
 *
 * GET - Returns cached workflow logs
 * POST - Refreshes workflow logs from Dify API (rate limited to once per 5 minutes)
 */
import { createJsonResponse, createErrorResponse } from "@/lib/api/response";
import {
  loadWorkflowLogs,
  persistWorkflowLogs,
  fetchWorkflowLogsFromDify,
  isRateLimited,
  type WorkflowLogsPayload,
} from "@/lib/workflow-logs";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

/**
 * GET /api/v1/workflow-logs
 * Returns cached workflow logs data
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const cached = await loadWorkflowLogs();

    return createJsonResponse(
      cached ?? { updateTime: null, lastAttemptTime: null, data: [] },
      {
        request,
        headers: NO_STORE_HEADERS,
      },
    );
  } catch (error) {
    console.error("[workflow-logs] GET error:", error);
    return createErrorResponse({
      request,
      status: 500,
      message:
        error instanceof Error
          ? error.message
          : "Failed to load workflow logs",
      headers: NO_STORE_HEADERS,
    });
  }
}

/**
 * POST /api/v1/workflow-logs
 * Refreshes workflow logs from Dify API
 * Rate limited: only once per 5 minutes
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const cached = await loadWorkflowLogs();
    const now = new Date();

    // Check rate limit
    const { limited, retryAfterSeconds } = isRateLimited(
      cached?.lastAttemptTime ?? null,
    );

    if (limited) {
      return createErrorResponse({
        request,
        status: 429,
        message: `Rate limited. Please wait ${Math.ceil(retryAfterSeconds / 60)} minute(s) before refreshing.`,
        statusText: "RESOURCE_EXHAUSTED",
        headers: {
          ...NO_STORE_HEADERS,
          "Retry-After": String(retryAfterSeconds),
        },
      });
    }

    // Record attempt time BEFORE calling Dify API (rate limit even on failure)
    const attemptPayload: WorkflowLogsPayload = {
      updateTime: cached?.updateTime ?? null,
      lastAttemptTime: now.toISOString(),
      data: cached?.data ?? [],
    };
    await persistWorkflowLogs(attemptPayload);

    // Fetch fresh logs from Dify API
    const freshLogs = await fetchWorkflowLogsFromDify();

    // Save successful result
    const successPayload: WorkflowLogsPayload = {
      updateTime: now.toISOString(),
      lastAttemptTime: now.toISOString(),
      data: freshLogs,
    };
    await persistWorkflowLogs(successPayload);

    return createJsonResponse(successPayload, {
      request,
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    console.error("[workflow-logs] POST error:", error);
    return createErrorResponse({
      request,
      status: 500,
      message:
        error instanceof Error
          ? error.message
          : "Failed to refresh workflow logs",
      headers: NO_STORE_HEADERS,
    });
  }
}
