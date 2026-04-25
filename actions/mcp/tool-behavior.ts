import { getConfig } from "../shared/config";
import { getHomepageSummary, getProductDetail, listProducts } from "../shared/site";
import { RuntimeParams, ToolResult } from "../shared/types";
import {
  PRODUCT_DETAIL_WIDGET_URI,
  PRODUCT_LIST_WIDGET_URI,
  WHATS_NEW_WIDGET_URI,
  readWidgetResource
} from "../shared/widgets";

export function readResourceOrigin(runtimeParams: RuntimeParams): string | undefined {
  try {
    return getConfig(runtimeParams).siteBaseUrl.origin;
  } catch {
    return undefined;
  }
}

export function stringArg(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function numberArg(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

export function widgetToolMeta(uri: string): Record<string, unknown> {
  return {
    ui: {
      resourceUri: uri
    },
    "openai/outputTemplate": uri,
    "openai/widgetAccessible": true
  };
}

export async function listProductsTool(
  runtimeParams: RuntimeParams,
  args: Record<string, unknown>
): Promise<ToolResult<{ products: unknown[]; count: number; filters: { category?: string; query?: string } }>> {
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

export async function productDetailsTool(
  runtimeParams: RuntimeParams,
  args: Record<string, unknown>
): Promise<ToolResult<{ product: unknown }>> {
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

export async function homepageSummaryTool(runtimeParams: RuntimeParams): Promise<ToolResult<{ summary: unknown }>> {
  const config = getConfig(runtimeParams);
  const summary = await getHomepageSummary(config);
  return {
    content: [{ type: "text", text: `Fetched homepage summary for ${summary.title}.` }],
    structuredContent: { summary }
  };
}

export async function renderProductListTool(
  runtimeParams: RuntimeParams,
  args: Record<string, unknown>
): Promise<ToolResult<unknown>> {
  const fetched = Array.isArray(args.products)
    ? undefined
    : (await listProductsTool(runtimeParams, args)).structuredContent;
  const products = Array.isArray(args.products) ? args.products : fetched?.products || [];
  const structuredContent = {
    products,
    count: products.length,
    filters: {
      category: stringArg(args.category),
      query: stringArg(args.query)
    }
  };

  return renderResult(
    `Rendered ${products.length} product${products.length === 1 ? "" : "s"}.`,
    structuredContent,
    PRODUCT_LIST_WIDGET_URI
  );
}

export async function renderProductDetailTool(
  runtimeParams: RuntimeParams,
  args: Record<string, unknown>
): Promise<ToolResult<unknown>> {
  const fetched =
    args.product && typeof args.product === "object"
      ? undefined
      : (await productDetailsTool(runtimeParams, args)).structuredContent;
  const product =
    args.product && typeof args.product === "object" ? args.product : (fetched as { product: unknown }).product;

  return renderResult("Rendered product details.", { product }, PRODUCT_DETAIL_WIDGET_URI);
}

export async function renderWhatsNewTool(
  runtimeParams: RuntimeParams,
  args: Record<string, unknown>
): Promise<ToolResult<unknown>> {
  const fetched =
    args.summary && typeof args.summary === "object"
      ? undefined
      : (await homepageSummaryTool(runtimeParams)).structuredContent;
  const summary =
    args.summary && typeof args.summary === "object" ? args.summary : (fetched as { summary: unknown }).summary;

  return renderResult("Rendered homepage summary.", { summary }, WHATS_NEW_WIDGET_URI);
}

function renderResult(text: string, structuredContent: unknown, uri: string): ToolResult<unknown> {
  return {
    content: [{ type: "text", text }],
    structuredContent,
    _meta: widgetToolMeta(uri)
  };
}

export function readResourceContents(uri: string, runtimeParams: RuntimeParams) {
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
