import { ConfigError } from "./config";
import { RuntimeParams } from "./types";

export function readOpenAiApiKey(params: RuntimeParams): string {
  const key = readString(params, "OPENAI_API_KEY");
  if (!key) {
    throw new ConfigError("OPENAI_API_KEY is not configured for this deployment.");
  }
  return key;
}

export function readOpenAiModel(params: RuntimeParams): string {
  return readString(params, "OPENAI_MODEL") || "gpt-4o";
}

export function readBrandDisplayName(params: RuntimeParams): string {
  return readString(params, "BRAND_DISPLAY_NAME") || "Your brand";
}

function readString(params: RuntimeParams, key: string): string | undefined {
  const value = params[key] ?? process.env[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
