import { runAction, statusFromError } from "../shared/action";
import { getConfig } from "../shared/config";
import { getMethod, jsonResponse, parseJsonBody, textResponse } from "../shared/http";
import { getHomepageSummary, getProductDetail, listProducts } from "../shared/site";
import { RuntimeParams, RuntimeResponse, ToolResult } from "../shared/types";
import {
  PRODUCT_DETAIL_WIDGET_URI,
  PRODUCT_LIST_WIDGET_URI,
  WHATS_NEW_WIDGET_URI,
  listWidgetResources,
  readWidgetResource
} from "../shared/widgets";

type JsonRpcId = string | number | null;

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: unknown;
}

interface ToolCallParams {
  name?: string;
  arguments?: Record<string, unknown>;
}

class RpcError extends Error {
  code: number;
  data?: unknown;

  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.name = "RpcError";
    this.code = code;
    this.data = data;
  }
}

export async function main(params: RuntimeParams): Promise<RuntimeResponse> {
  return runAction(params, async () => {
    if (getMethod(params) !== "POST") {
      return textResponse("Method not allowed.", 405);
    }

    const payload = parseJsonBody(params);
    const requests = Array.isArray(payload) ? payload : [payload];
    const responses = [];

    for (const item of requests) {
      const request = parseRpcRequest(item);
      const hasId = Object.prototype.hasOwnProperty.call(request, "id");
      if (!hasId) {
        await handleRpcRequest(request, params);
        continue;
      }

      try {
        responses.push({
          jsonrpc: "2.0",
          id: request.id ?? null,
          result: await handleRpcRequest(request, params)
        });
      } catch (error) {
        responses.push({
          jsonrpc: "2.0",
          id: request.id ?? null,
          error: serializeRpcError(error)
        });
      }
    }

    if (!responses.length) {
      return jsonResponse(null, 202);
    }

    return jsonResponse(Array.isArray(payload) ? responses : responses[0]);
  });
}

function parseRpcRequest(value: unknown): JsonRpcRequest {
  if (!value || typeof value !== "object") {
    throw new RpcError(-32600, "Invalid JSON-RPC request.");
  }

  const request = value as Partial<JsonRpcRequest>;
  if (request.jsonrpc !== "2.0" || typeof request.method !== "string") {
    throw new RpcError(-32600, "Invalid JSON-RPC request.");
  }

  return request as JsonRpcRequest;
}

async function handleRpcRequest(request: JsonRpcRequest, runtimeParams: RuntimeParams): Promise<unknown> {
  switch (request.method) {
    case "initialize":
      return {
        protocolVersion: readProtocolVersion(request.params),
        capabilities: {
          tools: {},
          resources: {}
        },
        serverInfo: {
          name: "adobe-app-builder-website-llm-app",
          version: "0.1.0"
        },
        instructions:
          "Use this read-only website app to discover products, inspect product details, and summarize the website homepage."
      };
    case "ping":
      return {};
    case "tools/list":
      return { tools: getToolDescriptors() };
    case "tools/call":
      return callTool(runtimeParams, request.params);
    case "resources/list":
      return {
        resources: listWidgetResources(readResourceOrigin(runtimeParams)).map(({ text: _text, ...resource }) => resource)
      };
    case "resources/read":
      return readResource(request.params, runtimeParams);
    case "resources/templates/list":
    case "prompts/list":
      return { items: [] };
    default:
      throw new RpcError(-32601, `Unsupported method: ${request.method}`);
  }
}

async function callTool(runtimeParams: RuntimeParams, rawParams: unknown): Promise<ToolResult<unknown>> {
  const params = parseToolCallParams(rawParams);
  const args = params.arguments || {};

  switch (params.name) {
    case "website.list_products":
      return listProductsTool(runtimeParams, args);
    case "website.get_product_details":
      return productDetailsTool(runtimeParams, args);
    case "website.get_homepage_summary":
      return homepageSummaryTool(runtimeParams);
    case "website.render_product_list":
      return renderProductListTool(runtimeParams, args);
    case "website.render_product_detail":
      return renderProductDetailTool(runtimeParams, args);
    case "website.render_whats_new":
      return renderWhatsNewTool(runtimeParams, args);
    default:
      throw new RpcError(-32601, `Unknown tool: ${params.name || ""}`);
  }
}

async function listProductsTool(runtimeParams: RuntimeParams, args: Record<string, unknown>): Promise<ToolResult<unknown>> {
  const config = getConfig(runtimeParams);
  const products = await listProducts(config, {
    category: stringArg(args.category),
    query: stringArg(args.query),
    limit: numberArg(args.limit)
  });
  const structuredContent = {
    products,
    count: products.length,
    filters: {
      category: stringArg(args.category),
      query: stringArg(args.query)
    }
  };
  return {
    content: [{ type: "text", text: `Found ${products.length} product${products.length === 1 ? "" : "s"}.` }],
    structuredContent
  };
}

async function productDetailsTool(runtimeParams: RuntimeParams, args: Record<string, unknown>): Promise<ToolResult<unknown>> {
  const config = getConfig(runtimeParams);
  const product = await getProductDetail(config, {
    id: stringArg(args.id),
    path: stringArg(args.path)
  });
  return {
    content: [{ type: "text", text: `Fetched product details for ${product.title}.` }],
    structuredContent: { product }
  };
}

async function homepageSummaryTool(runtimeParams: RuntimeParams): Promise<ToolResult<unknown>> {
  const config = getConfig(runtimeParams);
  const summary = await getHomepageSummary(config);
  return {
    content: [{ type: "text", text: `Fetched homepage summary for ${summary.title}.` }],
    structuredContent: { summary }
  };
}

async function renderProductListTool(runtimeParams: RuntimeParams, args: Record<string, unknown>): Promise<ToolResult<unknown>> {
  const fetched = Array.isArray(args.products)
    ? undefined
    : ((await listProductsTool(runtimeParams, args)).structuredContent as { products: unknown[] });
  const products = Array.isArray(args.products)
    ? args.products
    : fetched?.products || [];
  const structuredContent = {
    products,
    count: products.length,
    filters: {
      category: stringArg(args.category),
      query: stringArg(args.query)
    }
  };

  return renderResult(`Rendered ${products.length} product${products.length === 1 ? "" : "s"}.`, structuredContent, PRODUCT_LIST_WIDGET_URI);
}

async function renderProductDetailTool(runtimeParams: RuntimeParams, args: Record<string, unknown>): Promise<ToolResult<unknown>> {
  const fetched = args.product && typeof args.product === "object"
    ? undefined
    : ((await productDetailsTool(runtimeParams, args)).structuredContent as { product: unknown });
  const product = args.product && typeof args.product === "object"
    ? args.product
    : fetched?.product;

  return renderResult("Rendered product details.", { product }, PRODUCT_DETAIL_WIDGET_URI);
}

async function renderWhatsNewTool(runtimeParams: RuntimeParams, args: Record<string, unknown>): Promise<ToolResult<unknown>> {
  const fetched = args.summary && typeof args.summary === "object"
    ? undefined
    : ((await homepageSummaryTool(runtimeParams)).structuredContent as { summary: unknown });
  const summary = args.summary && typeof args.summary === "object"
    ? args.summary
    : fetched?.summary;

  return renderResult("Rendered homepage summary.", { summary }, WHATS_NEW_WIDGET_URI);
}

function renderResult(text: string, structuredContent: unknown, uri: string): ToolResult<unknown> {
  return {
    content: [{ type: "text", text }],
    structuredContent,
    _meta: widgetToolMeta(uri)
  };
}

function readResource(rawParams: unknown, runtimeParams: RuntimeParams): unknown {
  const params = rawParams && typeof rawParams === "object" ? (rawParams as Record<string, unknown>) : {};
  const uri = stringArg(params.uri);
  if (!uri) {
    throw new RpcError(-32602, "Resource uri is required.");
  }

  const resource = readWidgetResource(uri, readResourceOrigin(runtimeParams));
  return {
    contents: [
      {
        uri: resource.uri,
        mimeType: resource.mimeType,
        text: resource.text,
        _meta: resource._meta
      }
    ]
  };
}

function readResourceOrigin(runtimeParams: RuntimeParams): string | undefined {
  try {
    return getConfig(runtimeParams).siteBaseUrl.origin;
  } catch {
    return undefined;
  }
}

function parseToolCallParams(rawParams: unknown): ToolCallParams {
  if (!rawParams || typeof rawParams !== "object") {
    throw new RpcError(-32602, "Tool call params are required.");
  }

  const params = rawParams as ToolCallParams;
  if (!params.name) {
    throw new RpcError(-32602, "Tool name is required.");
  }

  return params;
}

function getToolDescriptors(): unknown[] {
  return [
    {
      name: "website.list_products",
      title: "List products",
      description:
        "Use this when the user wants to discover products offered on the website. Filter by category when the user asks for a specific product category.",
      inputSchema: {
        type: "object",
        properties: {
          category: { type: "string", description: "Optional product category, such as credit cards." },
          query: { type: "string", description: "Optional text search over product title, description, tags, and path." },
          limit: { type: "integer", minimum: 1, maximum: 50, default: 24 }
        }
      },
      annotations: { readOnlyHint: true }
    },
    {
      name: "website.get_product_details",
      title: "Get product details",
      description:
        "Use this when the user asks about one specific product and you need details, facts, sections, or deep links back to the website.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Product id from website.list_products." },
          path: { type: "string", description: "Product page path when an id is not available." }
        },
        anyOf: [{ required: ["id"] }, { required: ["path"] }]
      },
      annotations: { readOnlyHint: true }
    },
    {
      name: "website.get_homepage_summary",
      title: "Get homepage summary",
      description:
        "Use this when the user asks what is new, featured, or important on the company's website homepage.",
      inputSchema: { type: "object", properties: {} },
      annotations: { readOnlyHint: true }
    },
    {
      name: "website.render_product_list",
      title: "Render product list",
      description:
        "Use this after website.list_products when a rich visual product list would help the user compare options.",
      inputSchema: {
        type: "object",
        properties: {
          products: { type: "array", description: "ProductSummary objects to render." },
          category: { type: "string" },
          query: { type: "string" },
          limit: { type: "integer", minimum: 1, maximum: 50 }
        }
      },
      annotations: { readOnlyHint: true },
      _meta: widgetToolMeta(PRODUCT_LIST_WIDGET_URI)
    },
    {
      name: "website.render_product_detail",
      title: "Render product detail",
      description:
        "Use this after website.get_product_details when a rich product detail view would help the user continue on the website.",
      inputSchema: {
        type: "object",
        properties: {
          product: { type: "object", description: "ProductDetail object to render." },
          id: { type: "string" },
          path: { type: "string" }
        }
      },
      annotations: { readOnlyHint: true },
      _meta: widgetToolMeta(PRODUCT_DETAIL_WIDGET_URI)
    },
    {
      name: "website.render_whats_new",
      title: "Render what's new",
      description:
        "Use this after website.get_homepage_summary when a rich homepage summary view would help the user scan what is new.",
      inputSchema: {
        type: "object",
        properties: {
          summary: { type: "object", description: "HomepageSummary object to render." }
        }
      },
      annotations: { readOnlyHint: true },
      _meta: widgetToolMeta(WHATS_NEW_WIDGET_URI)
    }
  ];
}

function widgetToolMeta(uri: string): Record<string, unknown> {
  return {
    ui: {
      resourceUri: uri
    },
    "openai/outputTemplate": uri,
    "openai/widgetAccessible": true
  };
}

function readProtocolVersion(params: unknown): string {
  if (params && typeof params === "object" && typeof (params as Record<string, unknown>).protocolVersion === "string") {
    return (params as Record<string, string>).protocolVersion;
  }

  return "2025-03-26";
}

function serializeRpcError(error: unknown): { code: number; message: string; data?: unknown } {
  if (error instanceof RpcError) {
    return { code: error.code, message: error.message, data: error.data };
  }

  const status = statusFromError(error);
  const message = error instanceof Error ? error.message : "Unexpected error.";
  return { code: status >= 500 ? -32000 : -32602, message };
}

function stringArg(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberArg(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}
