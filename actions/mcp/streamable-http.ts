import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { corsHeaders, getMethod, parseJsonBody } from "../shared/http";
import { RuntimeParams, RuntimeResponse } from "../shared/types";
import { createWebsiteMcpServer } from "./website-mcp-server";

const STREAMABLE_ACCEPT = "application/json, text/event-stream";

function mergeHeaders(transportHeaders: Record<string, string>): Record<string, string> {
  return { ...corsHeaders, ...transportHeaders };
}

/**
 * Streamable HTTP clients must send Accept including both JSON and SSE; some proxies strip it.
 * Content-Type must be JSON for POST bodies.
 */
function normalizedHeaderMap(params: RuntimeParams): Record<string, string> {
  const out: Record<string, string> = {};
  const src = params.__ow_headers || {};
  for (const [k, v] of Object.entries(src)) {
    if (typeof v === "string" && v.length) {
      out[k.toLowerCase()] = v;
    }
  }

  const accept = (out.accept || "").toLowerCase();
  if (!accept.includes("application/json") || !accept.includes("text/event-stream")) {
    out.accept = STREAMABLE_ACCEPT;
  }

  const method = getMethod(params);
  if (method === "POST") {
    const ct = (out["content-type"] || "").toLowerCase();
    if (!ct.includes("application/json")) {
      out["content-type"] = "application/json; charset=utf-8";
    }
  }

  return out;
}

function requestUrl(params: RuntimeParams): string {
  const h = normalizedHeaderMap(params);
  const host = h["x-forwarded-host"] || h.host;
  const proto = (h["x-forwarded-proto"] || "https").split(",")[0].trim();
  const path = typeof params.__ow_path === "string" && params.__ow_path.startsWith("/") ? params.__ow_path : "/mcp";
  if (host) {
    return `${proto}://${host}${path}`;
  }
  return `https://mcp.invalid${path}`;
}

function buildFetchRequest(params: RuntimeParams): Request {
  const method = getMethod(params);
  const headers = new Headers(normalizedHeaderMap(params));
  const url = requestUrl(params);
  const rawBody = params.__ow_body ?? params.body;
  let body: string | undefined;
  if (method !== "GET" && method !== "HEAD") {
    if (rawBody == null || rawBody === "") {
      body = "{}";
    } else if (typeof rawBody === "object") {
      body = JSON.stringify(rawBody);
    } else {
      body = String(rawBody);
    }
  }
  return new Request(url, { method, headers, body });
}

async function responseToRuntime(res: Response): Promise<RuntimeResponse> {
  const headers: Record<string, string> = {};
  res.headers.forEach((value, key) => {
    headers[key] = value;
  });
  const body = await res.text();
  return {
    statusCode: res.status,
    headers: mergeHeaders(headers),
    body: body.length ? body : undefined
  };
}

/**
 * Stateless Streamable HTTP (JSON response mode) for one Adobe I/O Runtime web activation.
 */
export async function handleStreamableMcpInvocation(params: RuntimeParams): Promise<RuntimeResponse> {
  const server = createWebsiteMcpServer(params);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true
  });

  await server.connect(transport);

  try {
    const req = buildFetchRequest(params);
    const parsedBody = getMethod(params) === "POST" ? parseJsonBody(params) : undefined;
    const res = await transport.handleRequest(req, { parsedBody });
    return await responseToRuntime(res);
  } finally {
    await transport.close();
    await server.close();
  }
}
