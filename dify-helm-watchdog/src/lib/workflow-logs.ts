/**
 * Workflow logs storage and processing utilities
 */
import { createStorageService } from "@/services/storage";
import { WORKFLOW_LOGS_PATH } from "@/constants/helm";

/**
 * Sanitized workflow log entry (email removed)
 */
export interface WorkflowLogEntry {
  id: string;
  workflow_run: {
    status: "succeeded" | "failed" | "stopped" | "running";
    triggered_from: string;
    elapsed_time: number;
    total_tokens?: number; // Optional for backwards compatibility with cached data
    total_steps: number;
    exceptions_count: number;
    created_at: number;
    finished_at: number | null;
  };
  created_by_account: {
    name: string;
    // email is intentionally omitted for privacy
  };
  created_at: number;
}

/**
 * Workflow logs payload stored in cache
 */
export interface WorkflowLogsPayload {
  updateTime: string | null; // Last successful refresh time (RFC3339)
  lastAttemptTime: string | null; // Last refresh attempt time (RFC3339, for rate limiting)
  data: WorkflowLogEntry[];
}

/**
 * Raw Dify API response structure
 */
interface DifyWorkflowLogsResponse {
  page: number;
  limit: number;
  total: number;
  has_more: boolean;
  data: Array<{
    id: string;
    workflow_run: {
      status: "succeeded" | "failed" | "stopped" | "running";
      triggered_from: string;
      elapsed_time: number;
      total_tokens: number;
      total_steps: number;
      created_at: number;
      finished_at: number | null;
      exceptions_count: number;
    };
    created_by_account: {
      name: string;
      email: string; // Will be stripped before storage
    };
    created_at: number;
  }>;
}

/**
 * Sanitize Dify API response by removing email and unnecessary fields
 */
export function sanitizeWorkflowLogs(
  rawData: DifyWorkflowLogsResponse["data"],
): WorkflowLogEntry[] {
  return rawData.map((entry) => ({
    id: entry.id,
    workflow_run: {
      status: entry.workflow_run.status,
      triggered_from: entry.workflow_run.triggered_from,
      elapsed_time: entry.workflow_run.elapsed_time,
      total_tokens: entry.workflow_run.total_tokens,
      total_steps: entry.workflow_run.total_steps,
      exceptions_count: entry.workflow_run.exceptions_count,
      created_at: entry.workflow_run.created_at,
      finished_at: entry.workflow_run.finished_at,
    },
    created_by_account: {
      name: entry.created_by_account.name,
      // email intentionally omitted
    },
    created_at: entry.created_at,
  }));
}

/**
 * Load cached workflow logs from storage
 */
export async function loadWorkflowLogs(): Promise<WorkflowLogsPayload | null> {
  const storage = createStorageService();

  try {
    const metadata = await storage.read(WORKFLOW_LOGS_PATH);
    if (!metadata) {
      return null;
    }

    // Use downloadUrl if available, fallback to url
    const contentUrl = metadata.downloadUrl ?? metadata.url;
    const content = await storage.readContent(contentUrl);
    return JSON.parse(content) as WorkflowLogsPayload;
  } catch (error) {
    console.error("[workflow-logs] Failed to load cached logs:", error);
    return null;
  }
}

/**
 * Persist workflow logs to storage
 */
export async function persistWorkflowLogs(
  payload: WorkflowLogsPayload,
): Promise<void> {
  const storage = createStorageService();
  const content = JSON.stringify(payload, null, 2);

  await storage.write(WORKFLOW_LOGS_PATH, content, "application/json");
}

/**
 * Fetch fresh workflow logs from Dify API
 */
export async function fetchWorkflowLogsFromDify(): Promise<WorkflowLogEntry[]> {
  const apiKey = process.env.DIFY_API_KEY;
  if (!apiKey) {
    throw new Error("DIFY_API_KEY environment variable is not configured");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

  try {
    const response = await fetch(
      "https://api.dify.ai/v1/workflows/logs?limit=10",
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      throw new Error(
        `Dify API returned ${response.status}: ${response.statusText}`,
      );
    }

    const rawData = (await response.json()) as DifyWorkflowLogsResponse;
    return sanitizeWorkflowLogs(rawData.data);
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Rate limit duration in milliseconds (5 minutes)
 */
export const RATE_LIMIT_MS = 5 * 60 * 1000;

/**
 * Check if refresh is rate limited
 */
export function isRateLimited(lastAttemptTime: string | null): {
  limited: boolean;
  retryAfterSeconds: number;
} {
  if (!lastAttemptTime) {
    return { limited: false, retryAfterSeconds: 0 };
  }

  const lastAttempt = new Date(lastAttemptTime);
  const now = new Date();
  const elapsed = now.getTime() - lastAttempt.getTime();

  if (elapsed < RATE_LIMIT_MS) {
    const retryAfterSeconds = Math.ceil((RATE_LIMIT_MS - elapsed) / 1000);
    return { limited: true, retryAfterSeconds };
  }

  return { limited: false, retryAfterSeconds: 0 };
}
