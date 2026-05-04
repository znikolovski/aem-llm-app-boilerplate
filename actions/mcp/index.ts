import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { runAction } from "../shared/action";
import { getMethod, jsonResponse, textResponse } from "../shared/http";
import { RuntimeParams, RuntimeResponse } from "../shared/types";
import { createMcpAppBuilderServer } from "./create-server";
import { openWhiskParamsToWebRequest, parsedJsonBodyForMcp, webResponseToRuntimeResponse } from "./openwhisk-web-request";

/**
 * Streamable HTTP MCP endpoint for hosts such as ChatGPT MCP Apps.
 * Requires `raw-http: true` so JSON-RPC stays in `__ow_body`.
 */
export async function main(params: RuntimeParams): Promise<RuntimeResponse> {
  return runAction(params, async () => {
    const method = getMethod(params);
    if (method !== "GET" && method !== "POST" && method !== "DELETE") {
      return textResponse("Method not allowed.", 405);
    }

    const request = openWhiskParamsToWebRequest(params);
    const parsedBody = parsedJsonBodyForMcp(params);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined
    });
    const mcp = createMcpAppBuilderServer(params);

    try {
      await mcp.connect(transport);
      const response = await transport.handleRequest(request, { parsedBody });
      return await webResponseToRuntimeResponse(response, {
        sseAsPassthroughStream: method === "GET"
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "MCP handler failed.";
      return jsonResponse({ error: message }, 500);
    } finally {
      await mcp.close().catch(() => undefined);
    }
  });
}
