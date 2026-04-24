import { createHash } from "node:crypto";
import { AppConfig } from "./types";
import { normalizePath } from "./config";

export function stableId(input: string): string {
  const slug = slugify(input.split("/").filter(Boolean).pop() || input || "item");
  const hash = createHash("sha1").update(input).digest("hex").slice(0, 8);
  return `${slug || "item"}-${hash}`;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function normalizeUrlOrPath(value: unknown, config: AppConfig): { url: string; path: string } | undefined {
  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }

  const resolved = resolveSiteUrl(value, config);
  return {
    url: resolved.toString(),
    path: normalizePath(resolved.pathname)
  };
}

export function resolveSiteUrl(value: string, config: AppConfig): URL {
  const resolved = new URL(value, config.siteBaseUrl);

  if (!isSameOrigin(resolved, config.siteBaseUrl)) {
    throw new Error(`Blocked cross-origin website URL: ${resolved.toString()}`);
  }

  return resolved;
}

export function maybeResolveSiteUrl(value: unknown, config: AppConfig): string | undefined {
  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }

  try {
    return resolveSiteUrl(value, config).toString();
  } catch {
    return undefined;
  }
}

export function isSameOrigin(left: URL, right: URL): boolean {
  return left.protocol === right.protocol && left.host === right.host;
}

export function createConversationUrl(template: string | undefined, replacements: Record<string, string>): string | undefined {
  if (!template) {
    return undefined;
  }

  return template.replace(/\{(url|path|id)\}/g, (_match, key: string) => {
    return encodeURIComponent(replacements[key] || "");
  });
}
