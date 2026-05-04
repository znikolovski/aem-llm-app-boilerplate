import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { runAction } from "../shared/action";
import { getMethod, jsonResponse } from "../shared/http";
import { RuntimeParams, RuntimeResponse } from "../shared/types";
import { createMcpAppBuilderServer } from "./create-server";
import { mcpGetSseNotSupportedResponse, mcpHealthCheckResponse, normalizeHeaders, parseMcpRequestBody } from "./openwhisk-streamable-http-shim";
import { openWhiskParamsToWebRequest, webResponseToRuntimeResponse } from "./web-streamable-request";

/**
 * MCP Streamable HTTP endpoint aligned with Adobe `generator-app-remote-mcp-server-generic`:
 * stateless transport per request, `enableJsonResponse: true`, base64-aware body parse, GET
 * health + graceful SSE refusal, extended CORS, action limits in `app.config.yaml`.
 *
 * POST uses `WebStandardStreamableHTTPServerTransport` because SDK 1.29’s
 * `StreamableHTTPServerTransport` delegates to `@hono/node-server`, which requires a full Node
 * `IncomingMessage` (the generator’s minimal shim no longer receives the written response body).
 */
async function handleMcpPost(params: RuntimeParams): Promise<RuntimeResponse> {
  const request = openWhiskParamsToWebRequest(params);
  const parsed = parseMcpRequestBody(params);
  const handleOpts = parsed != null ? { parsedBody: parsed } : undefined;

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true
  });
  const mcp = createMcpAppBuilderServer(params);

  try {
    await mcp.connect(transport);
    const response = await transport.handleRequest(request, handleOpts);
    return await webResponseToRuntimeResponse(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "MCP handler failed.";
    return {
      statusCode: 500,
      headers: {
        "access-control-allow-origin": "*",
        "content-type": "application/json; charset=utf-8"
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32603, message: `Internal server error: ${message}` },
        id: null
      })
    };
  } finally {
    await mcp.close().catch(() => undefined);
  }
}

export async function main(params: RuntimeParams): Promise<RuntimeResponse> {
  return runAction(params, async () => {
    const method = getMethod(params).toLowerCase();
    const incomingHeaders = normalizeHeaders(params.__ow_headers);

    switch (method) {
      case "get":
        if (incomingHeaders.accept?.includes("text/event-stream")) {
          return mcpGetSseNotSupportedResponse();
        }
        return mcpHealthCheckResponse();

      case "post":
        return handleMcpPost(params);

      default:
        return jsonResponse(
          {
            jsonrpc: "2.0",
            error: {
              code: -32000,
              message: `Method '${method}' not allowed. Supported: GET, POST, OPTIONS.`
            },
            id: null
          },
          405
        );
    }
  });
}
