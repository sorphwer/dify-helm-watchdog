/**
 * MCP Message Handler
 * Processes JSON-RPC 2.0 messages according to MCP protocol
 */

import { after } from "next/server";

import { TOOLS, executeTool } from "./tools";
import { listPrompts, getPrompt } from "./prompts";
import { trackEvent } from "@/lib/analytics/track";
import {
  JSON_RPC_ERRORS,
  MCP_LEGACY_PROTOCOL_VERSION,
  MCP_LEGACY_PROTOCOL_VERSIONS,
  MCP_LIST_CACHE_TTL_MS,
  MCP_SERVER_NAME,
  MCP_SERVER_VERSION,
  MCP_SUPPORTED_PROTOCOL_VERSIONS,
  type JsonRpcRequest,
  type JsonRpcResponse,
  type McpCapabilities,
  type McpDiscoverResult,
  type McpInitializeParams,
  type McpInitializeResult,
  type McpListToolsResult,
  type McpResultMeta,
  type McpServerInfo,
  type McpToolCallParams,
} from "./types";

// Types for prompts
interface McpGetPromptParams {
  name: string;
  arguments?: Record<string, string>;
}

// Check if a message is a valid JSON-RPC request
const isValidRequest = (message: unknown): message is JsonRpcRequest => {
  if (typeof message !== "object" || message === null) {
    return false;
  }

  const req = message as Record<string, unknown>;
  return (
    req.jsonrpc === "2.0" &&
    typeof req.method === "string" &&
    req.method.length > 0
  );
};

const SERVER_INFO: McpServerInfo = {
  name: MCP_SERVER_NAME,
  version: MCP_SERVER_VERSION,
};

const SERVER_CAPABILITIES: McpCapabilities = {
  tools: {},
  prompts: {},
};

const RESULT_META: McpResultMeta = {
  "io.modelcontextprotocol/serverInfo": SERVER_INFO,
};

// Create a JSON-RPC response.
// Every result carries `resultType: "complete"` and the serverInfo `_meta`
// required by 2026-07-28 clients; pre-2026 clients ignore the extra fields.
const createResponse = (
  id: string | number | undefined,
  result: object,
): JsonRpcResponse => ({
  jsonrpc: "2.0",
  id,
  result: {
    resultType: "complete",
    _meta: RESULT_META,
    ...result,
  },
});

// Create a JSON-RPC error response
const createErrorResponse = (
  id: string | number | undefined,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcResponse => ({
  jsonrpc: "2.0",
  id,
  error: {
    code,
    message,
    ...(data !== undefined ? { data } : {}),
  },
});

// The requested protocol version lives at `params.protocolVersion` in the
// legacy handshake and inside the `_meta` envelope for 2026-07-28 clients.
const requestedProtocolVersion = (
  params?: Partial<McpInitializeParams>,
): string | undefined =>
  params?.protocolVersion ??
  params?._meta?.["io.modelcontextprotocol/protocolVersion"];

// Legacy `initialize` negotiation: echo a supported pre-2026 version,
// otherwise answer with the newest legacy version. Never return a 2026-era
// version here — legacy clients treat that as an unsupported server.
const negotiateLegacyProtocolVersion = (requested?: string): string =>
  requested &&
  (MCP_LEGACY_PROTOCOL_VERSIONS as readonly string[]).includes(requested)
    ? requested
    : MCP_LEGACY_PROTOCOL_VERSION;

// Handle initialize request (legacy handshake, 2025-11-25 and earlier)
const handleInitialize = (
  id: string | number | undefined,
  params?: Partial<McpInitializeParams>,
): JsonRpcResponse => {
  const result: McpInitializeResult = {
    protocolVersion: negotiateLegacyProtocolVersion(
      requestedProtocolVersion(params),
    ),
    capabilities: SERVER_CAPABILITIES,
    serverInfo: SERVER_INFO,
  };
  return createResponse(id, result);
};

// Handle server/discover request (2026-07-28 DiscoverResult). Stateless:
// the client picks the newest version both sides support from the list.
const handleServerDiscover = (
  id: string | number | undefined,
): JsonRpcResponse => {
  const result: McpDiscoverResult = {
    resultType: "complete",
    supportedVersions: [...MCP_SUPPORTED_PROTOCOL_VERSIONS],
    capabilities: SERVER_CAPABILITIES,
    ttlMs: MCP_LIST_CACHE_TTL_MS,
    cacheScope: "public",
    _meta: RESULT_META,
  };
  return createResponse(id, result);
};

// Handle ping request
const handlePing = (id: string | number | undefined): JsonRpcResponse => {
  return createResponse(id, {});
};

// Handle tools/list request
const handleToolsList = (id: string | number | undefined): JsonRpcResponse => {
  const result: McpListToolsResult = {
    tools: TOOLS,
    ttlMs: MCP_LIST_CACHE_TTL_MS,
    cacheScope: "public",
  };
  return createResponse(id, result);
};

// Handle tools/call request
const handleToolsCall = async (
  id: string | number | undefined,
  params: McpToolCallParams,
  sessionHash?: string,
  country?: string,
  analyticsMethod?: string,
): Promise<JsonRpcResponse> => {
  if (!params?.name) {
    return createErrorResponse(
      id,
      JSON_RPC_ERRORS.INVALID_PARAMS,
      "Missing required parameter: name",
    );
  }

  const tool = TOOLS.find((t) => t.name === params.name);
  if (!tool) {
    return createErrorResponse(
      id,
      JSON_RPC_ERRORS.INVALID_PARAMS,
      `Unknown tool: ${params.name}`,
    );
  }

  const start = Date.now();
  try {
    const result = await executeTool(params.name, params.arguments ?? {});
    if (sessionHash) {
      // after() defers the fetch past the response so Vercel doesn't kill it.
      after(() => {
        trackEvent({
          kind: "mcp",
          name: analyticsMethod ?? params.name,
          sessionHash,
          country,
          latencyMs: Date.now() - start,
        }).catch(() => {});
      });
    }
    return createResponse(id, result);
  } catch (error) {
    if (sessionHash) {
      after(() => {
        trackEvent({
          kind: "mcp",
          name: analyticsMethod ?? params.name,
          sessionHash,
          country,
          latencyMs: Date.now() - start,
        }).catch(() => {});
      });
    }
    return createErrorResponse(
      id,
      JSON_RPC_ERRORS.INTERNAL_ERROR,
      error instanceof Error ? error.message : "Tool execution failed",
    );
  }
};

// Handle prompts/list request
const handlePromptsList = (id: string | number | undefined): JsonRpcResponse => {
  const result = {
    ...listPrompts(),
    ttlMs: MCP_LIST_CACHE_TTL_MS,
    cacheScope: "public" as const,
  };
  return createResponse(id, result);
};

// Handle prompts/get request
const handlePromptsGet = (
  id: string | number | undefined,
  params: McpGetPromptParams,
): JsonRpcResponse => {
  if (!params?.name) {
    return createErrorResponse(
      id,
      JSON_RPC_ERRORS.INVALID_PARAMS,
      "Missing required parameter: name",
    );
  }

  const result = getPrompt(params.name, params.arguments ?? {});
  if (!result) {
    return createErrorResponse(
      id,
      JSON_RPC_ERRORS.INVALID_PARAMS,
      `Unknown prompt or missing required arguments: ${params.name}`,
    );
  }

  return createResponse(id, result);
};

// Main message handler
export const handleMessage = async (
  message: unknown,
  sessionHash?: string,
  country?: string,
  analyticsMethod?: string,
): Promise<JsonRpcResponse | null> => {
  // Validate request format
  if (!isValidRequest(message)) {
    return createErrorResponse(
      undefined,
      JSON_RPC_ERRORS.INVALID_REQUEST,
      "Invalid JSON-RPC request",
    );
  }

  const { id, method, params } = message;

  // Handle notifications (requests without id)
  // According to JSON-RPC 2.0, notifications should not receive a response
  if (id === undefined) {
    // Process notification but don't return a response
    if (method === "notifications/initialized") {
      // Client acknowledged initialization - no response needed
      return null;
    }
    if (method === "notifications/cancelled") {
      // Client cancelled a request - no response needed
      return null;
    }
    // Unknown notification - ignore
    return null;
  }

  // Route to appropriate handler
  switch (method) {
    case "initialize":
      return handleInitialize(
        id,
        (params ?? {}) as unknown as Partial<McpInitializeParams>,
      );

    case "server/discover":
      return handleServerDiscover(id);

    case "ping":
      return handlePing(id);

    case "tools/list":
      return handleToolsList(id);

    case "tools/call":
      return handleToolsCall(
        id,
        (params ?? {}) as unknown as McpToolCallParams,
        sessionHash,
        country,
        analyticsMethod,
      );

    case "prompts/list":
      return handlePromptsList(id);

    case "prompts/get":
      return handlePromptsGet(id, (params ?? {}) as unknown as McpGetPromptParams);

    default:
      return createErrorResponse(
        id,
        JSON_RPC_ERRORS.METHOD_NOT_FOUND,
        `Unknown method: ${method}`,
      );
  }
};

// Parse and handle a JSON message string
export const handleJsonMessage = async (
  jsonString: string,
  sessionHash?: string,
  country?: string,
  analyticsMethod?: string,
): Promise<JsonRpcResponse | null> => {
  try {
    const message = JSON.parse(jsonString) as unknown;
    return handleMessage(message, sessionHash, country, analyticsMethod);
  } catch {
    return createErrorResponse(
      undefined,
      JSON_RPC_ERRORS.PARSE_ERROR,
      "Invalid JSON",
    );
  }
};
