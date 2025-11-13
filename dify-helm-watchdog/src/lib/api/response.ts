import { createHash } from "node:crypto";
import { STATUS_CODES } from "node:http";

const HTTP_STATUS_TO_GRPC_CODE: Record<number, number> = {
  400: 3, // INVALID_ARGUMENT
  401: 16, // UNAUTHENTICATED
  403: 7, // PERMISSION_DENIED
  404: 5, // NOT_FOUND
  409: 6, // ALREADY_EXISTS
  412: 9, // FAILED_PRECONDITION
  429: 8, // RESOURCE_EXHAUSTED
  499: 1, // CANCELLED (non-standard HTTP status, but observed in practice)
  500: 13, // INTERNAL
  501: 12, // UNIMPLEMENTED
  503: 14, // UNAVAILABLE
  504: 4, // DEADLINE_EXCEEDED
};

const HTTP_STATUS_TO_STATUS: Record<number, string> = {
  400: "INVALID_ARGUMENT",
  401: "UNAUTHENTICATED",
  403: "PERMISSION_DENIED",
  404: "NOT_FOUND",
  409: "ALREADY_EXISTS",
  412: "FAILED_PRECONDITION",
  429: "RESOURCE_EXHAUSTED",
  499: "CANCELLED",
  500: "INTERNAL",
  501: "UNIMPLEMENTED",
  503: "UNAVAILABLE",
  504: "DEADLINE_EXCEEDED",
};

const computeGrpcCode = (status: number, explicit?: number): number => {
  if (typeof explicit === "number") {
    return explicit;
  }
  return HTTP_STATUS_TO_GRPC_CODE[status] ?? 2; // UNKNOWN
};

const computeStatusString = (status: number, explicit?: string): string => {
  if (explicit) {
    return explicit;
  }

  if (HTTP_STATUS_TO_STATUS[status]) {
    return HTTP_STATUS_TO_STATUS[status];
  }

  const reason = STATUS_CODES[status];
  if (reason) {
    return reason.toUpperCase().replace(/[\s-]+/g, "_");
  }

  return "UNKNOWN";
};

const generateEtag = (body: string): string => {
  const hash = createHash("sha256").update(body).digest("hex");
  return `"${hash}"`;
};

const parseIfNoneMatch = (headerValue: string | null): string[] => {
  if (!headerValue) {
    return [];
  }

  return headerValue
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
};

interface JsonResponseOptions {
  status?: number;
  headers?: HeadersInit;
  request?: Request;
}

interface ConditionalResponseOptions extends JsonResponseOptions {
  contentType: string;
}

const createConditionalResponse = (
  body: string,
  options: ConditionalResponseOptions,
): Response => {
  const { status = 200, headers, request, contentType } = options;
  const etag = generateEtag(body);
  const headerBag = new Headers(headers);

  const ifNoneMatch = parseIfNoneMatch(request?.headers.get("if-none-match") ?? null);
  const weakEtag = `W/${etag}`;
  const shouldReturnNotModified =
    ifNoneMatch.includes("*") ||
    ifNoneMatch.includes(etag) ||
    ifNoneMatch.includes(weakEtag);

  if (shouldReturnNotModified) {
    headerBag.set("ETag", etag);
    headerBag.delete("Content-Type");
    return new Response(null, {
      status: 304,
      headers: headerBag,
    });
  }

  headerBag.set("Content-Type", contentType);
  headerBag.set("ETag", etag);

  return new Response(body, {
    status,
    headers: headerBag,
  });
};

export const createJsonResponse = <T>(
  data: T,
  options: JsonResponseOptions = {},
): Response => {
  const body = JSON.stringify(data);
  return createConditionalResponse(body, {
    ...options,
    contentType: "application/json; charset=utf-8",
  });
};

export const createTextResponse = (
  body: string,
  options: JsonResponseOptions & { contentType: string },
): Response => {
  return createConditionalResponse(body, {
    ...options,
  });
};

interface ErrorResponseOptions extends JsonResponseOptions {
  status: number;
  message: string;
  statusText?: string;
  details?: unknown[];
  code?: number;
}

export const createErrorResponse = (
  options: ErrorResponseOptions,
): Response => {
  const { status, statusText, message, details, code, ...rest } = options;

  const errorPayload = {
    error: {
      code: computeGrpcCode(status, code),
      message,
      status: computeStatusString(status, statusText),
      details: details ?? [],
    },
  } as const;

  return createJsonResponse(errorPayload, {
    ...rest,
    status,
  });
};
