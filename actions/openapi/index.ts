import { runAction } from "../shared/action";
import { getConfig } from "../shared/config";
import { getMethod, jsonResponse, textResponse } from "../shared/http";
import { RuntimeParams, RuntimeResponse } from "../shared/types";

export async function main(params: RuntimeParams): Promise<RuntimeResponse> {
  return runAction(params, async () => {
    if (getMethod(params) !== "GET") {
      return textResponse("Method not allowed.", 405);
    }

    const config = getConfig(params);
    return jsonResponse(buildOpenApi(config.siteBaseUrl.toString()));
  });
}

function buildOpenApi(siteBaseUrl: string): unknown {
  return {
    openapi: "3.1.0",
    info: {
      title: "Website LLM App API",
      version: "0.1.0",
      description: "Public read-only REST API for products and homepage summaries sourced from an Edge Delivery Services site index."
    },
    servers: [{ url: "/" }],
    paths: {
      "/v1/products": {
        get: {
          operationId: "listProducts",
          summary: "List products discovered from the site index.",
          parameters: [
            { name: "category", in: "query", schema: { type: "string" } },
            { name: "q", in: "query", schema: { type: "string" } },
            { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 50 } }
          ],
          responses: {
            "200": {
              description: "Product list.",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ProductListResponse" } } }
            }
          }
        }
      },
      "/v1/products/{id}": {
        get: {
          operationId: "getProductDetails",
          summary: "Get details for one product.",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": {
              description: "Product details.",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ProductDetail" } } }
            },
            "404": { description: "Product not found." }
          }
        }
      },
      "/v1/whats-new": {
        get: {
          operationId: "getWhatsNew",
          summary: "Summarize the website homepage.",
          responses: {
            "200": {
              description: "Homepage summary.",
              content: { "application/json": { schema: { $ref: "#/components/schemas/HomepageSummary" } } }
            }
          }
        }
      }
    },
    components: {
      schemas: {
        ProductSummary: {
          type: "object",
          required: ["id", "title", "description", "category", "tags", "url", "path"],
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            description: { type: "string" },
            category: { type: "string" },
            tags: { type: "array", items: { type: "string" } },
            image: { type: "string" },
            url: { type: "string" },
            path: { type: "string" },
            lastModified: { type: "string" }
          }
        },
        ProductListResponse: {
          type: "object",
          properties: {
            data: { type: "array", items: { $ref: "#/components/schemas/ProductSummary" } },
            count: { type: "integer" }
          }
        },
        ProductDetail: {
          allOf: [
            { $ref: "#/components/schemas/ProductSummary" },
            {
              type: "object",
              properties: {
                sections: { type: "array", items: { $ref: "#/components/schemas/ContentSection" } },
                facts: { type: "array", items: { $ref: "#/components/schemas/KeyFact" } },
                ctaLinks: { type: "array", items: { $ref: "#/components/schemas/LinkItem" } },
                deepLinks: { type: "array", items: { $ref: "#/components/schemas/LinkItem" } }
              }
            }
          ]
        },
        HomepageSummary: {
          type: "object",
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            sections: { type: "array", items: { $ref: "#/components/schemas/ContentSection" } },
            highlights: { type: "array", items: { $ref: "#/components/schemas/LinkItem" } },
            sourceLinks: { type: "array", items: { $ref: "#/components/schemas/LinkItem" } }
          }
        },
        ContentSection: {
          type: "object",
          properties: {
            title: { type: "string" },
            text: { type: "string" }
          }
        },
        KeyFact: {
          type: "object",
          properties: {
            label: { type: "string" },
            value: { type: "string" }
          }
        },
        LinkItem: {
          type: "object",
          properties: {
            label: { type: "string" },
            url: { type: "string" }
          }
        }
      }
    },
    "x-source-site": siteBaseUrl
  };
}
