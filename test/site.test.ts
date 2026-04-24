import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { getConfig } from "../actions/shared/config";
import { extractPage, extractProductFacts } from "../actions/shared/content";
import { getHomepageSummary, getProductDetail, listProducts, normalizeProducts } from "../actions/shared/site";
import { assertAllowedWebsiteUrl } from "../actions/shared/site";
import { AppConfig, RuntimeParams } from "../actions/shared/types";

const fixtures = join(process.cwd(), "test", "fixtures");
const indexPayload = JSON.parse(readFileSync(join(fixtures, "index.json"), "utf8"));
const productHtml = readFileSync(join(fixtures, "product.html"), "utf8");
const homeHtml = readFileSync(join(fixtures, "home.html"), "utf8");

function params(): RuntimeParams {
  return {
    SITE_INDEX_URL: "https://www.example.com/query-index.json",
    SITE_BASE_URL: "https://www.example.com",
    HOMEPAGE_PATH: "/",
    INDEX_CACHE_TTL_SECONDS: "1",
    CONVERSATION_URL_TEMPLATE: "https://chat.example/start?product={id}&url={url}"
  };
}

function config(): AppConfig {
  return getConfig(params());
}

test("normalizes products and filters category", () => {
  const products = normalizeProducts(indexPayload.data, config());
  assert.equal(products.length, 2);
  assert.equal(products[0].category, "Credit Cards");
  assert.equal(products[0].image, "https://www.example.com/media/platinum-card.jpg");
});

test("blocks cross-origin website URL fetches", () => {
  assert.throws(() => assertAllowedWebsiteUrl("https://evil.example/path", config()), /Blocked cross-origin/);
});

test("extracts page sections and JSON-LD product facts", () => {
  const page = extractPage(productHtml, config());
  const facts = extractProductFacts(page.jsonLd);
  assert.equal(page.title, "Platinum Rewards Card");
  assert.equal(page.sections.length, 3);
  assert.ok(facts.some((fact) => fact.label === "SKU" && fact.value === "CARD-PLATINUM"));
  assert.ok(page.links.some((link) => link.label === "Apply now"));
  assert.ok(!page.links.some((link) => link.url.includes("evil.example")));
});

test("lists products through mocked index fetch", async () => {
  mockFetch({
    "https://www.example.com/query-index.json": JSON.stringify(indexPayload)
  });

  const products = await listProducts(config(), { category: "credit cards" });
  assert.equal(products.length, 1);
  assert.equal(products[0].title, "Platinum Rewards Card");
});

test("fetches product detail with sections, facts, and deep links", async () => {
  mockFetch({
    "https://www.example.com/query-index.json": JSON.stringify(indexPayload),
    "https://www.example.com/products/platinum-rewards-card": productHtml
  });

  const product = await getProductDetail(config(), { id: "platinum-rewards-card" });
  assert.equal(product.title, "Platinum Rewards Card");
  assert.ok(product.facts.some((fact) => fact.label === "SKU"));
  assert.ok(product.deepLinks.some((link) => link.label === "Continue conversation"));
});

test("summarizes homepage through mocked homepage fetch", async () => {
  mockFetch({
    "https://www.example.com/query-index.json": JSON.stringify(indexPayload),
    "https://www.example.com/": homeHtml
  });

  const summary = await getHomepageSummary(config());
  assert.equal(summary.title, "SecurBank");
  assert.ok(summary.sections.some((section) => section.title === "New rewards card"));
  assert.ok(summary.highlights.some((link) => link.label === "New rewards card"));
});

function mockFetch(routes: Record<string, string>): void {
  globalThis.fetch = async (input: URL | RequestInfo) => {
    const url = input instanceof URL ? input.toString() : typeof input === "string" ? input : input.url;
    const body = routes[url];
    if (body == null) {
      return new Response("Not found", { status: 404 });
    }
    return new Response(body, { status: 200 });
  };
}
