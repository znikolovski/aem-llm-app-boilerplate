/*
 * Streamable HTTP + req/res shim for @modelcontextprotocol/sdk on Adobe I/O Runtime.
 * Based on adobe/generator-app-remote-mcp-server-generic and OpenWhisk/Hono compatibility fixes.
 */

const { Buffer } = require("node:buffer");
const { StreamableHTTPServerTransport } = require("@modelcontextprotocol/sdk/server/streamableHttp.js");

const STREAMABLE_ACCEPT = "application/json, text/event-stream";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
  "access-control-allow-headers": "content-type,authorization,mcp-session-id,mcp-protocol-version,accept",
  "access-control-expose-headers": "mcp-session-id"
};

function getMethod(params) {
  return String(params.__ow_method || params.method || "GET").toUpperCase();
}

function decodeBase64(value) {
  if (!/^[A-Za-z0-9+/]+=*$/.test(value) || value.length % 4 !== 0) {
    return undefined;
  }
  try {
    return Buffer.from(value, "base64").toString("utf8");
  } catch {
    return undefined;
  }
}

function parseJsonBody(params) {
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
      // continue
    }
  }
  throw new Error("Request body must be valid JSON.");
}

function normalizeIncomingHeaders(params) {
  const out = {};
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

function buildRawHeaders(headers) {
  const raw = [];
  for (const [k, v] of Object.entries(headers)) {
    raw.push(k, v);
  }
  return raw;
}

function createCompatibleRequest(params, parsedBody) {
  const incomingHeaders = normalizeIncomingHeaders(params);
  const headers = {
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
  const path = typeof params.__ow_path === "string" ? params.__ow_path : "/mcp-server";
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
    on(_event, listener) {
      if (_event === "end") {
        queueMicrotask(() => listener());
      }
      return req;
    },
    once(_event, listener) {
      if (_event === "end") {
        queueMicrotask(() => listener());
      }
      return req;
    },
    off() {
      return req;
    },
    removeListener() {
      return req;
    },
    get(name) {
      return headers[name.toLowerCase()];
    }
  };
  return req;
}

function canonicalHeaderName(key) {
  return key
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join("-");
}

function createCompatibleResponse() {
  let statusCode = 200;
  let headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS, DELETE",
    "Access-Control-Allow-Headers":
      "Content-Type, Accept, Authorization, x-api-key, mcp-session-id, Last-Event-ID, mcp-protocol-version",
    "Access-Control-Expose-Headers": "Content-Type, mcp-session-id, Last-Event-ID",
    "Access-Control-Max-Age": "86400"
  };
  let body = "";
  let headersSent = false;

  const appendChunk = (chunk) => {
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

  const setMergedHeader = (name, value) => {
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
    status(code) {
      statusCode = code;
      res.statusCode = code;
      return res;
    },
    setHeader(name, value) {
      if (Array.isArray(value)) {
        setMergedHeader(name, value.join(", "));
      } else {
        setMergedHeader(name, value);
      }
      return res;
    },
    getHeader(name) {
      return headers[canonicalHeaderName(name)] ?? headers[name];
    },
    writeHead(code, reasonOrHeaders, headerObj) {
      statusCode = code;
      res.statusCode = code;
      const hdrs =
        typeof reasonOrHeaders === "object" && reasonOrHeaders !== null
          ? reasonOrHeaders
          : headerObj || {};
      for (const [k, v] of Object.entries(hdrs)) {
        if (typeof v === "string") {
          setMergedHeader(k, v);
        } else if (typeof v === "number" || typeof v === "boolean") {
          setMergedHeader(k, String(v));
        }
      }
      headersSent = true;
      return res;
    },
    write(chunk) {
      appendChunk(chunk);
      return true;
    },
    end(chunk) {
      appendChunk(chunk);
      headersSent = true;
      return res;
    },
    json(obj) {
      setMergedHeader("Content-Type", "application/json");
      body = JSON.stringify(obj);
      headersSent = true;
      return res;
    },
    send(data) {
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

    getResult() {
      const outHeaders = { ...headers };
      for (const [k, v] of Object.entries(corsHeaders)) {
        const ck = canonicalHeaderName(k);
        if (outHeaders[ck] === undefined) {
          outHeaders[ck] = v;
        }
      }
      return {
        statusCode,
        headers: outHeaders,
        body: body.length ? body : undefined
      };
    }
  };
  return res;
}

/**
 * @param {Record<string, unknown>} params
 * @param {() => import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} createMcpServer
 */
async function handleStreamableMcpInvocation(params, createMcpServer) {
  const server = createMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true
  });

  await server.connect(transport);

  const parsedBody = getMethod(params) === "POST" ? parseJsonBody(params) : undefined;
  const req = createCompatibleRequest(params, parsedBody);
  const res = createCompatibleResponse();

  const responseComplete = new Promise((resolve) => {
    const originalEnd = res.end.bind(res);
    res.end = function endPatched(chunk) {
      const r = originalEnd(chunk);
      setTimeout(() => resolve(), 10);
      return r;
    };
  });

  try {
    await transport.handleRequest(req, res, parsedBody);
    await responseComplete;
    return res.getResult();
  } finally {
    await transport.close();
    await server.close();
  }
}

module.exports = {
  getMethod,
  parseJsonBody,
  handleStreamableMcpInvocation
};
