/*
Copyright 2022 Adobe. All rights reserved.
Licensed under the Apache License, Version 2.0.
MVP MCP server for Adobe I/O Runtime — derived from
https://github.com/adobe/generator-app-remote-mcp-server-generic
with OpenWhisk response normalization and Streamable HTTP shims.
 */

const { Core } = require("@adobe/aio-sdk");
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { registerTools, registerResources, registerPrompts } = require("./tools.js");
const { normalizeOpenWhiskWebResponse } = require("./normalize-response.js");
const { handleStreamableMcpInvocation } = require("./shim.js");

/** @type {ReturnType<Core.Logger> | null} */
let logger = null;

function wrap(result) {
  return normalizeOpenWhiskWebResponse(result);
}

function serverName() {
  try {
    return require("../../package.json").name || "app-builder-mcp-mvp";
  } catch {
    return "app-builder-mcp-mvp";
  }
}

function createMcpServer() {
  const name = serverName();
  const srv = new McpServer(
    { name, version: "1.0.0" },
    {
      capabilities: {
        logging: {},
        tools: {},
        resources: {},
        prompts: {}
      }
    }
  );
  registerTools(srv);
  registerResources(srv);
  registerPrompts(srv);
  if (logger) {
    logger.info("MCP server ready (tools, resources, prompts)");
  }
  return srv;
}

function handleHealthCheck() {
  return wrap({
    statusCode: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS, DELETE",
      "Access-Control-Allow-Headers":
        "Content-Type, Accept, Authorization, x-api-key, mcp-session-id, Last-Event-ID, mcp-protocol-version",
      "Access-Control-Expose-Headers": "Content-Type, mcp-session-id, Last-Event-ID",
      "Access-Control-Max-Age": "86400",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      status: "healthy",
      server: serverName(),
      version: "1.0.0",
      transport: "streamable-http",
      sdk: "@modelcontextprotocol/sdk",
      timestamp: new Date().toISOString()
    })
  });
}

function handleOptionsRequest() {
  return wrap({
    statusCode: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS, DELETE",
      "Access-Control-Allow-Headers":
        "Content-Type, Accept, Authorization, x-api-key, mcp-session-id, Last-Event-ID, mcp-protocol-version",
      "Access-Control-Expose-Headers": "Content-Type, mcp-session-id, Last-Event-ID",
      "Access-Control-Max-Age": "86400"
    },
    body: ""
  });
}

async function handleMcpRequest(params) {
  const raw = await handleStreamableMcpInvocation(params, createMcpServer);
  return wrap(raw);
}

/**
 * @param {Record<string, unknown>} params
 */
async function main(params) {
  try {
    try {
      logger = Core.Logger(serverName(), { level: params.LOG_LEVEL || "info" });
    } catch (e) {
      logger = null;
    }

    const method = String(params.__ow_method || "get").toLowerCase();
    const incoming = {};
    const h = params.__ow_headers || {};
    for (const key in h) {
      if (Object.prototype.hasOwnProperty.call(h, key) && typeof h[key] === "string") {
        incoming[key.toLowerCase()] = h[key];
      }
    }

    if (method === "get") {
      if (incoming.accept && incoming.accept.includes("text/event-stream")) {
        return wrap({
          statusCode: 200,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache"
          },
          body:
            'event: error\ndata: {"error":"SSE is not supported on serverless. Use streamable HTTP (POST with JSON-RPC)."}\n\n'
        });
      }
      return handleHealthCheck();
    }

    if (method === "options") {
      return handleOptionsRequest();
    }

    if (method === "post") {
      return await handleMcpRequest(params);
    }

    return wrap({
      statusCode: 405,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32000, message: `Method ${method} not allowed` },
        id: null
      })
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    if (logger) {
      logger.error(message);
    }
    return wrap({
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32603, message },
        id: null
      })
    });
  }
}

module.exports = { main };
