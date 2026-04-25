/*
Copyright 2022 Adobe. All rights reserved.
Tests adapted from adobe/generator-app-remote-mcp-server-generic.
 */

const { main } = require("../actions/mcp-server/index.js");

function jsonBody(result) {
  if (result.body == null) {
    return {};
  }
  if (typeof result.body === "string") {
    return JSON.parse(result.body || "{}");
  }
  return result.body;
}

function header(result, name) {
  const h = result.headers || {};
  return h[name] ?? h[name.toLowerCase()] ?? h[name[0].toUpperCase() + name.slice(1)];
}

describe("MCP MVP", () => {
  test("GET health", async () => {
    const result = await main({
      __ow_method: "get",
      __ow_path: "/",
      __ow_headers: { host: "localhost", accept: "application/json" },
      LOG_LEVEL: "error"
    });
    expect(result.statusCode).toBe(200);
    const ct = header(result, "content-type");
    expect(ct).toMatch(/application\/json/i);
    const body = jsonBody(result);
    expect(body.status).toBe("healthy");
    expect(body.transport).toBe("streamable-http");
  });

  test("OPTIONS CORS", async () => {
    const result = await main({ __ow_method: "options", LOG_LEVEL: "error" });
    expect(result.statusCode).toBe(200);
    expect(header(result, "access-control-allow-origin")).toBe("*");
  });

  test("initialize", async () => {
    const initRequest = {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "jest", version: "1.0.0" }
      }
    };
    const result = await main({
      __ow_method: "post",
      __ow_path: "/mcp-server",
      __ow_headers: {
        host: "localhost",
        accept: "application/json, text/event-stream",
        "content-type": "application/json"
      },
      __ow_body: JSON.stringify(initRequest),
      LOG_LEVEL: "error"
    });
    expect(result.statusCode).toBe(200);
    const body = jsonBody(result);
    expect(body.jsonrpc).toBe("2.0");
    expect(body.result.serverInfo.name).toBe("adobe-app-builder-mcp-mvp");
  });

  test("tools/list includes demo_rich_card", async () => {
    const result = await main({
      __ow_method: "post",
      __ow_path: "/mcp-server",
      __ow_headers: {
        host: "localhost",
        accept: "application/json, text/event-stream",
        "content-type": "application/json"
      },
      __ow_body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
      LOG_LEVEL: "error"
    });
    expect(result.statusCode).toBe(200);
    const body = jsonBody(result);
    const names = body.result.tools.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["echo", "calculator", "weather", "demo_rich_card"]));
  });

  test("demo_rich_card returns structuredContent and openai meta", async () => {
    const result = await main({
      __ow_method: "post",
      __ow_path: "/mcp-server",
      __ow_headers: {
        host: "localhost",
        accept: "application/json, text/event-stream",
        "content-type": "application/json"
      },
      __ow_body: JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "demo_rich_card", arguments: { title: "Test" } }
      }),
      LOG_LEVEL: "error"
    });
    expect(result.statusCode).toBe(200);
    const body = jsonBody(result);
    expect(body.result.structuredContent.title).toBe("Test");
    expect(body.result._meta["openai/outputTemplate"]).toContain("ui://widget/");
  });

  test("calculator 2+3", async () => {
    const result = await main({
      __ow_method: "post",
      __ow_path: "/mcp-server",
      __ow_headers: {
        host: "localhost",
        accept: "application/json, text/event-stream",
        "content-type": "application/json"
      },
      __ow_body: JSON.stringify({
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: { name: "calculator", arguments: { expression: "2+3" } }
      }),
      LOG_LEVEL: "error"
    });
    expect(result.statusCode).toBe(200);
    const body = jsonBody(result);
    expect(body.result.content[0].text).toMatch(/5/);
  });

  test("resources/read widget", async () => {
    const result = await main({
      __ow_method: "post",
      __ow_path: "/mcp-server",
      __ow_headers: {
        host: "localhost",
        accept: "application/json, text/event-stream",
        "content-type": "application/json"
      },
      __ow_body: JSON.stringify({
        jsonrpc: "2.0",
        id: 5,
        method: "resources/read",
        params: { uri: "ui://widget/hello.html" }
      }),
      LOG_LEVEL: "error"
    });
    expect(result.statusCode).toBe(200);
    const body = jsonBody(result);
    expect(body.result.contents[0].mimeType).toMatch(/text\/html/);
    expect(body.result.contents[0].text).toMatch(/Rich UI MVP/);
  });
});
