/**
 * MCP (Model Context Protocol) type definitions
 * Based on the MCP specification: https://spec.modelcontextprotocol.io/
 */

// JSON-RPC 2.0 types
export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id?: string | number;
  result?: unknown;
  error?: JsonRpcError;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

// Standard JSON-RPC error codes
export const JSON_RPC_ERRORS = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const;

// MCP Protocol types
export interface McpServerInfo {
  name: string;
  version: string;
}

export interface McpCapabilities {
  tools?: Record<string, never>;
  resources?: {
    subscribe?: boolean;
    listChanged?: boolean;
  };
  prompts?: {
    listChanged?: boolean;
  };
}

export interface McpInitializeParams {
  protocolVersion: string;
  capabilities: Record<string, unknown>;
  clientInfo: {
    name: string;
    version: string;
  };
}

export interface McpInitializeResult {
  protocolVersion: string;
  capabilities: McpCapabilities;
  serverInfo: McpServerInfo;
}

// MCP Tool types
export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

export interface McpToolCallParams {
  name: string;
  arguments?: Record<string, unknown>;
}

export interface McpToolResult {
  content: McpContent[];
  isError?: boolean;
}

// MCP Resource types
export interface McpResourceDefinition {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface McpResourceTemplate {
  uriTemplate: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface McpReadResourceParams {
  uri: string;
}

export interface McpResourceContent {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string; // base64 encoded
}

export interface McpReadResourceResult {
  contents: McpResourceContent[];
}

// MCP Content types
export interface McpTextContent {
  type: "text";
  text: string;
}

export interface McpImageContent {
  type: "image";
  data: string; // base64 encoded
  mimeType: string;
}

export interface McpResourceRefContent {
  type: "resource";
  resource: McpResourceContent;
}

export type McpContent = McpTextContent | McpImageContent | McpResourceRefContent;

// MCP List results
export interface McpListCacheHints {
  /** Suggested client cache TTL in milliseconds */
  ttlMs: number;
  cacheScope: "public";
}

export interface McpListToolsResult extends McpListCacheHints {
  tools: McpToolDefinition[];
}

export interface McpListResourcesResult {
  resources: McpResourceDefinition[];
}

export interface McpListResourceTemplatesResult {
  resourceTemplates: McpResourceTemplate[];
}

// Server constants
/** Supported MCP protocol versions, newest first */
export const MCP_SUPPORTED_PROTOCOL_VERSIONS = [
  "2026-07-28",
  "2025-06-18",
  "2025-03-26",
  "2024-11-05",
] as const;
/** Default (newest) advertised protocol version */
export const MCP_PROTOCOL_VERSION = MCP_SUPPORTED_PROTOCOL_VERSIONS[0];
/** Suggested cache TTL for tools/list and prompts/list results */
export const MCP_LIST_CACHE_TTL_MS = 3_600_000;
export const MCP_SERVER_NAME = "dify-helm-watchdog";
export const MCP_SERVER_VERSION = "1.0.0";

