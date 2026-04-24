import { AppConfig, HomepageSummary, LinkItem, ProductDetail, ProductListOptions, ProductSummary, RawIndexRecord } from "./types";
import { extractPage, extractProductFacts, truncateText } from "./content";
import { createConversationUrl, maybeResolveSiteUrl, normalizeUrlOrPath, resolveSiteUrl, stableId, slugify } from "./url";

interface CachedIndex {
  key: string;
  expiresAt: number;
  rows: RawIndexRecord[];
}

let cachedIndex: CachedIndex | undefined;

export async function listProducts(config: AppConfig, options: ProductListOptions = {}): Promise<ProductSummary[]> {
  const rows = await loadIndex(config);
  const products = normalizeProducts(rows, config);
  const category = normalizeFilter(options.category);
  const query = normalizeFilter(options.query);
  const limit = clampLimit(options.limit, 24, 50);

  return products
    .filter((product) => {
      if (category && !matchesCategory(product, category)) {
        return false;
      }

      if (query && !matchesQuery(product, query)) {
        return false;
      }

      return true;
    })
    .slice(0, limit);
}

export async function getProductDetail(
  config: AppConfig,
  input: { id?: string; path?: string }
): Promise<ProductDetail> {
  const rows = await loadIndex(config);
  const products = normalizeProducts(rows, config);
  const target = findProduct(products, input);

  if (!target) {
    throw new Error("Product not found.");
  }

  const pageUrl = resolveSiteUrl(target.url, config);
  const html = await fetchText(pageUrl);
  const page = extractPage(html, config);
  const schemaFacts = extractProductFacts(page.jsonLd);
  const facts = uniqueFacts([
    { label: "Category", value: target.category },
    ...schemaFacts,
    ...(target.lastModified ? [{ label: "Last modified", value: target.lastModified }] : [])
  ]);
  const ctaLinks = findCtaLinks(page.links).slice(0, 8);
  const conversationUrl = createConversationUrl(config.conversationUrlTemplate, {
    id: target.id,
    path: target.path,
    url: target.url
  });
  const deepLinks: LinkItem[] = [
    { label: "Open on website", url: target.url },
    ...(conversationUrl ? [{ label: "Continue conversation", url: conversationUrl }] : []),
    ...ctaLinks
  ];

  return {
    ...target,
    title: page.title || target.title,
    description: page.description || target.description,
    sections: page.sections.slice(0, 6),
    facts,
    ctaLinks,
    deepLinks: uniqueLinks(deepLinks).slice(0, 10),
    source: {
      index: config.siteIndexUrl.toString(),
      page: pageUrl.toString()
    }
  };
}

export async function getHomepageSummary(config: AppConfig): Promise<HomepageSummary> {
  const rows = await loadIndex(config);
  const homepageUrl = resolveSiteUrl(config.homepagePath, config);
  const html = await fetchText(homepageUrl);
  const page = extractPage(html, config);
  const indexHome = findHomepageRecord(rows, config);
  const indexTitle = readString(indexHome, ["title", "name"]);
  const indexDescription = readString(indexHome, ["description", "summary"]);
  const highlights = findHomepageHighlights(page.links).slice(0, 8);

  return {
    title: page.title || indexTitle || "Homepage",
    description: page.description || indexDescription || page.heroText,
    hero: page.sections[0],
    sections: page.sections.slice(0, 8),
    highlights,
    sourceLinks: page.links.slice(0, 12),
    source: {
      index: config.siteIndexUrl.toString(),
      page: homepageUrl.toString()
    }
  };
}

export function normalizeProducts(rows: RawIndexRecord[], config: AppConfig): ProductSummary[] {
  const summaries = rows
    .map((row) => normalizeProduct(row, config))
    .filter((product): product is ProductSummary => Boolean(product))
    .filter((product) => !isExcludedPath(product.path, config));

  const productLike = summaries.filter(isProductLike);
  const selected = productLike.length ? productLike : summaries;
  return ensureUniqueIds(selected).sort(sortProducts);
}

export function extractRows(payload: unknown): RawIndexRecord[] {
  let rows: unknown;
  if (Array.isArray(payload)) {
    rows = payload;
  } else if (payload && typeof payload === "object" && Array.isArray((payload as Record<string, unknown>).data)) {
    rows = (payload as Record<string, unknown>).data;
  } else if (payload && typeof payload === "object" && Array.isArray((payload as Record<string, unknown>).items)) {
    rows = (payload as Record<string, unknown>).items;
  }

  if (!Array.isArray(rows)) {
    throw new Error("Site index must be an array or an object with a data array.");
  }

  return rows.filter((row): row is RawIndexRecord => Boolean(row) && typeof row === "object");
}

export function assertAllowedWebsiteUrl(value: string, config: AppConfig): URL {
  return resolveSiteUrl(value, config);
}

async function loadIndex(config: AppConfig): Promise<RawIndexRecord[]> {
  const key = config.siteIndexUrl.toString();
  const now = Date.now();
  if (cachedIndex && cachedIndex.key === key && cachedIndex.expiresAt > now) {
    return cachedIndex.rows;
  }

  const payload = await fetchJson(config.siteIndexUrl);
  const rows = extractRows(payload);
  cachedIndex = {
    key,
    rows,
    expiresAt: now + config.indexCacheTtlMs
  };
  return rows;
}

async function fetchJson(url: URL): Promise<unknown> {
  const text = await fetchText(url);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Index endpoint did not return valid JSON: ${url.toString()}`);
  }
}

async function fetchText(url: URL): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: "application/json,text/html;q=0.9,*/*;q=0.8",
        "user-agent": "adobe-app-builder-llm-app-boilerplate/0.1"
      }
    });

    if (!response.ok) {
      throw new Error(`Fetch failed with ${response.status} for ${url.toString()}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeProduct(row: RawIndexRecord, config: AppConfig): ProductSummary | undefined {
  let location: { url: string; path: string } | undefined;
  try {
    location =
      normalizeUrlOrPath(readString(row, ["url", "href", "canonical"]), config) ||
      normalizeUrlOrPath(readString(row, ["path", "pathname", "route"]), config);
  } catch {
    return undefined;
  }

  if (!location) {
    return undefined;
  }

  const title = readString(row, ["title", "name", "productName", "og:title"]);
  if (!title) {
    return undefined;
  }

  const description = readString(row, ["description", "summary", "subtitle", "teaser", "og:description"]) || "";
  const tags = readTags(row);
  const category =
    readString(row, ["category", "productCategory", "section", "audience", "type"]) ||
    tags[0] ||
    "General";
  const image = maybeResolveSiteUrl(readString(row, ["image", "thumbnail", "og:image"]), config);
  const explicitId = slugify(readString(row, ["id", "sku", "slug"]) || "");
  const pathId = slugify(location.path.split("/").filter(Boolean).pop() || "");
  const id = explicitId || pathId || stableId(location.path);

  return {
    id,
    title,
    description: truncateText(description, 280),
    category,
    tags,
    image,
    url: location.url,
    path: location.path,
    lastModified: readString(row, ["lastModified", "modified", "date"])
  };
}

function readString(row: RawIndexRecord | undefined, keys: string[]): string | undefined {
  if (!row) {
    return undefined;
  }

  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }

  return undefined;
}

function readTags(row: RawIndexRecord): string[] {
  const value = row.tags || row.tag || row["article:tag"] || row.keywords;
  if (Array.isArray(value)) {
    return value.map(String).map((tag) => tag.trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    return value.split(/[|,]/).map((tag) => tag.trim()).filter(Boolean);
  }

  return [];
}

function isExcludedPath(path: string, config: AppConfig): boolean {
  const normalized = path.toLowerCase();
  return (
    normalized === config.homepagePath.toLowerCase() ||
    normalized.includes("/nav") ||
    normalized.includes("/footer") ||
    normalized.includes("/fragment") ||
    normalized.includes("/draft")
  );
}

function isProductLike(product: ProductSummary): boolean {
  const text = `${product.path} ${product.category} ${product.tags.join(" ")}`.toLowerCase();
  return /\b(product|products|pdp|offer|offers|plan|plans|card|cards|loan|loans|account|accounts|insurance|service|services)\b/.test(text);
}

function ensureUniqueIds(products: ProductSummary[]): ProductSummary[] {
  const seen = new Map<string, number>();
  return products.map((product) => {
    const count = seen.get(product.id) || 0;
    seen.set(product.id, count + 1);
    if (count === 0) {
      return product;
    }

    return {
      ...product,
      id: `${product.id}-${count + 1}`
    };
  });
}

function sortProducts(left: ProductSummary, right: ProductSummary): number {
  return left.category.localeCompare(right.category) || left.title.localeCompare(right.title);
}

function normalizeFilter(value: string | undefined): string | undefined {
  return value ? value.trim().toLowerCase() : undefined;
}

function matchesCategory(product: ProductSummary, category: string): boolean {
  const candidates = [product.category, ...product.tags].map((value) => value.toLowerCase());
  return candidates.some((candidate) => candidate === category || candidate.includes(category));
}

function matchesQuery(product: ProductSummary, query: string): boolean {
  const haystack = [product.title, product.description, product.category, product.path, ...product.tags].join(" ").toLowerCase();
  return haystack.includes(query);
}

function clampLimit(value: number | undefined, fallback: number, max: number): number {
  if (!value || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(1, Math.min(max, Math.floor(value)));
}

function findProduct(products: ProductSummary[], input: { id?: string; path?: string }): ProductSummary | undefined {
  if (input.id) {
    const id = input.id.toLowerCase();
    const match = products.find((product) => product.id.toLowerCase() === id);
    if (match) {
      return match;
    }
  }

  if (input.path) {
    const path = input.path.startsWith("/") ? input.path : `/${input.path}`;
    return products.find((product) => product.path === path || product.url === input.path);
  }

  return undefined;
}

function uniqueFacts(facts: Array<{ label: string; value: string }>): Array<{ label: string; value: string }> {
  const seen = new Set<string>();
  return facts.filter((fact) => {
    const key = `${fact.label}:${fact.value}`.toLowerCase();
    if (!fact.value || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function findCtaLinks(links: LinkItem[]): LinkItem[] {
  const ctaPattern = /\b(apply|start|get|open|learn|compare|continue|join|sign|details|rates|book|contact)\b/i;
  return links.filter((link) => ctaPattern.test(link.label));
}

function uniqueLinks(links: LinkItem[]): LinkItem[] {
  const seen = new Set<string>();
  return links.filter((link) => {
    if (seen.has(link.url)) {
      return false;
    }
    seen.add(link.url);
    return true;
  });
}

function findHomepageRecord(rows: RawIndexRecord[], config: AppConfig): RawIndexRecord | undefined {
  return rows.find((row) => {
    const path = readString(row, ["path", "pathname", "route"]);
    return path === config.homepagePath;
  });
}

function findHomepageHighlights(links: LinkItem[]): LinkItem[] {
  const highlightPattern = /\b(new|latest|featured|product|offer|card|loan|account|learn|news|update)\b/i;
  const highlighted = links.filter((link) => highlightPattern.test(link.label) || highlightPattern.test(link.url));
  return highlighted.length ? uniqueLinks(highlighted) : uniqueLinks(links);
}
