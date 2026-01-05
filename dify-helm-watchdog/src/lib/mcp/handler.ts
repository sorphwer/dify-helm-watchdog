/**
 * MCP Message Handler
 * Processes JSON-RPC 2.0 messages according to MCP protocol
 */

import { TOOLS, executeTool } from "./tools";
import { listPrompts, getPrompt } from "./prompts";
import {
  JSON_RPC_ERRORS,
  MCP_PROTOCOL_VERSION,
  MCP_SERVER_NAME,
  MCP_SERVER_VERSION,
  type JsonRpcRequest,
  type JsonRpcResponse,
  type McpInitializeResult,
  type McpListToolsResult,
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

// Create a JSON-RPC response
const createResponse = (
  id: string | number | undefined,
  result: unknown,
): JsonRpcResponse => ({
  jsonrpc: "2.0",
  id,
  result,
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

// Handle initialize request
const handleInitialize = (
  id: string | number | undefined,
): JsonRpcResponse => {
  const result: McpInitializeResult = {
    protocolVersion: MCP_PROTOCOL_VERSION,
    capabilities: {
      tools: {},
      prompts: {},
    },
    serverInfo: {
      name: MCP_SERVER_NAME,
      version: MCP_SERVER_VERSION,
    },
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
  };
  return createResponse(id, result);
};

// Handle tools/call request
const handleToolsCall = async (
  id: string | number | undefined,
  params: McpToolCallParams,
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

  try {
    const result = await executeTool(params.name, params.arguments ?? {});
    return createResponse(id, result);
  } catch (error) {
    return createErrorResponse(
      id,
      JSON_RPC_ERRORS.INTERNAL_ERROR,
      error instanceof Error ? error.message : "Tool execution failed",
    );
  }
};

// Handle prompts/list request
const handlePromptsList = (id: string | number | undefined): JsonRpcResponse => {
  const result = listPrompts();
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
      return handleInitialize(id);

    case "ping":
      return handlePing(id);

    case "tools/list":
      return handleToolsList(id);

    case "tools/call":
      return handleToolsCall(id, (params ?? {}) as unknown as McpToolCallParams);

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
): Promise<JsonRpcResponse | null> => {
  try {
    const message = JSON.parse(jsonString) as unknown;
    return handleMessage(message);
  } catch {
    return createErrorResponse(
      undefined,
      JSON_RPC_ERRORS.PARSE_ERROR,
      "Invalid JSON",
    );
  }
};

// Format response for SSE
export const formatSseEvent = (
  data: unknown,
  event?: string,
  id?: string,
): string => {
  const lines: string[] = [];

  if (id) {
    lines.push(`id: ${id}`);
  }

  if (event) {
    lines.push(`event: ${event}`);
  }

  lines.push(`data: ${JSON.stringify(data)}`);
  lines.push(""); // Empty line to end event

  return lines.join("\n") + "\n";
};

