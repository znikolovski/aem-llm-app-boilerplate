import type { IncomingMessage, ServerResponse } from "node:http";
import { Buffer } from "node:buffer";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { corsHeaders, getMethod, parseJsonBody } from "../shared/http";
import { RuntimeParams, RuntimeResponse } from "../shared/types";
import { createWebsiteMcpServer } from "./website-mcp-server";

const STREAMABLE_ACCEPT = "application/json, text/event-stream";

/**
 * Lowercase keys for consistent lookup (same idea as Adobe remote MCP template).
 */
function normalizeIncomingHeaders(params: RuntimeParams): Record<string, string> {
  const out: Record<string, string> = {};
  const src = params.__ow_headers || {};
  for (const key in src) {
    if (Object.prototype.hasOwnProperty.call(src, key)) {
      const v = src[key];
      if (typeof v === "string" && v.length) {
        out[key.toLowerCase()] = v;
      }
    }
  }
  return out;
}

/** Node-style flat header list required by @hono/node-server `newHeadersFromIncoming`. */
function buildRawHeaders(headers: Record<string, string>): string[] {
  const raw: string[] = [];
  for (const [k, v] of Object.entries(headers)) {
    raw.push(k, v);
  }
  return raw;
}

/**
 * Build a minimal IncomingMessage-shaped object for @hono/node-server / MCP transport.
 * Mirrors adobe/generator-app-remote-mcp-server-generic mcp-server/index.js.
 */
function createCompatibleRequest(
  params: RuntimeParams,
  parsedBody: unknown
): IncomingMessage {
  const incomingHeaders = normalizeIncomingHeaders(params);
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "mcp-session-id": String(params["mcp-session-id"] || incomingHeaders["mcp-session-id"] || ""),
    ...incomingHeaders,
    accept: STREAMABLE_ACCEPT
  };
  if (!headers["mcp-session-id"]) {
    delete headers["mcp-session-id"];
  }
  if (!headers.host) {
    headers.host = "localhost";
  }

  const method = (params.__ow_method || "GET").toUpperCase();
  const path = typeof params.__ow_path === "string" ? params.__ow_path : "/mcp";
  const rawHeaders = buildRawHeaders(headers);

  const req = {
    method,
    url: path,
    path,
    headers,
    rawHeaders,
    body: parsedBody,
    socket: {
      remoteAddress: "127.0.0.1",
      encrypted: true
    },
    /** Hono POST path registers `incoming.on("end", …)`; emit end asynchronously like a drained body. */
    on(this: unknown, event: string, listener: (...args: unknown[]) => void) {
      if (event === "end") {
        queueMicrotask(() => listener());
      }
      return this;
    },
    once(this: unknown, event: string, listener: (...args: unknown[]) => void) {
      if (event === "end") {
        queueMicrotask(() => listener());
      }
      return this;
    },
    off() {
      return req;
    },
    removeListener() {
      return req;
    },
    get(name: string) {
      return headers[name.toLowerCase()];
    }
  };

  return req as unknown as IncomingMessage;
}

/**
 * Collect Node ServerResponse writes into OpenWhisk { statusCode, headers, body }.
 * Header keys use Title-Case like the Adobe template (Pekko / gateway compatibility).
 */
function canonicalHeaderName(key: string): string {
  return key
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join("-");
}

function createCompatibleResponse(): ServerResponse & { getResult: () => RuntimeResponse } {
  let statusCode = 200;
  let headers: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS, DELETE",
    "Access-Control-Allow-Headers":
      "Content-Type, Accept, Authorization, x-api-key, mcp-session-id, Last-Event-ID, mcp-protocol-version",
    "Access-Control-Expose-Headers": "Content-Type, mcp-session-id, Last-Event-ID",
    "Access-Control-Max-Age": "86400"
  };
  let body = "";
  let headersSent = false;

  const appendChunk = (chunk: unknown) => {
    if (chunk === undefined || chunk === null) {
      return;
    }
    if (typeof chunk === "string") {
      body += chunk;
      return;
    }
    if (chunk instanceof Uint8Array || Buffer.isBuffer(chunk)) {
      body += Buffer.from(chunk).toString("utf8");
      return;
    }
    body += JSON.stringify(chunk);
  };

  const setMergedHeader = (name: string, value: string | number | undefined) => {
    if (value === undefined || value === null) {
      return;
    }
    const v = typeof value === "string" ? value : String(value);
    if (!v.length) {
      return;
    }
    headers[canonicalHeaderName(name)] = v;
  };

  const res = {
    status(code: number) {
      statusCode = code;
      (res as { statusCode: number }).statusCode = code;
      return res;
    },
    setHeader(name: string, value: string | number | string[]) {
      if (Array.isArray(value)) {
        setMergedHeader(name, value.join(", "));
      } else {
        setMergedHeader(name, value);
      }
      return res;
    },
    getHeader(name: string) {
      return headers[canonicalHeaderName(name)] ?? headers[name];
    },
    writeHead(code: number, reasonOrHeaders?: unknown, headerObj?: Record<string, string>) {
      statusCode = code;
      (res as { statusCode: number }).statusCode = code;
      const hdrs =
        typeof reasonOrHeaders === "object" && reasonOrHeaders !== null
          ? (reasonOrHeaders as Record<string, string>)
          : headerObj || {};
      for (const [k, v] of Object.entries(hdrs)) {
        if (typeof v === "string") {
          setMergedHeader(k, v);
        }
      }
      headersSent = true;
      return res;
    },
    write(chunk: unknown) {
      appendChunk(chunk);
      return true;
    },
    end(chunk?: unknown) {
      appendChunk(chunk);
      headersSent = true;
      return res;
    },
    json(obj: unknown) {
      setMergedHeader("Content-Type", "application/json");
      body = JSON.stringify(obj);
      headersSent = true;
      return res;
    },
    send(data?: unknown) {
      if (data !== undefined && data !== null) {
        body = typeof data === "string" ? data : JSON.stringify(data);
      }
      headersSent = true;
      return res;
    },
    get headersSent() {
      return headersSent;
    },
    get writableEnded() {
      return false;
    },
    get writableFinished() {
      return false;
    },
    get finished() {
      return false;
    },
    get writable() {
      return true;
    },
    statusCode: 200,
    socket: {
      writable: true,
      destroyed: false,
      on: () => res,
      once: () => res,
      removeListener: () => res,
      write: () => true,
      end: () => {}
    },
    connection: null,
    flushHeaders: () => {
      headersSent = true;
    },
    on: () => res,
    once: () => res,
    emit: () => true,
    removeListener: () => res,
    addListener: () => res,
    off: () => res,

    getResult(): RuntimeResponse {
      const outHeaders: Record<string, string> = { ...headers };
      for (const [k, v] of Object.entries(corsHeaders)) {
        if (!outHeaders[canonicalHeaderName(k)]) {
          outHeaders[canonicalHeaderName(k)] = v;
        }
      }
      return {
        statusCode,
        headers: outHeaders,
        body: body.length ? body : undefined
      };
    }
  };

  return res as unknown as ServerResponse & { getResult: () => RuntimeResponse };
}

/**
 * Stateless Streamable HTTP (JSON response mode) for one Adobe I/O Runtime web activation.
 * Uses the same Node transport + req/res shim as Adobe's generator-app-remote-mcp-server-generic.
 */
export async function handleStreamableMcpInvocation(params: RuntimeParams): Promise<RuntimeResponse> {
  const server = createWebsiteMcpServer(params);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true
  });

  await server.connect(transport);

  const parsedBody = getMethod(params) === "POST" ? parseJsonBody(params) : undefined;
  const req = createCompatibleRequest(params, parsedBody);
  const res = createCompatibleResponse();

  const responseComplete = new Promise<void>((resolve) => {
    const originalEnd = res.end.bind(res);
    (res as { end: (chunk?: unknown) => unknown }).end = function endPatched(chunk?: unknown) {
      const r = originalEnd(chunk);
      setTimeout(() => resolve(), 10);
      return r;
    };
  });

  try {
    await transport.handleRequest(req, res, parsedBody);
    await responseComplete;
    return (res as ServerResponse & { getResult: () => RuntimeResponse }).getResult();
  } finally {
    await transport.close();
    await server.close();
  }
}
