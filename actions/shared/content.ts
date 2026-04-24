import { AppConfig } from "./types";
import { maybeResolveSiteUrl } from "./url";

export interface ExtractedPage {
  title: string;
  description: string;
  heroText: string;
  sections: Array<{ title: string; text: string }>;
  links: Array<{ label: string; url: string }>;
  jsonLd: unknown[];
}

export function extractPage(html: string, config: AppConfig): ExtractedPage {
  const title =
    extractMetaContent(html, ["og:title", "twitter:title"]) ||
    extractTitleTag(html) ||
    extractFirstHeading(html, 1) ||
    "";
  const description =
    extractMetaContent(html, ["description", "og:description", "twitter:description"]) ||
    extractFirstParagraph(html) ||
    "";
  const sections = extractSections(html, 8);
  const heroText = sections[0]?.text || description;

  return {
    title: compactText(title),
    description: compactText(description),
    heroText: compactText(heroText),
    sections,
    links: extractLinks(html, config),
    jsonLd: extractJsonLd(html)
  };
}

export function extractProductFacts(jsonLd: unknown[]): Array<{ label: string; value: string }> {
  const product = findJsonLdType(jsonLd, "Product");
  if (!product || typeof product !== "object") {
    return [];
  }

  const record = product as Record<string, unknown>;
  const facts: Array<{ label: string; value: string }> = [];
  addFact(facts, "Brand", textValue(record.brand));
  addFact(facts, "Category", textValue(record.category));
  addFact(facts, "SKU", textValue(record.sku));
  addFact(facts, "Rating", ratingValue(record.aggregateRating));
  addFact(facts, "Offer", offerValue(record.offers));
  return facts;
}

export function compactText(value: string): string {
  return decodeHtml(stripTags(value))
    .replace(/\s+/g, " ")
    .trim();
}

export function truncateText(value: string, maxLength: number): string {
  const text = compactText(value);
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}...`;
}

export function stripTags(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ");
}

export function decodeHtml(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " "
  };

  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    const lower = entity.toLowerCase();
    if (lower.startsWith("#x")) {
      return String.fromCodePoint(Number.parseInt(lower.slice(2), 16));
    }
    if (lower.startsWith("#")) {
      return String.fromCodePoint(Number.parseInt(lower.slice(1), 10));
    }
    return named[lower] || match;
  });
}

function extractTitleTag(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? compactText(match[1]) : undefined;
}

function extractFirstHeading(html: string, level: number): string | undefined {
  const match = html.match(new RegExp(`<h${level}[^>]*>([\\s\\S]*?)<\\/h${level}>`, "i"));
  return match ? compactText(match[1]) : undefined;
}

function extractFirstParagraph(html: string): string | undefined {
  const match = html.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  return match ? compactText(match[1]) : undefined;
}

function extractMetaContent(html: string, names: string[]): string | undefined {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const attrs = parseAttributes(tag);
    const key = attrs.name || attrs.property;
    if (!key) {
      continue;
    }

    if (names.some((name) => name.toLowerCase() === key.toLowerCase()) && attrs.content) {
      return attrs.content;
    }
  }

  return undefined;
}

function extractSections(html: string, limit: number): Array<{ title: string; text: string }> {
  const headings = [...html.matchAll(/<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi)].map((match) => ({
    index: match.index || 0,
    end: (match.index || 0) + match[0].length,
    title: compactText(match[2])
  }));

  if (!headings.length) {
    const fallback = extractFirstParagraph(html);
    return fallback ? [{ title: "Summary", text: truncateText(fallback, 600) }] : [];
  }

  const sections: Array<{ title: string; text: string }> = [];
  for (let index = 0; index < headings.length && sections.length < limit; index += 1) {
    const heading = headings[index];
    const next = headings[index + 1]?.index ?? html.length;
    const body = html.slice(heading.end, next);
    const text = extractSectionText(body);
    if (heading.title && text) {
      sections.push({ title: heading.title, text: truncateText(text, 700) });
    }
  }

  return sections;
}

function extractSectionText(html: string): string {
  const fragments = [...html.matchAll(/<(p|li)[^>]*>([\s\S]*?)<\/\1>/gi)]
    .map((match) => compactText(match[2]))
    .filter(Boolean);

  if (fragments.length) {
    return fragments.join(" ");
  }

  return truncateText(html, 700);
}

function extractLinks(html: string, config: AppConfig): Array<{ label: string; url: string }> {
  const links: Array<{ label: string; url: string }> = [];
  const seen = new Set<string>();
  const anchors = html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi);

  for (const anchor of anchors) {
    const attrs = parseAttributes(anchor[1]);
    const label = compactText(anchor[2]);
    const url = maybeResolveSiteUrl(attrs.href, config);

    if (!label || !url || seen.has(url)) {
      continue;
    }

    seen.add(url);
    links.push({ label, url });
  }

  return links;
}

function extractJsonLd(html: string): unknown[] {
  const scripts = html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi);
  const values: unknown[] = [];

  for (const script of scripts) {
    const attrs = parseAttributes(script[1]);
    if (attrs.type !== "application/ld+json") {
      continue;
    }

    try {
      values.push(JSON.parse(script[2].trim()));
    } catch {
      // Ignore invalid JSON-LD; the page can still be summarized from HTML.
    }
  }

  return flattenJsonLd(values);
}

function flattenJsonLd(values: unknown[]): unknown[] {
  const flattened: unknown[] = [];
  for (const value of values) {
    if (Array.isArray(value)) {
      flattened.push(...flattenJsonLd(value));
      continue;
    }

    if (value && typeof value === "object") {
      const record = value as Record<string, unknown>;
      flattened.push(value);
      const graph = record["@graph"];
      if (Array.isArray(graph)) {
        flattened.push(...flattenJsonLd(graph));
      }
    }
  }

  return flattened;
}

function findJsonLdType(values: unknown[], type: string): unknown | undefined {
  return values.find((value) => {
    if (!value || typeof value !== "object") {
      return false;
    }

    const rawType = (value as Record<string, unknown>)["@type"];
    if (Array.isArray(rawType)) {
      return rawType.some((entry) => String(entry).toLowerCase() === type.toLowerCase());
    }

    return String(rawType || "").toLowerCase() === type.toLowerCase();
  });
}

function parseAttributes(fragment: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const matches = fragment.matchAll(/([a-zA-Z_:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g);
  for (const match of matches) {
    attrs[match[1].toLowerCase()] = decodeHtml(match[2] || match[3] || match[4] || "");
  }
  return attrs;
}

function textValue(value: unknown): string | undefined {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return textValue(record.name) || textValue(record.value);
  }

  return undefined;
}

function ratingValue(value: unknown): string | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const rating = textValue(record.ratingValue);
  const count = textValue(record.reviewCount || record.ratingCount);
  if (!rating) {
    return undefined;
  }

  return count ? `${rating} from ${count} reviews` : rating;
}

function offerValue(value: unknown): string | undefined {
  const offer = Array.isArray(value) ? value[0] : value;
  if (!offer || typeof offer !== "object") {
    return undefined;
  }

  const record = offer as Record<string, unknown>;
  const price = textValue(record.price);
  const currency = textValue(record.priceCurrency);
  if (!price) {
    return textValue(record.availability);
  }

  return [currency, price].filter(Boolean).join(" ");
}

function addFact(facts: Array<{ label: string; value: string }>, label: string, value: string | undefined): void {
  if (value) {
    facts.push({ label, value: compactText(value) });
  }
}
