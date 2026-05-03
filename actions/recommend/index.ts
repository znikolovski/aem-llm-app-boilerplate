import { runAction } from "../shared/action";
import { readBrandDisplayName } from "../shared/llm-config";
import { getMethod, jsonResponse, parseJsonBody, textResponse } from "../shared/http";
import type { RecommendToolResponse } from "../shared/ui-blocks";
import { RuntimeParams, RuntimeResponse } from "../shared/types";

/**
 * Example tool action: replace `demoHotels` with real fetch / commerce / CMS logic per brand.
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
      ui: demoHotels(location, brand)
    };

    return jsonResponse(payload);
  });
}

function demoHotels(location: string, brand: string): RecommendToolResponse["ui"] {
  const place = location.replace(/</g, "");
  return [
    {
      type: "text",
      content: `Sample results for “${place}” (${brand} boilerplate — wire your own data source).`
    },
    {
      type: "card",
      title: `${place} — Harbor View`,
      body: "Waterfront rooms, rooftop lounge, and easy airport access. Replace with real catalog data."
    },
    {
      type: "card",
      title: `${place} — Garden Inn`,
      body: "Quiet courtyard, family suites, complimentary breakfast. Demo card for UI contract testing."
    },
    {
      type: "table",
      columns: ["Property", "Neighborhood", "Notes"],
      rows: [
        ["Harbor View", "Waterfront", "Demo row"],
        ["Garden Inn", "Old Town", "Demo row"]
      ]
    }
  ];
}
