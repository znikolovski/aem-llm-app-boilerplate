import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readBrandDisplayName } from "../shared/llm-config";
import { buildRecommendUiBlocks, buildSpotlightUiBlocks } from "../shared/demo-payloads";
import { RuntimeParams } from "../shared/types";

/**
 * MCP server exposing the same structured tools as the REST surface (recommend, spotlight).
 * ChatGPT and other MCP hosts connect over Streamable HTTP at `/v1/mcp`.
 */
export function createMcpAppBuilderServer(params: RuntimeParams): McpServer {
  const brand = readBrandDisplayName(params);
  const server = new McpServer(
    { name: "llm-app", version: "0.1.0" },
    {
      capabilities: { tools: { listChanged: true } },
      instructions: `This server belongs to “${brand}”. Tools return structured UI blocks (never raw HTML). Use recommend for place-based stays and travel; use spotlight for campaigns, seasonal promos, or editorial highlights. Prefer structuredContent.ui when rendering in the host.`
    }
  );

  const reg = server as unknown as {
    registerTool: (
      name: string,
      config: { description: string; inputSchema: Record<string, z.ZodTypeAny> },
      handler: (args: Record<string, unknown>) => Promise<unknown>
    ) => void;
  };

  reg.registerTool(
    "recommend",
    {
      description: "Return structured UI blocks (cards, tables) for hotels and travel options in a location.",
      inputSchema: {
        location: z.string().describe("City, region, or country.")
      }
    },
    async (args) => {
      const location = String(args.location ?? "");
      const ui = buildRecommendUiBlocks(location, brand);
      return {
        content: [
          {
            type: "text",
            text: `Structured UI blocks for “${location}”. Use structuredContent.ui in the host.`
          }
        ],
        structuredContent: { ui }
      };
    }
  );

  reg.registerTool(
    "spotlight",
    {
      description: "Return structured UI blocks for a marketing or editorial spotlight.",
      inputSchema: {
        topic: z.string().describe("Campaign, season, or audience label.")
      }
    },
    async (args) => {
      const topic = String(args.topic ?? "");
      const ui = buildSpotlightUiBlocks(topic, brand);
      return {
        content: [{ type: "text", text: `Structured spotlight blocks for “${topic}”.` }],
        structuredContent: { ui }
      };
    }
  );

  return server;
}
