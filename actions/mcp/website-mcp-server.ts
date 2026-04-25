import type { CallToolResult } from "@modelcontextprotocol/sdk/types";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { RuntimeParams } from "../shared/types";
import { MCP_APP_MIME_TYPE, PRODUCT_DETAIL_WIDGET_URI, PRODUCT_LIST_WIDGET_URI, WHATS_NEW_WIDGET_URI } from "../shared/widgets";
import {
  homepageSummaryTool,
  listProductsTool,
  productDetailsTool,
  readResourceContents,
  renderProductDetailTool,
  renderProductListTool,
  renderWhatsNewTool
} from "./tool-behavior";

function toolResult(result: unknown): CallToolResult {
  return result as CallToolResult;
}

const listProductsArgs = z.object({
  category: z.string().optional(),
  query: z.string().optional(),
  limit: z.number().int().min(1).max(50).optional()
});

const productDetailsArgs = z.object({
  id: z.string().optional(),
  path: z.string().optional()
});

const renderListArgs = z.object({
  products: z.array(z.any()).optional(),
  category: z.string().optional(),
  query: z.string().optional(),
  limit: z.number().int().min(1).max(50).optional()
});

const renderDetailArgs = z.object({
  product: z.any().optional(),
  id: z.string().optional(),
  path: z.string().optional()
});

const renderWhatsNewArgs = z.object({
  summary: z.any().optional()
});

/**
 * One MCP server instance per HTTP invocation (required for stateless Streamable HTTP transport).
 */
export function createWebsiteMcpServer(runtimeParams: RuntimeParams): McpServer {
  const server = new McpServer(
    {
      name: "adobe-app-builder-website-llm-app",
      version: "0.1.0"
    },
    {
      capabilities: {
        tools: {},
        resources: {}
      },
      instructions:
        "Use this read-only website app to discover products, inspect product details, and summarize the website homepage."
    }
  );

  const reg = server as unknown as {
    registerTool: (name: string, config: Record<string, unknown>, fn: (args: unknown) => Promise<CallToolResult>) => void;
  };

  reg.registerTool(
    "website.list_products",
    {
      title: "List products",
      description:
        "Use this when the user wants to discover products offered on the website. Filter by category when the user asks for a specific product category.",
      inputSchema: listProductsArgs,
      annotations: { readOnlyHint: true }
    },
    async (args: unknown) => toolResult(await listProductsTool(runtimeParams, args as Record<string, unknown>))
  );

  reg.registerTool(
    "website.get_product_details",
    {
      title: "Get product details",
      description:
        "Use this when the user asks about one specific product and you need details, facts, sections, or deep links back to the website.",
      inputSchema: productDetailsArgs,
      annotations: { readOnlyHint: true }
    },
    async (args: unknown) => toolResult(await productDetailsTool(runtimeParams, args as Record<string, unknown>))
  );

  reg.registerTool(
    "website.get_homepage_summary",
    {
      title: "Get homepage summary",
      description:
        "Use this when the user asks what is new, featured, or important on the company's website homepage.",
      annotations: { readOnlyHint: true }
    },
    async () => toolResult(await homepageSummaryTool(runtimeParams))
  );

  reg.registerTool(
    "website.render_product_list",
    {
      title: "Render product list",
      description:
        "Use this after website.list_products when a rich visual product list would help the user compare options.",
      inputSchema: renderListArgs,
      annotations: { readOnlyHint: true },
      _meta: {
        ui: { resourceUri: PRODUCT_LIST_WIDGET_URI },
        "openai/outputTemplate": PRODUCT_LIST_WIDGET_URI,
        "openai/widgetAccessible": true
      }
    },
    async (args: unknown) => toolResult(await renderProductListTool(runtimeParams, args as Record<string, unknown>))
  );

  reg.registerTool(
    "website.render_product_detail",
    {
      title: "Render product detail",
      description:
        "Use this after website.get_product_details when a rich product detail view would help the user continue on the website.",
      inputSchema: renderDetailArgs,
      annotations: { readOnlyHint: true },
      _meta: {
        ui: { resourceUri: PRODUCT_DETAIL_WIDGET_URI },
        "openai/outputTemplate": PRODUCT_DETAIL_WIDGET_URI,
        "openai/widgetAccessible": true
      }
    },
    async (args: unknown) => toolResult(await renderProductDetailTool(runtimeParams, args as Record<string, unknown>))
  );

  reg.registerTool(
    "website.render_whats_new",
    {
      title: "Render what's new",
      description:
        "Use this after website.get_homepage_summary when a rich homepage summary view would help the user scan what is new.",
      inputSchema: renderWhatsNewArgs,
      annotations: { readOnlyHint: true },
      _meta: {
        ui: { resourceUri: WHATS_NEW_WIDGET_URI },
        "openai/outputTemplate": WHATS_NEW_WIDGET_URI,
        "openai/widgetAccessible": true
      }
    },
    async (args: unknown) => toolResult(await renderWhatsNewTool(runtimeParams, args as Record<string, unknown>))
  );

  server.registerResource(
    "product-list-widget",
    PRODUCT_LIST_WIDGET_URI,
    {
      description: "Interactive product listing cards.",
      mimeType: MCP_APP_MIME_TYPE
    },
    async () => readResourceContents(PRODUCT_LIST_WIDGET_URI, runtimeParams)
  );

  server.registerResource(
    "product-detail-widget",
    PRODUCT_DETAIL_WIDGET_URI,
    {
      description: "Interactive product detail view.",
      mimeType: MCP_APP_MIME_TYPE
    },
    async () => readResourceContents(PRODUCT_DETAIL_WIDGET_URI, runtimeParams)
  );

  server.registerResource(
    "whats-new-widget",
    WHATS_NEW_WIDGET_URI,
    {
      description: "Interactive homepage summary view.",
      mimeType: MCP_APP_MIME_TYPE
    },
    async () => readResourceContents(WHATS_NEW_WIDGET_URI, runtimeParams)
  );

  return server;
}
