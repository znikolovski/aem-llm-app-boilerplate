import { runAction } from "../shared/action";
import { getMethod, jsonResponse, textResponse } from "../shared/http";
import { RuntimeParams, RuntimeResponse } from "../shared/types";
import { handleStreamableMcpInvocation } from "./streamable-http";

export async function main(params: RuntimeParams): Promise<RuntimeResponse> {
  return runAction(params, async () => {
    const method = getMethod(params);

    if (method === "GET") {
      return jsonResponse({
        service: "mcp",
        transport: "streamable-http",
        hint: "Use POST with JSON-RPC and headers Accept: application/json, text/event-stream; Content-Type: application/json."
      });
    }

    if (method === "POST" || method === "DELETE") {
      return handleStreamableMcpInvocation(params);
    }

    return textResponse("Method not allowed.", 405);
  });
}
