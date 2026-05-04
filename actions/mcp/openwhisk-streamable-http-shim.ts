import { corsHeaders } from "../shared/http";
import { RuntimeParams, RuntimeResponse } from "../shared/types";

export function normalizeHeaders(headers: RuntimeParams["__ow_headers"]): Record<string, string> {
  const normalized: Record<string, string> = {};
  if (headers && typeof headers === "object") {
    for (const key of Object.keys(headers)) {
      const v = headers[key];
      if (v !== undefined && v !== null) {
        normalized[key.toLowerCase()] = String(v);
      }
    }
  }
  return normalized;
}

/**
 * Parse JSON body from OpenWhisk web-action params (`raw-http`), matching the Adobe MCP template:
 * try base64 decode first, then parse the raw string.
 */
export function parseMcpRequestBody(params: RuntimeParams): unknown | null {
  const raw = params.__ow_body ?? params.body;
  if (raw == null || raw === "") {
    return null;
  }
  if (typeof raw === "object") {
    return raw;
  }
  const str = String(raw);
  try {
    try {
      const decoded = Buffer.from(str, "base64").toString("utf8");
      return JSON.parse(decoded);
    } catch {
      return JSON.parse(str);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    throw new Error(`Failed to parse request body: ${message}`);
  }
}

export function mcpHealthCheckResponse(): RuntimeResponse {
  return {
    statusCode: 200,
    headers: {
      ...corsHeaders,
      "content-type": "application/json; charset=utf-8"
    },
    body: JSON.stringify({
      status: "healthy",
      server: "llm-app",
      version: "0.1.0",
      description: "Adobe App Builder MCP server (Streamable HTTP, stateless), aligned with generator-app-remote-mcp-server-generic.",
      timestamp: new Date().toISOString(),
      transport: "StreamableHTTP",
      sdk: "@modelcontextprotocol/sdk"
    })
  };
}

/** Graceful SSE response when clients request `text/event-stream` on GET (serverless limitation per Adobe template). */
export function mcpGetSseNotSupportedResponse(): RuntimeResponse {
  return {
    statusCode: 200,
    headers: {
      "access-control-allow-origin": "*",
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache",
      connection: "close"
    },
    body: 'event: error\ndata: {"error":"SSE not supported in serverless. Use HTTP POST with JSON responses."}\n\n'
  };
}
