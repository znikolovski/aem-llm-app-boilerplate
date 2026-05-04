import { Readable } from "node:stream";
import { corsHeaders, getMethod } from "../shared/http";
import { RuntimeParams, RuntimeResponse } from "../shared/types";
import type { ReadableStream } from "node:stream/web";

function headerRecord(params: RuntimeParams): Record<string, string> {
  const raw = params.__ow_headers;
  if (!raw || typeof raw !== "object") {
    return {};
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v === undefined || v === null) {
      continue;
    }
    out[String(k).toLowerCase()] = String(v);
  }
  return out;
}

function buildRequestUrl(params: RuntimeParams, headers: Headers): string {
  const host = headers.get("x-forwarded-host") || headers.get("host") || "localhost";
  const proto = headers.get("x-forwarded-proto") || "https";
  const path =
    typeof params.__ow_path === "string" && params.__ow_path.trim()
      ? params.__ow_path.trim()
      : "/mcp";
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${proto}://${host}${normalized}`;
}

/**
 * Build a Web `Request` from OpenWhisk web-action params (raw-http).
 */
export function openWhiskParamsToWebRequest(params: RuntimeParams): Request {
  const method = getMethod(params);
  const h = headerRecord(params);
  const headers = new Headers();
  for (const [k, v] of Object.entries(h)) {
    headers.set(k, v);
  }
  const url = buildRequestUrl(params, headers);

  if (method === "GET" || method === "HEAD") {
    return new Request(url, { method, headers });
  }

  const raw = params.__ow_body ?? params.body;
  if (raw == null || raw === "") {
    return new Request(url, { method, headers });
  }

  const body = typeof raw === "string" ? raw : JSON.stringify(raw);
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  return new Request(url, { method, headers, body });
}

export function parsedJsonBodyForMcp(params: RuntimeParams): unknown | undefined {
  const method = getMethod(params);
  if (method !== "POST" && method !== "DELETE") {
    return undefined;
  }
  const raw = params.__ow_body ?? params.body;
  if (raw == null || raw === "") {
    return undefined;
  }
  if (typeof raw === "object") {
    return raw;
  }
  const text = String(raw);
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export type WebResponseOptions = {
  /** When true and the response is `text/event-stream`, return a Node Readable instead of buffering. */
  sseAsPassthroughStream?: boolean;
};

/**
 * Convert a Web `Response` from MCP Streamable HTTP into an OpenWhisk web result.
 */
export async function webResponseToRuntimeResponse(
  response: Response,
  options: WebResponseOptions = {}
): Promise<RuntimeResponse> {
  const statusCode = response.status;
  const headers: Record<string, string> = { ...corsHeaders };
  response.headers.forEach((value, key) => {
    const k = key.toLowerCase();
    if (!k) {
      return;
    }
    headers[k] = value;
  });

  const contentType = String(response.headers.get("content-type") || "").toLowerCase();

  /**
   * Standalone MCP `GET` (SSE) must not be fully buffered with `response.text()` — that can
   * block until the client disconnects. Pass a Node `Readable` through for GET only.
   * `POST` may still use `text/event-stream` framing for a single JSON-RPC response; buffer it.
   */
  if (
    options.sseAsPassthroughStream &&
    contentType.includes("text/event-stream") &&
    response.body
  ) {
    return {
      statusCode,
      headers,
      body: Readable.fromWeb(response.body as import("stream/web").ReadableStream)
    };
  }

  const text = await response.text();
  return {
    statusCode,
    headers,
    body: text.length ? text : undefined
  };
}
