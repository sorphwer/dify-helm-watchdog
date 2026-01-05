/**
 * MCP Streamable HTTP Transport Endpoint
 * Implements Streamable HTTP transport for MCP protocol (MCP 2025 specification)
 *
 * POST /api/v1/mcp - Send JSON-RPC message, receive response
 * GET /api/v1/mcp - Server info and capabilities
 */

import { handleJsonMessage, handleMessage } from "@/lib/mcp/handler";
import { createErrorResponse, createJsonResponse } from "@/lib/api/response";
import {
  MCP_PROTOCOL_VERSION,
  MCP_SERVER_NAME,
  MCP_SERVER_VERSION,
} from "@/lib/mcp/types";

export const runtime = "nodejs";

/**
 * @swagger
 * /api/v1/mcp:
 *   get:
 *     summary: Get MCP server information
 *     description: Returns MCP server capabilities and version information. This endpoint is for discovery purposes.
 *     tags:
 *       - MCP
 *     responses:
 *       200:
 *         description: Server information and capabilities.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 protocolVersion:
 *                   type: string
 *                 serverInfo:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                     version:
 *                       type: string
 *                 capabilities:
 *                   type: object
 */
export async function GET(request: Request) {
  const info = {
    protocolVersion: MCP_PROTOCOL_VERSION,
    serverInfo: {
      name: MCP_SERVER_NAME,
      version: MCP_SERVER_VERSION,
    },
    capabilities: {
      tools: {},
      prompts: {},
    },
    endpoints: {
      sse: "/api/v1/sse",
      streamableHttp: "/api/v1/mcp",
    },
    documentation: {
      openapi: "/openapi.json",
      swagger: "/swagger",
    },
  };

  return createJsonResponse(info, {
    request,
    headers: {
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}

/**
 * @swagger
 * /api/v1/mcp:
 *   post:
 *     summary: Send MCP message via Streamable HTTP
 *     description: |
 *       Processes JSON-RPC 2.0 messages according to the MCP protocol.
 *       Supports both single requests and batch requests.
 *
 *       Available methods:
 *       - `initialize` - Initialize the MCP session
 *       - `ping` - Health check
 *       - `tools/list` - List available tools
 *       - `tools/call` - Execute a tool
 *       - `prompts/list` - List available prompt templates
 *       - `prompts/get` - Get a prompt template with arguments
 *     tags:
 *       - MCP
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             oneOf:
 *               - type: object
 *                 description: Single JSON-RPC request
 *                 properties:
 *                   jsonrpc:
 *                     type: string
 *                     enum: ["2.0"]
 *                   id:
 *                     oneOf:
 *                       - type: string
 *                       - type: number
 *                   method:
 *                     type: string
 *                     example: "tools/list"
 *                   params:
 *                     type: object
 *               - type: array
 *                 description: Batch of JSON-RPC requests
 *                 items:
 *                   type: object
 *           examples:
 *             initialize:
 *               summary: Initialize session
 *               value:
 *                 jsonrpc: "2.0"
 *                 id: 1
 *                 method: initialize
 *                 params:
 *                   protocolVersion: "2024-11-05"
 *                   capabilities: {}
 *                   clientInfo:
 *                     name: "example-client"
 *                     version: "1.0.0"
 *             listTools:
 *               summary: List available tools
 *               value:
 *                 jsonrpc: "2.0"
 *                 id: 2
 *                 method: tools/list
 *             callTool:
 *               summary: Call a tool
 *               value:
 *                 jsonrpc: "2.0"
 *                 id: 3
 *                 method: tools/call
 *                 params:
 *                   name: list_versions
 *                   arguments:
 *                     includeValidation: true
 *     responses:
 *       200:
 *         description: JSON-RPC response(s).
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - type: object
 *                   properties:
 *                     jsonrpc:
 *                       type: string
 *                     id:
 *                       oneOf:
 *                         - type: string
 *                         - type: number
 *                     result:
 *                       type: object
 *                     error:
 *                       type: object
 *                 - type: array
 *                   items:
 *                     type: object
 *       204:
 *         description: Notification processed (no response body).
 *       400:
 *         description: Invalid request body.
 *       500:
 *         description: Internal server error.
 */
export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type");

    // Validate content type
    if (!contentType?.includes("application/json")) {
      return createErrorResponse({
        request,
        status: 400,
        message: "Content-Type must be application/json",
        statusText: "INVALID_ARGUMENT",
      });
    }

    const body = await request.text();
    if (!body) {
      return createErrorResponse({
        request,
        status: 400,
        message: "Request body is required",
        statusText: "INVALID_ARGUMENT",
      });
    }

    // Parse and check for batch requests
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32700,
            message: "Parse error: Invalid JSON",
          },
        }),
        {
          status: 200, // JSON-RPC errors use 200 status
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
          },
        },
      );
    }

    // Handle batch requests
    if (Array.isArray(parsed)) {
      const responses = await Promise.all(
        parsed.map((message) => handleMessage(message)),
      );

      // Filter out null responses (notifications)
      const validResponses = responses.filter((r) => r !== null);

      if (validResponses.length === 0) {
        // All were notifications
        return new Response(null, { status: 204 });
      }

      return new Response(JSON.stringify(validResponses), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      });
    }

    // Handle single request
    const response = await handleJsonMessage(body);

    if (response === null) {
      // Notification - no response needed
      return new Response(null, { status: 204 });
    }

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[api/v1/mcp] Error processing message", error);
    return createErrorResponse({
      request,
      status: 500,
      message: error instanceof Error ? error.message : "Unknown error",
      statusText: "INTERNAL",
    });
  }
}

