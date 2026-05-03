import { runAction } from "../shared/action";
import { readBrandDisplayName } from "../shared/llm-config";
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
      ui: demoSpotlight(topic, brand)
    };

    return jsonResponse(payload);
  });
}

function demoSpotlight(topic: string, brand: string): RecommendToolResponse["ui"] {
  const safe = topic.replace(/</g, "");
  return [
    {
      type: "text",
      content: `Spotlight for “${safe}” (${brand} boilerplate). Swap this action for real merchandising or editorial APIs.`
    },
    {
      type: "card",
      title: "Hero placement",
      body: `Primary slot aligned to: ${safe}. CTA and imagery should come from your headless source, not the LLM.`
    },
    {
      type: "card",
      title: "Supporting tiles",
      body: "Secondary promo tiles, A/B variants, or loyalty hooks — keep them as structured blocks like this."
    }
  ];
}
