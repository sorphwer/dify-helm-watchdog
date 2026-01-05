/**
 * MCP SSE Transport Endpoint
 * Implements Server-Sent Events transport for MCP protocol
 *
 * GET /api/v1/sse - Establish SSE connection
 * POST /api/v1/sse - Send JSON-RPC message (returns response via SSE or inline)
 */

import { createSession, getSession, touchSession, deleteSession } from "@/lib/mcp/session";
import { handleJsonMessage, formatSseEvent } from "@/lib/mcp/handler";
import { createErrorResponse } from "@/lib/api/response";

export const runtime = "nodejs";

// Store for pending SSE connections awaiting messages
const sseConnections = new Map<
  string,
  {
    controller: ReadableStreamDefaultController<Uint8Array>;
    encoder: TextEncoder;
  }
>();

/**
 * @swagger
 * /api/v1/sse:
 *   get:
 *     summary: Establish MCP SSE connection
 *     description: Opens a Server-Sent Events stream for receiving MCP protocol messages. Returns a session ID in the endpoint query parameter for message routing.
 *     tags:
 *       - MCP
 *     responses:
 *       200:
 *         description: SSE stream established. Returns events with session ID and MCP responses.
 *         content:
 *           text/event-stream:
 *             schema:
 *               type: string
 *       500:
 *         description: Internal server error.
 */
export async function GET(request: Request) {
  const session = createSession();
  const encoder = new TextEncoder();

  // Get the base URL for the POST endpoint
  const url = new URL(request.url);
  const postEndpoint = `${url.pathname}?sessionId=${session.id}`;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      // Store the connection for message routing
      sseConnections.set(session.id, { controller, encoder });

      // Send endpoint event with POST URL for client to use
      const endpointEvent = formatSseEvent(postEndpoint, "endpoint");
      controller.enqueue(encoder.encode(endpointEvent));

      // Send initial connection message
      const connectEvent = formatSseEvent(
        {
          type: "connection",
          sessionId: session.id,
          message: "MCP SSE connection established",
        },
        "message",
      );
      controller.enqueue(encoder.encode(connectEvent));
    },

    cancel() {
      // Clean up when client disconnects
      sseConnections.delete(session.id);
      deleteSession(session.id);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // Disable nginx buffering
    },
  });
}

/**
 * @swagger
 * /api/v1/sse:
 *   post:
 *     summary: Send MCP message via SSE transport
 *     description: Sends a JSON-RPC 2.0 message to the MCP server. Responses are either returned inline or sent via the associated SSE stream.
 *     tags:
 *       - MCP
 *     parameters:
 *       - name: sessionId
 *         in: query
 *         description: Session ID from the SSE connection endpoint event.
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               jsonrpc:
 *                 type: string
 *                 enum: ["2.0"]
 *               id:
 *                 oneOf:
 *                   - type: string
 *                   - type: number
 *               method:
 *                 type: string
 *               params:
 *                 type: object
 *     responses:
 *       200:
 *         description: Message processed. Response sent via SSE stream or returned inline.
 *       202:
 *         description: Message accepted and response sent via SSE stream.
 *       400:
 *         description: Invalid request body.
 *       404:
 *         description: Session not found.
 *       500:
 *         description: Internal server error.
 */
export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get("sessionId");

    // Read the request body
    const body = await request.text();
    if (!body) {
      return createErrorResponse({
        request,
        status: 400,
        message: "Request body is required",
        statusText: "INVALID_ARGUMENT",
      });
    }

    // Process the message
    const response = await handleJsonMessage(body);

    // If sessionId is provided and we have an active SSE connection, send via SSE
    if (sessionId) {
      const session = getSession(sessionId);
      if (session) {
        touchSession(sessionId);

        const connection = sseConnections.get(sessionId);
        if (connection && response) {
          // Send response via SSE stream
          const event = formatSseEvent(response, "message");
          connection.controller.enqueue(connection.encoder.encode(event));

          // Return 202 Accepted to indicate message was received
          return new Response(null, {
            status: 202,
            headers: {
              "Content-Type": "application/json",
            },
          });
        }
      }
    }

    // No active SSE connection or no session - return response inline
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
    console.error("[api/v1/sse] Error processing message", error);
    return createErrorResponse({
      request,
      status: 500,
      message: error instanceof Error ? error.message : "Unknown error",
      statusText: "INTERNAL",
    });
  }
}

