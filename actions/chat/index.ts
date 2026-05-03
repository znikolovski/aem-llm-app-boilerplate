import OpenAI from "openai";
import { Readable } from "node:stream";
import { runAction } from "../shared/action";
import { ConfigError } from "../shared/config";
import { readOpenAiApiKey, readOpenAiModel, readBrandDisplayName } from "../shared/llm-config";
import { getMethod, jsonResponse, parseJsonBody, sseStreamResponse, textResponse } from "../shared/http";
import { RuntimeParams, RuntimeResponse } from "../shared/types";

const RECOMMEND_TOOL = {
  type: "function" as const,
  name: "recommend",
  description:
    "Fetch structured UI blocks (hotel-style cards) for a geographic location. Call this when the user asks for travel, hotels, or recommendations in a place.",
  strict: false,
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      location: { type: "string", description: "City, region, or country to recommend for." }
    },
    required: ["location"]
  }
};

const SPOTLIGHT_TOOL = {
  type: "function" as const,
  name: "spotlight",
  description:
    "Fetch structured UI blocks for a marketing or editorial spotlight. Call when the user asks to highlight a campaign, seasonal theme, product line, or audience-specific message.",
  strict: false,
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      topic: { type: "string", description: "Short label for what to spotlight (campaign, season, segment, etc.)." }
    },
    required: ["topic"]
  }
};

export async function main(params: RuntimeParams): Promise<RuntimeResponse> {
  return runAction(params, async () => {
    if (getMethod(params) !== "POST") {
      return textResponse("Method not allowed.", 405);
    }

    let body: { message?: string };
    try {
      body = parseJsonBody(params) as { message?: string };
    } catch {
      return jsonResponse({ error: "Request body must be valid JSON." }, 400);
    }

    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message) {
      return jsonResponse({ error: "Field `message` is required." }, 400);
    }

    let apiKey: string;
    try {
      apiKey = readOpenAiApiKey(params);
    } catch (error) {
      if (error instanceof ConfigError) {
        return jsonResponse({ error: error.message }, 503);
      }
      throw error;
    }

    const model = readOpenAiModel(params);
    const brand = readBrandDisplayName(params);
    const client = new OpenAI({ apiKey });

    let stream;
    try {
      stream = client.responses.stream({
        model,
        input: message,
        instructions: `You are a helpful assistant for ${brand}.
- For hotels, travel, or place-based ideas: call recommend with a clear location string.
- For campaigns, promos, seasonal highlights, or “spotlight” style asks: call spotlight with a concise topic label.
You may call multiple tools in one turn if the user clearly wants both structured experiences. Keep assistant prose brief when tools will supply the rich UI.`,
        tools: [RECOMMEND_TOOL, SPOTLIGHT_TOOL],
        tool_choice: "auto"
      });
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "Failed to start LLM stream.";
      return jsonResponse({ error: messageText }, 502);
    }

    const readable = Readable.from(
      (async function* () {
        try {
          for await (const event of stream) {
            yield `data: ${JSON.stringify(event)}\n\n`;
          }
        } catch (error) {
          const messageText = error instanceof Error ? error.message : "Stream error.";
          yield `data: ${JSON.stringify({ type: "stream.error", error: messageText })}\n\n`;
        }
      })()
    );

    return sseStreamResponse(readable);
  });
}
