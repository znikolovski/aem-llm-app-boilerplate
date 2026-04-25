import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { main as mcpMain } from "../actions/mcp/index";
import { RuntimeParams } from "../actions/shared/types";
import { runtimeJsonBody } from "./runtime-json-body";

const fixtures = join(process.cwd(), "test", "fixtures");
const indexPayload = readFileSync(join(fixtures, "index.json"), "utf8");
const productHtml = readFileSync(join(fixtures, "product.html"), "utf8");
const homeHtml = readFileSync(join(fixtures, "home.html"), "utf8");

const mcpInitializeParams = {
  protocolVersion: "2025-03-26",
  capabilities: {},
  clientInfo: { name: "unit-test", version: "0.0.0" }
};

function baseParams(body: unknown): RuntimeParams {
  return {
    __ow_method: "POST",
    __ow_path: "/api/v1/web/llm-website-app/mcp",
    __ow_headers: {
      accept: "application/json, text/event-stream",
      host: "www.example.com",
      "content-type": "application/json"
    },
    __ow_body: JSON.stringify(body),
    SITE_INDEX_URL: "https://www.example.com/query-index.json",
    SITE_BASE_URL: "https://www.example.com",
    HOMEPAGE_PATH: "/",
    INDEX_CACHE_TTL_SECONDS: "1"
  };
}

test("handles MCP initialize and tools list", async () => {
  const initialize = await mcpMain(
    baseParams({ jsonrpc: "2.0", id: 1, method: "initialize", params: mcpInitializeParams })
  );
  const initBody = runtimeJsonBody(initialize) as { result: { serverInfo: { name: string } } };
  assert.equal(initBody.result.serverInfo.name, "adobe-app-builder-website-llm-app");

  const tools = await mcpMain(baseParams({ jsonrpc: "2.0", id: 2, method: "tools/list" }));
  const toolsBody = runtimeJsonBody(tools) as { result: { tools: Array<{ name: string }> } };
  assert.ok(toolsBody.result.tools.some((tool: { name: string }) => tool.name === "website.list_products"));
});

test("calls list and render tools", async () => {
  mockFetch({
    "https://www.example.com/query-index.json": indexPayload,
    "https://www.example.com/products/platinum-rewards-card": productHtml,
    "https://www.example.com/": homeHtml
  });

  const list = await mcpMain(baseParams({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: {
      name: "website.list_products",
      arguments: { category: "Credit Cards" }
    }
  }));
  const listBody = runtimeJsonBody(list) as { result: { structuredContent: { count: number } } };
  assert.equal(listBody.result.structuredContent.count, 1);

  const render = await mcpMain(baseParams({
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: {
      name: "website.render_product_list",
      arguments: listBody.result.structuredContent
    }
  }));
  const renderBody = runtimeJsonBody(render) as { result: { _meta: { ui: { resourceUri: string } } } };
  assert.equal(renderBody.result._meta.ui.resourceUri, "ui://widget/product-list.html");
});

test("serves widget resources", async () => {
  const response = await mcpMain(baseParams({
    jsonrpc: "2.0",
    id: 5,
    method: "resources/read",
    params: { uri: "ui://widget/product-detail.html" }
  }));
  const body = runtimeJsonBody(response) as {
    result: { contents: Array<{ mimeType: string; text: string; _meta: { ui: { csp: { resourceDomains: string[] } } } }> };
  };
  assert.equal(body.result.contents[0].mimeType, "text/html;profile=mcp-app");
  assert.deepEqual(body.result.contents[0]._meta.ui.csp.resourceDomains, ["https://www.example.com"]);
  assert.match(body.result.contents[0].text, /Product details are not available/);
});

function mockFetch(routes: Record<string, string>): void {
  globalThis.fetch = async (input: URL | RequestInfo) => {
    const url = input instanceof URL ? input.toString() : typeof input === "string" ? input : input.url;
    const body = routes[url];
    if (body == null) {
      return new Response("Not found", { status: 404 });
    }
    return new Response(body, { status: 200 });
  };
}
