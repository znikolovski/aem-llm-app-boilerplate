import { AppConfig, RuntimeParams } from "./types";

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export function getConfig(params: RuntimeParams): AppConfig {
  const siteIndexUrlValue = readString(params, "SITE_INDEX_URL");
  const siteBaseUrlValue = readString(params, "SITE_BASE_URL");

  if (!siteIndexUrlValue) {
    throw new ConfigError("SITE_INDEX_URL is required.");
  }

  if (!siteBaseUrlValue) {
    throw new ConfigError("SITE_BASE_URL is required.");
  }

  const siteIndexUrl = parseHttpUrl(siteIndexUrlValue, "SITE_INDEX_URL");
  const siteBaseUrl = parseHttpUrl(siteBaseUrlValue, "SITE_BASE_URL");
  const homepagePath = normalizePath(readString(params, "HOMEPAGE_PATH") || "/");
  const ttlSeconds = readPositiveInteger(params, "INDEX_CACHE_TTL_SECONDS", 300);
  const conversationUrlTemplate = readString(params, "CONVERSATION_URL_TEMPLATE");

  return {
    siteIndexUrl,
    siteBaseUrl,
    homepagePath,
    indexCacheTtlMs: ttlSeconds * 1000,
    conversationUrlTemplate: conversationUrlTemplate || undefined
  };
}

function readString(params: RuntimeParams, key: string): string | undefined {
  const value = params[key] ?? process.env[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readPositiveInteger(params: RuntimeParams, key: string, fallback: number): number {
  const value = readString(params, key);
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseHttpUrl(value: string, key: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ConfigError(`${key} must be a valid URL.`);
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new ConfigError(`${key} must use http or https.`);
  }

  return url;
}

export function normalizePath(value: string): string {
  if (!value || value === "/") {
    return "/";
  }

  const withoutHash = value.split("#", 1)[0];
  const withoutQuery = withoutHash.split("?", 1)[0];
  return withoutQuery.startsWith("/") ? withoutQuery : `/${withoutQuery}`;
}
