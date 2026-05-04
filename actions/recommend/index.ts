import { runAction } from "../shared/action";
import { readBrandDisplayName } from "../shared/llm-config";
import { buildRecommendUiBlocks } from "../shared/demo-payloads";
import { getMethod, jsonResponse, parseJsonBody, textResponse } from "../shared/http";
import type { RecommendToolResponse } from "../shared/ui-blocks";
import { RuntimeParams, RuntimeResponse } from "../shared/types";

/**
 * Example tool action: replace `buildRecommendUiBlocks` with real fetch / commerce / CMS logic per brand.
 */
export async function main(params: RuntimeParams): Promise<RuntimeResponse> {
  return runAction(params, async () => {
    if (getMethod(params) !== "POST") {
      return textResponse("Method not allowed.", 405);
    }

    let body: { location?: string };
    try {
      body = parseJsonBody(params) as { location?: string };
    } catch {
      return jsonResponse({ error: "Request body must be valid JSON." }, 400);
    }

    const location = typeof body.location === "string" ? body.location.trim() : "";
    if (!location) {
      return jsonResponse({ error: "Field `location` is required." }, 400);
    }

    const brand = readBrandDisplayName(params);
    const payload: RecommendToolResponse = {
      ui: buildRecommendUiBlocks(location, brand)
    };

    return jsonResponse(payload);
  });
}
