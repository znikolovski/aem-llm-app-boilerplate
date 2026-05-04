import { runAction } from "../shared/action";
import { readBrandDisplayName } from "../shared/llm-config";
import { buildSpotlightUiBlocks } from "../shared/demo-payloads";
import { getMethod, jsonResponse, parseJsonBody, textResponse } from "../shared/http";
import type { RecommendToolResponse } from "../shared/ui-blocks";
import { RuntimeParams, RuntimeResponse } from "../shared/types";

/**
 * Second example tool: replace with promos, CMS highlights, or commerce features per brand.
 */
export async function main(params: RuntimeParams): Promise<RuntimeResponse> {
  return runAction(params, async () => {
    if (getMethod(params) !== "POST") {
      return textResponse("Method not allowed.", 405);
    }

    let body: { topic?: string };
    try {
      body = parseJsonBody(params) as { topic?: string };
    } catch {
      return jsonResponse({ error: "Request body must be valid JSON." }, 400);
    }

    const topic = typeof body.topic === "string" ? body.topic.trim() : "";
    if (!topic) {
      return jsonResponse({ error: "Field `topic` is required." }, 400);
    }

    const brand = readBrandDisplayName(params);
    const payload: RecommendToolResponse = {
      ui: buildSpotlightUiBlocks(topic, brand)
    };

    return jsonResponse(payload);
  });
}
