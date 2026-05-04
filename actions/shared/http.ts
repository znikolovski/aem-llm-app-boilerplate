import type { Readable } from "node:stream";
import { RuntimeParams, RuntimeResponse } from "./types";

/** Aligned with Adobe `generator-app-remote-mcp-server-generic` MCP web action CORS. */
export const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS, DELETE",
  "access-control-allow-headers":
    "Content-Type, Accept, Authorization, x-api-key, mcp-session-id, Last-Event-ID, mcp-protocol-version",
  "access-control-expose-headers": "Content-Type, mcp-session-id, Last-Event-ID",
  "access-control-max-age": "86400"
};

export function getMethod(params: RuntimeParams): string {
  return String(params.__ow_method || params.method || "GET").toUpperCase();
}

export function jsonResponse(
  body: unknown,
  statusCode = 200,
  headers: Record<string, string> = {}
): RuntimeResponse {
  return {
    statusCode,
    headers: {
      ...corsHeaders,
      "content-type": "application/json; charset=utf-8",
      ...headers
    },
    body: JSON.stringify(body)
  };
}

export function htmlResponse(body: string, statusCode = 200): RuntimeResponse {
  return {
    statusCode,
    headers: {
      ...corsHeaders,
      "content-type": "text/html; charset=utf-8"
    },
    body
  };
}

export function textResponse(body: string, statusCode = 200): RuntimeResponse {
  return {
    statusCode,
    headers: {
      ...corsHeaders,
      "content-type": "text/plain; charset=utf-8"
    },
    body
  };
}

/**
 * Server-Sent Events stream for OpenWhisk web actions. Body must be a Node.js Readable.
 */
export function sseStreamResponse(body: Readable, headers: Record<string, string> = {}): RuntimeResponse {
  return {
    statusCode: 200,
    headers: {
      ...corsHeaders,
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
      ...headers
    },
    body
  };
}

/** CORS preflight: 200 + empty body (same pattern as Adobe MCP generator `handleOptionsRequest`). */
export function preflightOkResponse(): RuntimeResponse {
  return {
    statusCode: 200,
    headers: { ...corsHeaders },
    body: ""
  };
}

export function noContentResponse(statusCode = 204): RuntimeResponse {
  return {
    statusCode,
    headers: corsHeaders
  };
}

export function errorResponse(error: unknown, statusCode = 500): RuntimeResponse {
  const message = error instanceof Error ? error.message : "Unexpected error.";
  return jsonResponse({ error: message }, statusCode);
}

export function parseJsonBody(params: RuntimeParams): unknown {
  const body = params.__ow_body ?? params.body;

  if (body == null || body === "") {
    return {};
  }

  if (typeof body === "object") {
    return body;
  }

  const raw = String(body);
  const candidates = [raw, decodeBase64(raw)];

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    try {
      return JSON.parse(candidate);
    } catch {
      // Try the next decoding form.
    }
  }

  throw new Error("Request body must be valid JSON.");
}

export function readQueryString(params: RuntimeParams, key: string): string | undefined {
  const value = params[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function readInteger(params: RuntimeParams, key: string, fallback: number): number {
  const value = readQueryString(params, key);
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function decodeBase64(value: string): string | undefined {
  if (!/^[A-Za-z0-9+/]+=*$/.test(value) || value.length % 4 !== 0) {
    return undefined;
  }

  try {
    return Buffer.from(value, "base64").toString("utf8");
  } catch {
    return undefined;
  }
}
