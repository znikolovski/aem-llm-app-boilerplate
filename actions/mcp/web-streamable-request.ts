import { corsHeaders, getMethod } from "../shared/http";
import { RuntimeParams, RuntimeResponse } from "../shared/types";

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
      : "/v1/mcp";
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${proto}://${host}${normalized}`;
}

/**
 * Web `Request` for `WebStandardStreamableHTTPServerTransport` (OpenWhisk `raw-http` action).
 * The official Adobe generator uses `StreamableHTTPServerTransport` + a req/res shim; current
 * `@modelcontextprotocol/sdk` builds that path on `@hono/node-server`, which expects a full Node
 * `IncomingMessage`. Using the Web-standard transport with the same options (`enableJsonResponse`,
 * stateless session) matches runtime behavior while staying deployable on I/O Runtime.
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
  /** Match Adobe generator: SDK POST handler requires both media types in Accept. */
  headers.set("accept", "application/json, text/event-stream");

  return new Request(url, { method, headers, body });
}

export async function webResponseToRuntimeResponse(response: Response): Promise<RuntimeResponse> {
  const statusCode = response.status;
  const headers: Record<string, string> = { ...corsHeaders };
  response.headers.forEach((value, key) => {
    const k = key.toLowerCase();
    if (k) {
      headers[k] = value;
    }
  });

  const text = await response.text();
  return {
    statusCode,
    headers,
    body: text.length ? text : undefined
  };
}
